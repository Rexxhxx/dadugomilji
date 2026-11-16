'use strict';

/** Perintah pembuka alur deposit (`deposit`/`depo`) dan withdraw (`tarik`/`wd`). */

const { Composer } = require('grammy');
const { env } = require('../../config');
const { users } = require('../../database');
const { userSessions } = require('../../game/state');
const { isWithdrawMaintenance, maintenanceWindow } = require('../../services/withdraw.service');
const { replyRich } = require('../../ui/rich');
const keyboards = require('../../ui/keyboards');
const msg = require('../../ui/messages/payment');

const composer = new Composer();

const MEMBER_STATUSES = ['creator', 'administrator', 'member'];

async function isChannelMember(api, userId) {
  try {
    const member = await api.getChatMember(env.requiredChannelUsername, userId);
    return MEMBER_STATUSES.includes(member.status);
  } catch (err) {
    console.error('Gagal cek member channel:', err?.message || err);
    return false;
  }
}

composer.hears(/^\/?(deposit|depo)$/i, (ctx) => {
  if (ctx.chat.type !== 'private') return replyRich(ctx, msg.depositPrivateOnly());
  userSessions[ctx.from.id] = { step: 'DEP_AMOUNT' };
  return replyRich(ctx, msg.depositIntro());
});

composer.hears(/^\/?(tarik|wd)$/i, async (ctx) => {
  if (ctx.chat.type !== 'private') return replyRich(ctx, msg.withdrawPrivateOnly());
  if (isWithdrawMaintenance()) return replyRich(ctx, msg.withdrawMaintenance(maintenanceWindow()));

  if (!(await isChannelMember(ctx.api, ctx.from.id))) {
    return replyRich(ctx, msg.withdrawMustJoin(), { reply_markup: keyboards.joinChannel() });
  }

  const info = users.getTurnoverInfo(ctx.from.id);
  if (info.progress < info.target) return replyRich(ctx, msg.withdrawTurnoverNotMet(info));
  if (info.balance < env.minWithdrawCoin) return replyRich(ctx, msg.withdrawMinimum());

  return replyRich(ctx, msg.withdrawChooseMethod(), { reply_markup: keyboards.withdrawMethods() });
});

module.exports = composer;
