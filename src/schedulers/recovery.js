'use strict';

/** Pemulihan saat start: lanjutkan polling deposit & refund taruhan yang tertinggal. */

const { deposits, gameState: gameStateRepo } = require('../database');
const { gameState, clearTable } = require('../game/state');
const { startDepositPolling, POLL_INTERVAL_MS, MAX_ATTEMPTS } = require('../services/depositPolling.service');
const { sendRich } = require('../ui/rich');
const gameMsg = require('../ui/messages/game');

/** created_at SQLite disimpan UTC tanpa zona: "YYYY-MM-DD HH:MM:SS". */
const parseSqliteUtc = (value) => (value ? Date.parse(`${value.replace(' ', 'T')}Z`) : NaN);

function resumePendingDeposits(api) {
  const metas = deposits.getPendingDepositMetas();
  if (!metas.length) return;
  console.log(`🔁 Melanjutkan ${metas.length} polling deposit yang tertunda...`);

  for (const m of metas) {
    const elapsedTicks = Math.floor((Date.now() - parseSqliteUtc(m.created_at)) / POLL_INTERVAL_MS);
    // Maks MAX_ATTEMPTS-1 supaya invoice lama tetap dicek minimal sekali ke
    // provider sebelum ditandai expired (bisa saja sudah dibayar saat bot mati).
    const startAttempt = Number.isFinite(elapsedTicks) && elapsedTicks > 0
      ? Math.min(MAX_ATTEMPTS - 1, elapsedTicks)
      : 0;

    startDepositPolling(api, {
      reference: m.reference,
      chatId: m.chat_id,
      userId: m.user_id,
      userName: m.user_name,
      provider: m.provider,
      coins: m.coins,
      amount: m.amount,
      bonusCoin: m.bonus_coin,
      invoiceMsgId: m.invoice_msg_id,
    }, startAttempt);
  }
}

/** Taruhan di snapshot DB saat start = ronde yang terputus; kembalikan semua koinnya. */
async function refundPendingBetsOnStart(api) {
  const { betsK, betsB, chatId } = gameStateRepo.loadPendingBets();
  const allBets = [...betsK, ...betsB];
  if (!allBets.length) {
    gameStateRepo.clearPendingBets();
    return;
  }

  const { entries, total } = gameStateRepo.refundBetsAtomic(allBets);
  clearTable();
  gameState.is_rolling = false;
  console.log(`💸 Refund ${entries.length} pemain (${total.toFixed(2)} koin) dari taruhan meja yang tertunda.`);

  if (chatId && entries.length) {
    await sendRich(api, chatId, gameMsg.restartRefund({ total, players: entries.length }));
  }
}

module.exports = { resumePendingDeposits, refundPendingBetsOnStart };
