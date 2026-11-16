'use strict';

/**
 * Router pesan teks bebas. Urutan pengecekan mengikuti bot lama karena
 * beberapa pola saling tumpang tindih (mis. kata kunci angpao vs perintah).
 */

const { Composer } = require('grammy');
const { handleSession } = require('./session');
const angpao = require('./angpao');
const { handleOwnerCommand } = require('./owner');
const bets = require('./bets');
const { handleRollRequest } = require('../../game/roll');
const { replyRich } = require('../../ui/rich');
const msg = require('../../ui/messages/game');

const ROLL_COMMAND = /^\/?(r|roll)$/i;
const isTableAction = (text) => ROLL_COMMAND.test(text) || bets.isTableCommand(text);
/** Perintah grup yang ditolak di chat pribadi (meja cuma satu, milik grup); hanya kalau formatnya benar. */
const isGroupOnlyCommand = (text) => isTableAction(text)
  || /^\/?geser\s+(?:@\w+\s+)?[0-9]+(?:[.,][0-9]+)?$/i.test(text)
  || angpao.isCreateCommand(text);

const composer = new Composer();

composer.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  const lower = text.toLowerCase();

  if (ctx.chat.type === 'private') {
    if (await handleSession(ctx, text)) return;
    if (isGroupOnlyCommand(text)) {
      await replyRich(ctx, msg.groupOnly());
      return;
    }
  }
  if (await angpao.tryReset(ctx, text)) return;
  if (await angpao.tryClaim(ctx, lower)) return;

  if (ROLL_COMMAND.test(text)) {
    await handleRollRequest(ctx);
    return;
  }
  if (isTableAction(text) && bets.isTableLocked(ctx.chat.id)) {
    await replyRich(ctx, msg.diceSpinning());
    return;
  }

  if (await handleOwnerCommand(ctx, text)) return;
  if (await angpao.tryCreate(ctx, text)) return;
  if (await bets.tryTransfer(ctx, text)) return;
  if (await bets.tryMove(ctx, text)) return;
  if (await bets.tryReduce(ctx, text)) return;
  await bets.tryBet(ctx, text);
});

module.exports = composer;
