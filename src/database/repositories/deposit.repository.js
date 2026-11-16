'use strict';

const { db, sql } = require('../connection');

/** Metadata invoice deposit, disimpan supaya polling bisa dilanjutkan setelah restart. */
function saveDepositMeta(reference, chatId, userId, userName, provider, coins, amount, bonusCoin, invoiceMsgId) {
  sql(`INSERT INTO deposit_meta (reference, chat_id, user_id, user_name, provider, coins, amount, bonus_coin, invoice_msg_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(reference) DO UPDATE SET invoice_msg_id = excluded.invoice_msg_id`)
    .run(reference, chatId, userId, userName, provider, coins, amount, bonusCoin, invoiceMsgId);
}

function getDepositMeta(reference) {
  return sql('SELECT * FROM deposit_meta WHERE reference = ?').get(reference);
}

function deleteDepositMeta(reference) {
  sql('DELETE FROM deposit_meta WHERE reference = ?').run(reference);
}

function getPendingDepositMetas() {
  return sql(`SELECT dm.* FROM deposit_meta dm
              JOIN transactions t ON t.reference = dm.reference
              WHERE t.status = 'pending'`).all();
}

/**
 * Tandai deposit sukses dan kreditkan saldo + target turnover secara atomik.
 * Guard `status = 'pending'` memastikan satu deposit tidak pernah terkredit dua
 * kali walau polling dan tombol "cek bayar" berjalan bersamaan.
 * Mengembalikan true hanya untuk pemanggil yang benar-benar mengkredit.
 */
const settleDepositSuccess = db.transaction((reference, userId, totalAdded) => {
  const update = sql("UPDATE transactions SET status = 'success' WHERE reference = ? AND status = 'pending'").run(reference);
  if (update.changes !== 1) return false;
  // TO baru dihitung dari progress saat ini. Kalau ditambahkan ke target lama,
  // kelebihan TO masa lalu (progress > target) langsung "melunasi" deposit baru.
  sql('UPDATE users SET balance = round(balance + ?, 2), to_target = round(MAX(to_target, to_progress) + ?, 2) WHERE user_id = ?')
    .run(totalAdded, totalAdded, userId);
  return true;
});

module.exports = { saveDepositMeta, getDepositMeta, deleteDepositMeta, getPendingDepositMetas, settleDepositSuccess };
