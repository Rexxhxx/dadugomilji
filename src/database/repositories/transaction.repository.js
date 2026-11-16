'use strict';

const { sql } = require('../connection');

function createTransaction(userId, type, coins, rupiah, status, reference, providerId = null) {
  sql(`INSERT INTO transactions (user_id, type, coins, rupiah, status, reference, provider_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`).run(userId, type, coins, rupiah, status, reference, providerId);
}

function getTransaction(reference) {
  return sql('SELECT user_id, coins, rupiah, status, provider_id FROM transactions WHERE reference = ?').get(reference);
}

function updateTransactionStatus(reference, status) {
  sql('UPDATE transactions SET status = ? WHERE reference = ?').run(status, reference);
}

/** WD pending yang masih dicek otomatis. WD lebih lama dari `maxAgeHours` dibiarkan untuk dicek manual. */
function getPendingWithdraws(maxAgeHours) {
  return sql(`SELECT reference, user_id, coins, rupiah, provider_id FROM transactions
              WHERE type = 'withdraw' AND status = 'pending' AND created_at >= datetime('now', ?)`)
    .all(`-${maxAgeHours} hours`);
}

/** Ubah status hanya dari 'pending'. True kalau baris ini yang berhasil mengubahnya. */
function settlePendingTransaction(reference, status) {
  return sql("UPDATE transactions SET status = ? WHERE reference = ? AND status = 'pending'").run(status, reference).changes === 1;
}

/**
 * Total rupiah deposit sukses user pada satu tanggal WIB (YYYY-MM-DD).
 * created_at disimpan UTC (CURRENT_TIMESTAMP), jadi digeser +7 jam ke WIB.
 */
function getDailyDepositRupiah(userId, wibDate) {
  return sql(`SELECT COALESCE(SUM(rupiah), 0) AS total FROM transactions
              WHERE user_id = ? AND type = 'deposit' AND status = 'success'
                AND date(created_at, '+7 hours') = ?`)
    .get(userId, wibDate).total;
}

/** User yang total deposit sukses-nya pada tanggal WIB tsb >= minRupiah. */
function getDailyDepositQualifiers(wibDate, minRupiah) {
  return sql(`SELECT user_id, SUM(rupiah) AS total FROM transactions
              WHERE type = 'deposit' AND status = 'success'
                AND date(created_at, '+7 hours') = ?
              GROUP BY user_id HAVING SUM(rupiah) >= ?`)
    .all(wibDate, minRupiah);
}

module.exports = {
  createTransaction,
  getTransaction,
  updateTransactionStatus,
  getPendingWithdraws,
  settlePendingTransaction,
  getDailyDepositRupiah,
  getDailyDepositQualifiers,
};
