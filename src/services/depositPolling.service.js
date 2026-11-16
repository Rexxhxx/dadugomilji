'use strict';

/**
 * Polling status pembayaran QRIS.
 *
 * Interval 5 detik, maksimal 15 menit (180 percobaan) — sama dengan batas waktu
 * invoice. Kredit saldo lewat `settleDepositSuccess` yang atomik, jadi polling
 * dan tombol "Cek Status Pembayaran" tidak mungkin mengkredit dua kali.
 */

const { users, transactions, deposits } = require('../database');
const { checkDepositStatus, getProvider } = require('./payment');
const { sendTestimoni } = require('./testimoni.service');
const { applyDepositTag } = require('./memberTag.service');
const { editRich } = require('../ui/rich');
const keyboards = require('../ui/keyboards');
const msg = require('../ui/messages/payment');

const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 180;

/** Kredit deposit sukses sekali saja; mengembalikan true kalau pemanggil ini yang mengkredit. */
function settleSuccess({ reference, userId, coins, bonusCoin }) {
  const totalAdded = parseFloat((coins + bonusCoin).toFixed(2));
  const settled = deposits.settleDepositSuccess(reference, userId, totalAdded);
  if (settled) deposits.deleteDepositMeta(reference);
  return { settled, totalAdded };
}

/**
 * Tulis hasil sukses ke pesan invoice + kirim testimoni.
 * Dipakai bersama oleh polling dan tombol cek manual.
 */
async function finalizeSuccess(api, { reference, chatId, userId, userName, provider, coins, amount, bonusCoin, invoiceMsgId, totalAdded }) {
  const user = users.getUserById(userId);
  if (invoiceMsgId) {
    await editRich(
      api,
      chatId,
      invoiceMsgId,
      msg.depositSuccess({
        transactionId: reference,
        coins,
        bonusCoin,
        total: totalAdded,
        balance: user ? user.balance : totalAdded,
      }),
      { reply_markup: keyboards.none() },
    );
  }

  applyDepositTag(userId);

  await sendTestimoni(api, 'DEPOSIT', {
    userName: user?.username || userName || 'Pemain',
    method: getProvider(provider).label,
    rupiahAmount: amount,
    coins,
    refId: reference,
    fee: bonusCoin,
  });
}

/**
 * Mulai polling satu invoice.
 * `startAttempt` > 0 dipakai saat bot restart supaya invoice lama tidak
 * mendapat jatah waktu penuh lagi.
 */
function startDepositPolling(api, meta, startAttempt = 0) {
  const { reference, chatId, userId, userName, provider, coins, amount, bonusCoin, invoiceMsgId } = meta;
  let attempts = startAttempt;

  const timer = setInterval(async () => {
    attempts += 1;
    try {
      const tx = transactions.getTransaction(reference);
      if (!tx || tx.status !== 'pending') {
        clearInterval(timer);
        deposits.deleteDepositMeta(reference);
        return;
      }

      const result = await checkDepositStatus(provider, reference);

      if (result.status === 'PAID') {
        clearInterval(timer);
        const { settled, totalAdded } = settleSuccess({ reference, userId, coins, bonusCoin });
        if (settled) await finalizeSuccess(api, { ...meta, totalAdded });
        return;
      }

      if (result.status === 'EXPIRED' || attempts >= MAX_ATTEMPTS) {
        clearInterval(timer);
        transactions.updateTransactionStatus(reference, 'expired');
        deposits.deleteDepositMeta(reference);
        if (invoiceMsgId) {
          await editRich(
            api,
            chatId,
            invoiceMsgId,
            msg.depositExpired({ transactionId: reference, amount, coins }),
            { reply_markup: keyboards.none() },
          );
        }
      }
    } catch (err) {
      console.error(`⚠️ Polling deposit ${reference} gagal:`, err?.message || err);
      if (attempts >= MAX_ATTEMPTS) clearInterval(timer);
    }
  }, POLL_INTERVAL_MS);

  return timer;
}

module.exports = { startDepositPolling, settleSuccess, finalizeSuccess, POLL_INTERVAL_MS, MAX_ATTEMPTS };
