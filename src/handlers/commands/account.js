'use strict';

const { Composer } = require('grammy');
const { users, cashback, bets } = require('../../database');
const { calculateWsBonus } = require('../../game/streak');
const { activeAngpaos } = require('../../game/state');
const { replyRich, replyRichPlainReply } = require('../../ui/rich');
const msg = require('../../ui/messages/account');
const { getWibHour } = require('../../utils/time');
const { settleLeaderboardIfNewDay } = require('../../schedulers/leaderboard');
const { isMainOwner } = require('../../utils/auth');

const composer = new Composer();

const CASHBACK_OPEN_HOUR = 18;
const LEADERBOARD_TARGET_WINS = 10;

const command = (pattern, handler) => composer.hears(pattern, handler);

const menuOpts = (ctx) => ({
  role: ctx.botRole || 'ALL',
  me: ctx.me?.username,
  other: ctx.otherBot,
  isOwner: isMainOwner(ctx.from.id),
});

command(/^\/?start(?:\s+\S+)?$/i, (ctx) => {
  if (ctx.botRole === 'B') return replyRichPlainReply(ctx, msg.commandMenu(menuOpts(ctx)));
  return replyRichPlainReply(ctx, msg.start({
    user: { first_name: ctx.from.first_name, id: ctx.from.id },
    balance: users.getBalance(ctx.from.id),
    cashback: cashback.getCashback(ctx.from.id),
    menu: menuOpts(ctx),
  }));
});

command(/^\/?(menu|help|perintah)$/i, (ctx) => replyRich(ctx, msg.commandMenu(menuOpts(ctx))));
command(/^\/?(bondep|bonusdepo)$/i, (ctx) => replyRich(ctx, msg.bondep()));

command(/^\/?saldo$/i, (ctx) => replyRich(ctx, msg.saldo({
  user: ctx.from,
  balance: users.getBalance(ctx.from.id),
  cashback: cashback.getCashback(ctx.from.id),
})));

command(/^\/?to$/i, (ctx) => replyRich(ctx, msg.turnover(users.getTurnoverInfo(ctx.from.id))));

command(/^\/?cashback$/i, (ctx) => replyRich(ctx, msg.cashbackInfo({
  amount: cashback.getCashback(ctx.from.id),
  alreadyClaimed: cashback.hasClaimedCashbackToday(ctx.from.id),
})));

command(/^\/?(claimcb|claimcashback|klaimcb|klaimcashback)$/i, (ctx) => {
  const userId = ctx.from.id;
  if (getWibHour() < CASHBACK_OPEN_HOUR) return replyRich(ctx, msg.cashbackNotOpen());
  if (cashback.hasClaimedCashbackToday(userId)) return replyRich(ctx, msg.cashbackAlreadyClaimed());

  const claimed = cashback.claimUserCashback(userId);
  if (claimed <= 0) return replyRich(ctx, msg.cashbackInfo({ amount: 0, alreadyClaimed: false }));
  return replyRich(ctx, msg.cashbackClaimed(claimed));
});

command(/^\/?(ws|statusws)$/i, (ctx) => {
  const info = users.getStreakInfo(ctx.from.id);
  return replyRich(ctx, msg.winStreak({ user: ctx.from, info, bonus: calculateWsBonus(info.streak) }));
});

command(/^\/?(claimws|klaimws)$/i, (ctx) => {
  const userId = ctx.from.id;
  const claimed = users.claimStreakBonus(userId, 3, calculateWsBonus);
  if (!claimed) return replyRich(ctx, msg.winStreakEmpty());
  return replyRich(ctx, msg.winStreakClaimed({
    name: ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name,
    streak: claimed.streak,
    bonus: claimed.bonus,
    balance: users.getBalance(userId),
  }));
});

command(/^\/?riwayat$/i, (ctx) => replyRich(ctx, msg.history(bets.getUserBetHistory(ctx.from.id, 10))));

command(/^\/?(listangpao|listap)$/i, (ctx) => replyRich(ctx, msg.angpaoList(activeAngpaos)));

command(/^\/?lb$/i, async (ctx) => {
  try {
    await settleLeaderboardIfNewDay(ctx.api);
  } catch (err) {
    console.error('Settle leaderboard gagal:', err?.message || err);
  }
  const me = users.getUserById(ctx.from.id);
  return replyRich(ctx, msg.leaderboard({
    userWins: me?.total_wins || 0,
    targetWins: LEADERBOARD_TARGET_WINS,
    top: users.getLeaderboardTop5(),
  }));
});

command(/^\/?lbm$/i, async (ctx) => {
  try {
    await settleLeaderboardIfNewDay(ctx.api);
  } catch (err) {
    console.error('Settle leaderboard gagal:', err?.message || err);
  }
  const me = users.getUserById(ctx.from.id);
  return replyRich(ctx, msg.weeklyLeaderboard({
    weeklyWins: me?.weekly_wins || 0,
    weeklyTop: users.getWeeklyTop(3),
  }));
});

command(/^\/?owner$/i, (ctx) => replyRich(ctx, msg.ownerContact()));

module.exports = composer;