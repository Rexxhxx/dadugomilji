'use strict';

/** Membuat instance Bot grammY beserta error boundary global. */

const { Bot, GrammyError, HttpError } = require('grammy');
const { sequentialize } = require('@grammyjs/runner');
const { env } = require('./config');
const handlers = require('./handlers');
const { ROLE, commandFilter } = require('./handlers/routing');
const { devBan } = require('./handlers/devBan');
const settingRoll = require('./handlers/settingRoll');

// Update diproses paralel (runner); update dari PEMAIN YANG SAMA tetap berurutan
// supaya wizard deposit/withdraw & klik ganda tidak saling balapan. SATU instance
// dipakai bersama kedua bot: `r` di bot A dan `k 5` di bot B dari pemain yang
// sama juga diantrikan, bukan jalan berbarengan.
const perUser = sequentialize((ctx) => (ctx.from ? String(ctx.from.id) : undefined));

/**
 * @param {object} [opts]
 * @param {string} [opts.token]  default BOT_TOKEN
 * @param {'A'|'B'|'ALL'} [opts.role]  pembagian perintah (lihat handlers/routing.js)
 * @param {string} [opts.otherUsername]  username bot pasangan, untuk petunjuk di chat privat
 */
function createBot({ token = env.botToken, role = ROLE.ALL, otherUsername } = {}) {
  const bot = new Bot(token);

  bot.use(settingRoll);
  bot.use(devBan(role));
  bot.use(perUser);
  bot.use(commandFilter(role, otherUsername));
  bot.use(handlers);

  bot.catch((err) => {
    const updateId = err.ctx?.update?.update_id;
    const e = err.error;
    if (e instanceof GrammyError) {
      console.error(`❌ Telegram API error (update ${updateId}):`, e.description);
    } else if (e instanceof HttpError) {
      console.error(`❌ Gagal menghubungi Telegram (update ${updateId}):`, e.message);
    } else {
      console.error(`❌ Error tak terduga (update ${updateId}):`, e);
    }
  });

  return bot;
}

module.exports = { createBot };
