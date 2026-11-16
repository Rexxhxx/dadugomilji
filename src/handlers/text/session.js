'use strict';

/**
 * Wizard chat privat: lanjutan alur deposit & withdraw.
 *
 * Sesi disimpan di `userSessions` (memori). Dijalankan paling awal di router
 * teks supaya input angka pemain tidak tertukar dengan perintah meja.
 */

const { env, MIN_DEPOSIT_RUPIAH } = require('../../config');
const { users } = require('../../database');
const { userSessions } = require('../../game/state');
const { parseDepositInput } = require('../../services/deposit.service');
const {
  isWithdrawMaintenance,
  maintenanceWindow,
  getWithdrawFee,
} = require('../../services/withdraw.service');
const { formatPhoneNumber } = require('../../utils/format');
const { replyRich } = require('../../ui/rich');
const keyboards = require('../../ui/keyboards');
const msg = require('../../ui/messages/payment');

const MIN_PHONE_DIGITS = 10;
const round2 = (v) => parseFloat(v.toFixed(2));

function handleDepositAmount(ctx, session, text) {
  const rupiah = parseDepositInput(text);
  if (rupiah < MIN_DEPOSIT_RUPIAH) {
    delete userSessions[ctx.from.id];
    return replyRich(ctx, msg.depositMinimum());
  }

  session.step = 'DEP_METHOD';
  session.rupiah = rupiah;
  return replyRich(ctx, msg.depositChooseMethod(rupiah), { reply_markup: keyboards.depositMethod() });
}

function handleWithdrawAccount(ctx, session, text) {
  const phone = formatPhoneNumber(text);
  if (phone.length < MIN_PHONE_DIGITS) return replyRich(ctx, msg.withdrawInvalidPhone());

  session.account = phone;
  session.step = 'WD_AMOUNT';
  return replyRich(ctx, msg.withdrawAskAmount({ method: session.method, fee: session.fee }));
}

function handleWithdrawAmount(ctx, session, text) {
  const userId = ctx.from.id;

  if (isWithdrawMaintenance()) {
    delete userSessions[userId];
    return replyRich(ctx, msg.withdrawMaintenance(maintenanceWindow()));
  }

  const coins = parseFloat(String(text).replace(',', '.'));
  if (Number.isNaN(coins) || coins < env.minWithdrawCoin) return replyRich(ctx, msg.withdrawMinimum());

  const info = users.getTurnoverInfo(userId);
  if (info.progress < info.target) {
    delete userSessions[userId];
    return replyRich(ctx, msg.withdrawTurnoverNotMet(info));
  }

  const fee = session.fee || getWithdrawFee(session.method);
  const total = round2(coins + fee);
  if (users.getBalance(userId) < total) return replyRich(ctx, msg.withdrawInsufficient(total));

  session.coins = coins;
  session.fee = fee;
  session.step = 'WD_CONFIRM';

  return replyRich(ctx, msg.withdrawConfirm({
    method: session.method,
    account: session.account,
    coins,
    fee,
    total,
  }), { reply_markup: keyboards.withdrawConfirm() });
}

const STEPS = {
  DEP_AMOUNT: handleDepositAmount,
  WD_ACCOUNT: handleWithdrawAccount,
  WD_AMOUNT: handleWithdrawAmount,
};

/** Kembalikan true kalau pesan sudah diproses sebagai langkah wizard. */
async function handleSession(ctx, text) {
  if (ctx.chat.type !== 'private') return false;

  const session = userSessions[ctx.from.id];
  const step = session && STEPS[session.step];
  if (!step) return false;

  await step(ctx, session, text);
  return true;
}

module.exports = { handleSession };
