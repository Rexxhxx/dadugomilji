'use strict';

/** Callback konfirmasi isi-selisih sebelum roll (`c_roll_` / `x_roll_`). */

const { Composer } = require('grammy');
const { users } = require('../../database');
const { gameState, pendingRollConfirm, totalK, totalB } = require('../../game/state');
const { startRound } = require('../../game/engine');
const table = require('../../game/table');
const { answer, editCallbackRich, sendRich } = require('../../ui/rich');
const keyboards = require('../../ui/keyboards');
const msg = require('../../ui/messages/game');

const composer = new Composer();

composer.callbackQuery(/^c_roll_(\d+)$/, async (ctx) => {
  const targetId = Number(ctx.match[1]);
  if (ctx.from.id !== targetId) return answer(ctx, 'Hanya peminta Roll yang bisa konfirmasi!', true);

  const chatId = ctx.chat.id;
  const conf = pendingRollConfirm[chatId];
  if (!conf || conf.userId !== targetId) {
    await answer(ctx);
    return editCallbackRich(ctx, msg.fillExpired(), { reply_markup: keyboards.none() });
  }

  if (conf.timer) clearTimeout(conf.timer);
  // Kunci meja sebelum potong saldo supaya tidak ada taruhan masuk di sela-sela.
  gameState.is_rolling = true;
  await answer(ctx);

  if (!users.removeBalance(targetId, conf.diff)) {
    delete pendingRollConfirm[chatId];
    gameState.is_rolling = false;
    return editCallbackRich(ctx, msg.fillBalanceFailed(), { reply_markup: keyboards.none() });
  }

  table.addBet(conf.side, { userId: targetId, name: conf.userName, amount: conf.diff });
  delete pendingRollConfirm[chatId];

  await editCallbackRich(ctx, msg.fillConfirmed({
    name: conf.userName,
    diff: conf.diff,
    side: conf.side,
  }), { reply_markup: keyboards.none() });

  return startRound(ctx.api, chatId);
});

composer.callbackQuery(/^x_roll_(\d+)$/, async (ctx) => {
  const targetId = Number(ctx.match[1]);
  if (ctx.from.id !== targetId) return answer(ctx, msg.notYourSession(), true);

  const chatId = ctx.chat.id;
  const conf = pendingRollConfirm[chatId];
  if (conf?.timer) clearTimeout(conf.timer);
  delete pendingRollConfirm[chatId];

  await answer(ctx);
  await editCallbackRich(ctx, msg.fillCancelled(), { reply_markup: keyboards.none() });

  const k = totalK();
  const b = totalB();
  if (!table.isBalanced(k, b)) await sendRich(ctx.api, chatId, msg.rekap({ totalK: k, totalB: b }));
});

module.exports = composer;
