'use strict';

const { Composer } = require('grammy');
const { gameState: gameStateRepo } = require('../../database');
const {
  gameState,
  totalK,
  totalB,
  clearTable,
  clearAllRollConfirms,
  clearRollConfirm,
} = require('../../game/state');
const { betListMarkdown } = require('../../game/engine');
const { isMainOwner } = require('../../utils/auth');
const { replyRich } = require('../../ui/rich');
const msg = require('../../ui/messages/game');

// Pastikan Anda mengimpor handler taruhan (jika ada di file terpisah)
// Jika logika taruhan ada di file ini, pastikan Anda mengimpornya.
const { processBet } = require('../../game/betting'); // <-- SESUAIKAN DENGAN FILE ANDA

const composer = new Composer();

// -----------------------------------------------------
// FITUR TARUHAN KECIL / BESAR (FIX TIDAK MERESPON)
// -----------------------------------------------------
// Mendeteksi: /b1, b1, /b 1, /besar 1, /k1, k1, /kecil 1, dll
composer.hears(/^\/?(?:b|besar)\s*(\d+(?:[.,]\d+)?)$/i, async (ctx) => {
  if (ctx.chat.type === 'private') return replyRich(ctx, msg.groupOnly());
  const amount = parseFloat(ctx.match[1].replace(',', '.'));
  return processBet(ctx, 'B', amount);
});

composer.hears(/^\/?(?:k|kecil)\s*(\d+(?:[.,]\d+)?)$/i, async (ctx) => {
  if (ctx.chat.type === 'private') return replyRich(ctx, msg.groupOnly());
  const amount = parseFloat(ctx.match[1].replace(',', '.'));
  return processBet(ctx, 'K', amount);
});

// -----------------------------------------------------
// FITUR MEJA & ADMIN
// -----------------------------------------------------

composer.hears(/^\/?rekap$/i, (ctx) => (ctx.chat.type === 'private'
  ? replyRich(ctx, msg.groupOnly())
  : replyRich(ctx, msg.rekap({ totalK: totalK(), totalB: totalB() }))));

composer.hears(/^\/?(list|ls)$/i, (ctx) => (ctx.chat.type === 'private'
  ? replyRich(ctx, msg.groupOnly())
  : replyRich(ctx, betListMarkdown())));

composer.hears(/^\/?(resetmeja|resetbet)$/i, (ctx) => {
  if (!isMainOwner(ctx.from.id)) return replyRich(ctx, msg.ownerOnly());

  const bets = [...gameState.bets_k, ...gameState.bets_b];
  const names = {};
  for (const b of bets) if (b.user_id > 0) names[b.user_id] = b.name;

  clearTable();
  gameState.is_rolling = false;
  gameState.epoch += 1;
  clearAllRollConfirms();

  const { entries, total } = gameStateRepo.refundBetsAtomic(bets);
  return replyRich(ctx, msg.resetTable({ entries, total, names }));
});

composer.hears(/^\/?(resetlw|resetgame)$/i, (ctx) => {
  if (!isMainOwner(ctx.from.id)) return replyRich(ctx, msg.ownerOnly());

  gameState.game_id = 1;
  gameState.last_wins = [];
  gameState.last_win_msg_id = null;
  gameState.is_rolling = false;
  clearTable();
  clearRollConfirm(ctx.chat.id);
  gameStateRepo.resetDbGameState();

  return replyRich(ctx, msg.resetLw());
});

composer.hears(/^\/?(out|leave|keluar)$/i, async (ctx) => {
  if (ctx.chat.type === 'private') return replyRich(ctx, msg.groupOnly());
  if (!isMainOwner(ctx.from.id)) return replyRich(ctx, msg.ownerOnly());

  await replyRich(ctx, msg.leaveGroup());
  return ctx.leaveChat().catch((err) => console.error('Gagal keluar grup:', err?.message || err));
});

module.exports = composer;