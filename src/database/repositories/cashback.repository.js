'use strict';

const { db, sql } = require('../connection');
const { getTodayWib } = require('../../utils/time');
const { addBonusWithTurnover } = require('./user.repository');

/** Cashback berlaku per hari WIB: reset ke 0 saat tanggal berganti. */
function checkAndResetCashback(userId) {
  const today = getTodayWib();
  const row = sql('SELECT cashback, cashback_date FROM users WHERE user_id = ?').get(userId);
  if (row && row.cashback_date !== today) {
    sql('UPDATE users SET cashback = 0, cashback_date = ? WHERE user_id = ?').run(today, userId);
    return 0.0;
  }
  return row ? parseFloat(row.cashback || 0) : 0.0;
}

function getCashback(userId) {
  return checkAndResetCashback(userId);
}

/** Taruhan kalah di bawah ini tidak dapat cashback (bet receh 0.2 dipakai farming). */
const CASHBACK_MIN_BET = 3;

function addCashback(userId, betAmount) {
  if (!(Number(betAmount) >= CASHBACK_MIN_BET)) return;
  checkAndResetCashback(userId);
  const reward = betAmount < 5 ? 0.05 : 0.10;
  sql('UPDATE users SET cashback = round(cashback + ?, 2), cashback_date = ? WHERE user_id = ?')
    .run(reward, getTodayWib(), userId);
}

function reduceCashback(userId, amount) {
  checkAndResetCashback(userId);
  sql('UPDATE users SET cashback = MAX(0, round(cashback - ?, 2)), cashback_date = ? WHERE user_id = ?')
    .run(amount, getTodayWib(), userId);
}

function hasClaimedCashbackToday(userId) {
  const row = sql('SELECT last_cb_claim FROM users WHERE user_id = ?').get(userId);
  return Boolean(row && row.last_cb_claim === getTodayWib());
}

/** Pindahkan cashback ke saldo. Mengembalikan jumlah yang diklaim (0 kalau kosong). */
// Satu transaksi: kalau proses mati di antara kredit saldo dan reset cashback,
// cashback bisa diklaim dua kali.
const claimUserCashback = db.transaction((userId) => {
  const current = checkAndResetCashback(userId);
  if (current <= 0) return 0.0;
  // Sesuai pesan ke pemain: cashback wajib dimainkan dulu (target TO ikut naik).
  addBonusWithTurnover(userId, current);
  sql('UPDATE users SET cashback = 0, last_cb_claim = ? WHERE user_id = ?').run(getTodayWib(), userId);
  return current;
});

module.exports = {
  CASHBACK_MIN_BET,
  checkAndResetCashback,
  getCashback,
  addCashback,
  reduceCashback,
  hasClaimedCashbackToday,
  claimUserCashback,
};
