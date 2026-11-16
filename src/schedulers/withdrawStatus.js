'use strict';

/**
 * Okeconnect biasanya membalas WD dengan "AKAN DIPROSES"; status akhir baru
 * diketahui belakangan. Scheduler ini mengecek ulang WD pending, lalu:
 * SUKSES -> bonus event, testimoni, kabari user;
 * GAGAL  -> saldo dikembalikan, kabari user.
 */

const { PRIZE_TO_RATIO } = require('../config');
const { db, users, transactions } = require('../database');
const {
  calculateWithdrawBonus,
  getProductCodeByMethod,
  checkOkeconnectWD,
} = require('../services/withdraw.service');
const { sendTestimoni } = require('../services/testimoni.service');
const { sendRich } = require('../ui/rich');
const msg = require('../ui/messages/payment');

const CHECK_INTERVAL_MS = 30 * 1000;
/** WD yang lebih tua dari ini tidak dicek otomatis (bisa jadi sudah ditangani manual). */
const MAX_AGE_HOURS = 24;
const round2 = (v) => parseFloat(v.toFixed(2));

/** provider_id: "DANA|08xxx|0.2". Data lama bisa punya pemisah rusak sebelum fee. */
function parseProviderId(providerId) {
  const m = /^([A-Z]+)\|(\d+)\D+?([\d.]+)$/.exec(String(providerId || ''));
  return m ? { method: m[1], account: m[2], fee: Number(m[3]) } : null;
}

const markSuccessTx = db.transaction((tx, bonus) => {
  if (!transactions.settlePendingTransaction(tx.reference, 'success')) return false;
  if (bonus > 0) users.addBonusWithTurnover(tx.user_id, bonus, PRIZE_TO_RATIO);
  return true;
});

const markFailedTx = db.transaction((tx, refund) => {
  if (!transactions.settlePendingTransaction(tx.reference, 'failed')) return false;
  users.addBalance(tx.user_id, refund);
  return true;
});

async function onSuccess(api, tx, info) {
  const bonus = calculateWithdrawBonus(tx.coins);
  if (!markSuccessTx(tx, bonus)) return;
  console.log(`✅ WD ${tx.reference} dikonfirmasi SUKSES oleh Okeconnect.`);

  const user = users.getUserById(tx.user_id) || {};
  const base = { method: info.method, account: info.account, rupiahAmount: tx.rupiah, fee: info.fee, refId: tx.reference };

  await sendRich(api, tx.user_id, msg.withdrawSuccess({ ...base, total: round2(tx.coins + info.fee), pending: false, bonus }));
  await sendTestimoni(api, 'WITHDRAW', { ...base, userName: user.tg_username || user.username || String(tx.user_id), coins: tx.coins });
}

async function onFailed(api, tx, info, message) {
  const refund = round2(tx.coins + info.fee);
  if (!markFailedTx(tx, refund)) return;
  console.log(`↩️ WD ${tx.reference} GAGAL di Okeconnect, ${refund} koin dikembalikan.`);
  await sendRich(api, tx.user_id, msg.withdrawRefunded({ refId: tx.reference, refund, message }));
}

let running = false;

async function checkPendingWithdraws(api) {
  if (running) return;
  running = true;
  try {
    for (const tx of transactions.getPendingWithdraws(MAX_AGE_HOURS)) {
      const info = parseProviderId(tx.provider_id);
      if (!info) continue;
      const result = await checkOkeconnectWD(getProductCodeByMethod(info.method), info.account, tx.rupiah, tx.reference);
      if (result.status === 'success') await onSuccess(api, tx, info);
      else if (result.status === 'failed') await onFailed(api, tx, info, result.message);
    }
  } catch (err) {
    console.error('⚠️ Cek status WD gagal:', err?.message || err);
  } finally {
    running = false;
  }
}

function startWithdrawStatusScheduler(api) {
  return setInterval(() => { checkPendingWithdraws(api); }, CHECK_INTERVAL_MS);
}

module.exports = { checkPendingWithdraws, startWithdrawStatusScheduler, parseProviderId };
