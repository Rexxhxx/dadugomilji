'use strict';

/**
 * Entry point. Urutan require penting: database harus di-init sebelum modul
 * game/state dimuat, karena state membaca game_state dari DB saat require.
 */

const { initDb } = require('./database');

initDb();

const axios = require('axios');
const { Api } = require('grammy');
const { run } = require('@grammyjs/runner');
const { env } = require('./config');
const { ROLE, registerSlashMenu } = require('./handlers/routing');
const { setRoundApi } = require('./game/engine');
const { createBot } = require('./bot');
const { refundPendingBetsOnStart, resumePendingDeposits } = require('./schedulers/recovery');
const { settleLeaderboardIfNewDay, startLeaderboardScheduler } = require('./schedulers/leaderboard');
const { sendDbBackup, startBackupScheduler } = require('./schedulers/backup');
const { checkPendingWithdraws, startWithdrawStatusScheduler } = require('./schedulers/withdrawStatus');
const { startMemberTagScheduler } = require('./services/memberTag.service');

const logError = (label) => (err) => console.error(label, err?.message || err);

function logPublicIp() {
  axios.get('https://api.ipify.org?format=json', { timeout: 10000 })
    .then((res) => console.log(`🌐 IP publik server: ${res.data.ip}`))
    .catch(logError('⚠️ Gagal membaca IP publik:'));
}

async function onStart(bot) {
  console.log(`🚀 BOT DADUGO MILJI ONLINE sebagai @${bot.botInfo.username} (By:AutoFtbot69)`);

  await refundPendingBetsOnStart(bot.api).catch(logError('⚠️ Refund taruhan saat start gagal:'));
  resumePendingDeposits(bot.api);

  // Catch-up kalau bot mati melewati tengah malam.
  settleLeaderboardIfNewDay(bot.api).catch(logError('⚠️ Settle leaderboard gagal:'));
  startLeaderboardScheduler(bot.api);

  sendDbBackup(bot.api).catch(logError('⚠️ Backup awal gagal:'));
  startBackupScheduler(bot.api);

  checkPendingWithdraws(bot.api);
  startWithdrawStatusScheduler(bot.api);

  startMemberTagScheduler();
}

function main() {
  console.log('⏳ Memulai inisialisasi bot DaduGo MILJI...');
  logPublicIp();

  // Error tak terduga hanya di-log agar bot tetap online; state permanen ada
  // di DB sehingga restart manual tetap bisa memulihkan kondisi.
  process.on('unhandledRejection', logError('⚠️ Unhandled Rejection (bot tetap jalan):'));
  process.on('uncaughtException', logError('⚠️ Uncaught Exception (bot tetap jalan):'));

  start().catch((err) => {
    console.error('❌ GAGAL START BOT:', err);
    process.exit(1);
  });
}

/** Satu bot: init, buang update lama, lalu jalankan runner paralel. */
async function prepare(bot) {
  await bot.init();
  await bot.api.deleteWebhook({ drop_pending_updates: true });
}

// Runner sendiri mencetak stack trace penuh tiap getUpdates gagal (502, timeout).
// Error itu dicoba ulang otomatis, jadi cukup satu baris log.
function logFetchErrorsOneLine(bot) {
  bot.api.config.use(async (prev, method, payload, signal) => {
    try {
      return await prev(method, payload, signal);
    } catch (err) {
      if (method === 'getUpdates' && !signal?.aborted) {
        const reason = err?.error_code ? `${err.error_code} ${err.description}` : (err?.message || err);
        console.warn(`⚠️ [@${bot.botInfo.username}] getUpdates gagal (${reason}), mencoba ulang...`);
      }
      throw err;
    }
  });
}

const runBot = (bot) => {
  logFetchErrorsOneLine(bot);
  return run(bot, {
    runner: { fetch: { allowed_updates: ['message', 'callback_query', 'my_chat_member'] }, silent: true },
    sink: { concurrency: 500 },
  });
};

/**
 * Runner grammY: update diproses paralel (bukan satu per satu seperti bot.start),
 * jadi ronde yang sedang berjalan / API lambat tidak membuat pemain lain menunggu.
 *
 * Mode dua bot (BOT_TOKEN_B diisi): bot A dan B berbagi DB & meja yang sama
 * dalam satu proses. Tugas latar (refund, polling deposit, leaderboard, backup)
 * hanya dijalankan sekali lewat bot A.
 */
async function start() {
  if (!env.botTokenB) {
    const bot = createBot();
    await prepare(bot);
    await registerSlashMenu(bot.api, ROLE.ALL);
    await onStart(bot); // refund meja & resume deposit SEBELUM update baru diproses
    stopOnSignal([runBot(bot)]);
    return;
  }

  // Username pasangan dibutuhkan untuk petunjuk "perintah ada di @bot lain",
  // jadi ambil getMe kedua token dulu sebelum membuat bot.
  const [infoA, infoB] = await Promise.all([
    new Api(env.botToken).getMe(),
    new Api(env.botTokenB).getMe(),
  ]);
  const botA = createBot({ token: env.botToken, role: ROLE.A, otherUsername: infoB.username });
  const botB = createBot({ token: env.botTokenB, role: ROLE.B, otherUsername: infoA.username });
  botA.botInfo = infoA;
  botB.botInfo = infoB;

  await Promise.all([prepare(botA), prepare(botB)]);
  await Promise.all([registerSlashMenu(botA.api, ROLE.A), registerSlashMenu(botB.api, ROLE.B)]);
  setRoundApi(botA.api);
  await onStart(botA);
  console.log(`🤝 Mode dua bot: A=@${infoA.username}, B=@${infoB.username}`);

  stopOnSignal([runBot(botA), runBot(botB)]);
}

function stopOnSignal(runners) {
  const stop = () => runners.forEach((r) => { if (r.isRunning()) r.stop(); });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main();
