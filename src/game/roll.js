'use strict';

const { ROLL_COOLDOWN_SECONDS } = require('../config');
const { users } = require('../database');
const { gameState, pendingRollConfirm, totalK, totalB } = require('./state');
const { startRound, betListMarkdown } = require('./engine');
const table = require('./table');
const { replyRich, safeSend } = require('../ui/rich');
const keyboards = require('../ui/keyboards');
const msg = require('../ui/messages/game');

const CONFIRM_TIMEOUT_MS = 30000;

function scheduleConfirmTimeout(ctx, userId) {
  return setTimeout(async () => {
    const chatId = ctx.chat.id;
    const conf = pendingRollConfirm[chatId];
    if (!conf || conf.userId !== userId) return;
    delete pendingRollConfirm[chatId];

    if (conf.msgId) {
      await safeSend(
        () => ctx.api.editMessageReplyMarkup(chatId, conf.msgId, { reply_markup: keyboards.none() }),
        'hapus tombol konfirmasi',
      );
    }

    const k = totalK();
    const b = totalB();
    if (!table.isBalanced(k, b)) await replyRich(ctx, msg.rekap({ totalK: k, totalB: b }));
  }, CONFIRM_TIMEOUT_MS);
}

async function handleRollRequest(ctx) {
  const chatId = ctx.chat.id;
  if (gameState.is_rolling) return replyRich(ctx, msg.rolling());
  if (!gameState.is_game_open) return replyRich(ctx, msg.tableClosed());
  if (pendingRollConfirm[chatId]) return replyRich(ctx, msg.waitingConfirm());

  const k = totalK();
  const b = totalB();
  if (k === 0 && b === 0) return replyRich(ctx, msg.noBets());

  const remaining = table.cooldownRemaining(ROLL_COOLDOWN_SECONDS);
  if (remaining > 0) return replyRich(ctx, msg.cooldown(remaining));

  if (table.isBalanced(k, b) && k > 0) {
    gameState.is_rolling = true;
    return startRound(ctx.api, chatId);
  }

  const userId = ctx.from.id;
  const heavierSide = k > b ? 'K' : 'B';
  const lighterSide = table.oppositeSide(heavierSide);
  const diff = table.round2(Math.abs(k - b));
  const userBetOnHeavier = table.userTotal(heavierSide, userId);

  if (userBetOnHeavier >= diff) {
    table.trimUserBet(heavierSide, userId, diff);
    users.addBalance(userId, diff);
    gameState.is_rolling = true;
    await replyRich(ctx, msg.autoBalance({
      name: ctx.from.first_name,
      side: heavierSide,
      diff,
      balance: users.getBalance(userId),
    }));
    return startRound(ctx.api, chatId);
  }

  const balance = users.getBalance(userId);
  if (balance < diff) return replyRich(ctx, msg.fillInsufficient({ balance, diff, side: lighterSide }));

  const conf = {
    userId,
    userName: String(ctx.from.first_name || 'Pemain').toUpperCase(),
    side: lighterSide,
    diff,
    msgId: null,
    timer: scheduleConfirmTimeout(ctx, userId),
  };
  pendingRollConfirm[chatId] = conf;

  const sent = await replyRich(ctx, msg.fillConfirm({
    listMarkdown: betListMarkdown(),
    side: lighterSide,
    diff,
    name: ctx.from.first_name,
  }), { reply_markup: keyboards.rollConfirm(userId) });
  conf.msgId = sent?.message_id ?? null;

  return sent;
}

module.exports = { handleRollRequest, CONFIRM_TIMEOUT_MS };