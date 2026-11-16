'use strict';

/** Callback alur withdraw: pilih e-wallet, konfirmasi, batal. */

const { Composer } = require('grammy');
const { COIN_PRICE, PRIZE_TO_RATIO } = require('../../config');
const { users, transactions } = require('../../database');
const { userSessions } = require('../../game/state');
const {
  WITHDRAW_METHODS,
  calculateWithdrawBonus,
  isWithdrawMaintenance,
  maintenanceWindow,
  getWithdrawFee,
  getProductCodeByMethod,
  processOkeconnectWD,
} = require('../../services/withdraw.service');
const { sendTestimoni } = require('../../services/testimoni.service');
const { answer, editCallbackRich, replyRich } = require('../../ui/rich');
const keyboards = require('../../ui/keyboards');
const msg = require('../../ui/messages/payment');

const composer = new Composer();
const round2 = (v) => parseFloat(v.toFixed(2));

composer.callbackQuery(/^wd_(DANA|GOPAY|OVO|SP)$/, async (ctx) => {
  if (isWithdrawMaintenance()) {
    await answer(ctx, 'Penarikan sedang ditutup (maintenance).', true);
    return editCallbackRich(ctx, msg.withdrawMaintenance(maintenanceWindow()), { reply_markup: keyboards.none() });
  }

  const method = WITHDRAW_METHODS[ctx.match[1]].label;
  userSessions[ctx.from.id] = { step: 'WD_ACCOUNT', method, fee: getWithdrawFee(ctx.match[1]) };
  await answer(ctx);
  return editCallbackRich(ctx, msg.withdrawAskPhone(method), { reply_markup: keyboards.none() });
});

composer.callbackQuery('wd_yes', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions[userId];
  if (!session || session.step !== 'WD_CONFIRM') return answer(ctx, msg.withdrawSessionExpired(), true);

  const done = (markdown) => {
    delete userSessions[userId];
    return editCallbackRich(ctx, markdown, { reply_markup: keyboards.none() });
  };

  if (isWithdrawMaintenance()) {
    await answer(ctx, 'Penarikan sedang ditutup (maintenance).', true);
    return done(msg.withdrawMaintenance(maintenanceWindow()));
  }

  const { method, account, coins, fee } = session;
  const total = round2(coins + fee);
  const rupiahAmount = Math.floor(coins * COIN_PRICE);
  const refId = `WD-${userId}-${Date.now()}`;

  const info = users.getTurnoverInfo(userId);
  if (info.progress < info.target) return done('Penarikan gagal: Target TO belum terpenuhi.');
  // Saldo ditahan (dipotong) SEBELUM memanggil provider. Kalau dipotong setelahnya,
  // pemain bisa `geser`/bet saldonya selagi menunggu: uang terkirim, potongan gagal.
  if (!users.removeBalance(userId, total)) return done('Saldo tidak cukup saat eksekusi.');

  delete userSessions[userId];
  let providerAnswered = false;

  try {
    await answer(ctx, 'Mengirim penarikan otomatis ke server H2H...');
    await editCallbackRich(ctx, msg.withdrawSending({ method, account }), { reply_markup: keyboards.none() });

    const result = await processOkeconnectWD(getProductCodeByMethod(method), account, rupiahAmount, refId);
    providerAnswered = true;

    // Hanya penolakan tegas yang dikembalikan; pending tetap ditahan (dicek manual owner).
    if (!result.success && !result.pending) {
      users.addBalance(userId, total);
      return editCallbackRich(ctx, msg.withdrawFailed(result.message));
    }

    transactions.createTransaction(
      userId, 'withdraw', coins, rupiahAmount,
      result.success ? 'success' : 'pending', refId, `${method}|${account}|${fee}`,
    );

    // Bonus event hanya untuk WD yang sukses. Status pending belum pasti
    // terkirim, jadi bonusnya diberikan manual oleh owner (addsaldo) setelah dicek.
    const bonus = calculateWithdrawBonus(coins);
    if (result.success && bonus > 0) users.addBonusWithTurnover(userId, bonus, PRIZE_TO_RATIO);

    await editCallbackRich(ctx, msg.withdrawSuccess({
      method, account, rupiahAmount, total, fee, refId, pending: !result.success, bonus,
    }));

    // Testimoni berbunyi "LUNAS", jadi hanya untuk WD yang benar-benar sukses.
    if (!result.success) return undefined;
    return sendTestimoni(ctx.api, 'WITHDRAW', {
      userName: ctx.from.username || ctx.from.first_name,
      coins,
      rupiahAmount,
      refId,
      method,
      account,
      fee,
    });
  } catch (err) {
    console.error('Error eksekusi withdraw:', err?.message || err);
    if (!providerAnswered) users.addBalance(userId, total);
    return replyRich(ctx, msg.systemError());
  }
});

composer.callbackQuery('wd_no', async (ctx) => {
  delete userSessions[ctx.from.id];
  await answer(ctx);
  return editCallbackRich(ctx, msg.withdrawCancelled(), { reply_markup: keyboards.none() });
});

module.exports = composer;
