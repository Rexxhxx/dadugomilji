'use strict';

/** Callback tombol klaim bonus win streak di pesan hasil ronde. */

const { Composer } = require('grammy');
const { users } = require('../../database');
const { calculateWsBonus } = require('../../game/streak');
const { answer, editCallbackRich } = require('../../ui/rich');
const keyboards = require('../../ui/keyboards');
const msg = require('../../ui/messages/account');

const composer = new Composer();

composer.callbackQuery(/^claimws_(\d+)$/, async (ctx) => {
  const targetId = Number(ctx.match[1]);
  if (ctx.from.id !== targetId) return answer(ctx, 'Hanya pemain yang memiliki streak yang bisa mengklaim bonus ini!', true);

  // Klaim atomik SEBELUM await apa pun, supaya klik ganda tidak bayar dua kali.
  const claimed = users.claimStreakBonus(targetId, 3, calculateWsBonus);
  if (!claimed) return answer(ctx, 'Tidak ada Bonus buat di Claim', true);

  await answer(ctx);
  return editCallbackRich(ctx, msg.winStreakClaimed({
    name: ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name,
    streak: claimed.streak,
    bonus: claimed.bonus,
    balance: users.getBalance(targetId),
  }), { reply_markup: keyboards.none() });
});

module.exports = composer;
