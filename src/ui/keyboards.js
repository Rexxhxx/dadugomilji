'use strict';

/**
 * Semua inline keyboard bot. Dipisah dari teks supaya callback_data hanya
 * didefinisikan di satu tempat dan mudah dicocokkan dengan handler callback.
 */

const { InlineKeyboard } = require('grammy');
const { WITHDRAW_METHODS } = require('../services/withdraw.service');
const { env } = require('../config');
const { coin } = require('../utils/format');

/** Keyboard kosong: dipakai untuk mencabut tombol dari pesan lama. */
const none = () => ({ inline_keyboard: [] });

const depositMethod = () => new InlineKeyboard()
  .text('QRIS AutoGopay 1', 'depm_autogopay')
  .row()
  .text('QRIS AutoGopay 2', 'depm_shopeepay');

const checkPayment = (reference) => new InlineKeyboard()
  .text('Cek Status Pembayaran', `checkpay_${reference}`)
  .primary();

const withdrawMethods = () => {
  const kb = new InlineKeyboard();
  kb.text(`DANA (Fee ${WITHDRAW_METHODS.DANA.fee})`, 'wd_DANA').row();
  kb.text(`GoPay (Fee ${WITHDRAW_METHODS.GOPAY.fee})`, 'wd_GOPAY');
  kb.text(`OVO (Fee ${WITHDRAW_METHODS.OVO.fee})`, 'wd_OVO').row();
  kb.text(`ShopeePay (Fee ${WITHDRAW_METHODS.SP.fee})`, 'wd_SP');
  return kb;
};

const withdrawConfirm = () => new InlineKeyboard()
  .text('KONFIRMASI', 'wd_yes')
  .success()
  .text('BATAL', 'wd_no')
  .danger();

const joinChannel = () => new InlineKeyboard().url('Channel', env.requiredChannelLink);

const rollConfirm = (userId) => new InlineKeyboard()
  .text('Setuju', `c_roll_${userId}`)
  .success()
  .text('Batal', `x_roll_${userId}`)
  .danger();

/**
 * Tombol klaim bonus win streak hasil satu ronde.
 * `claims` = [{ userId, name, bonus }]; satu tombol per baris.
 */
function claimWinStreak(claims) {
  if (!claims.length) return undefined;
  const kb = new InlineKeyboard();
  for (const c of claims) {
    kb.text(`Ambil Bonus ${c.name} (+${coin(c.bonus)} Koin)`, `claimws_${c.userId}`).success().row();
  }
  return kb;
}

module.exports = {
  none,
  depositMethod,
  checkPayment,
  withdrawMethods,
  withdrawConfirm,
  joinChannel,
  rollConfirm,
  claimWinStreak,
};
