'use strict';

/** Perintah owner berbentuk satu kata: panel admin & statistik. */

const { Composer } = require('grammy');
const { users } = require('../../database');
const { gameState } = require('../../game/state');
const { isMainOwner } = require('../../utils/auth');
const { replyRich } = require('../../ui/rich');
const msg = require('../../ui/messages/owner');

const composer = new Composer();

composer.hears(/^\/?(admin|panel)$/i, (ctx) => {
  if (!isMainOwner(ctx.from?.id)) return replyRich(ctx, msg.accessDenied());
  return replyRich(ctx, msg.panel());
});

composer.hears(/^\/?stats$/i, (ctx) => {
  if (!isMainOwner(ctx.from?.id)) return undefined;
  const all = users.getAllUsers();
  const totalCoins = all.reduce((sum, u) => sum + (parseFloat(u.balance) || 0), 0);
  return replyRich(ctx, msg.stats({
    totalUsers: all.length,
    totalCoins,
    gameId: gameState.game_id,
  }));
});

module.exports = composer;
