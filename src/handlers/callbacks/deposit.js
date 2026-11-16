'use strict';

/** Callback alur deposit: pilih metode QRIS & cek status pembayaran manual. */

const { Composer } = require('grammy');
const { COIN_PRICE } = require('../../config');
const { transactions, deposits } = require('../../database');
const { userSessions } = require('../../game/state');
const { checkDepositStatus } = require('../../services/payment');
const { calculateDepoBonus } = require('../../services/deposit.service');
const { settleSuccess, finalizeSuccess } = require('../../services/depositPolling.service');
const { generateDepositInvoice } = require('../../services/invoice.service');
const { answer, safeSend } = require('../../ui/rich');
const keyboards = require('../../ui/keyboards');

const composer = new Composer();

composer.callbackQuery(/^depm_(autogopay|shopeepay)$/, async (ctx) => {
  const session = userSessions[ctx.from.id];
  if (!session || session.step !== 'DEP_METHOD' || !session.rupiah) {
    return answer(ctx, 'Sesi deposit habis. Ketik deposit lagi.', true);
  }

  const rupiah = session.rupiah;
  delete userSessions[ctx.from.id];
  await answer(ctx);
  await safeSend(() => ctx.editMessageReplyMarkup({ reply_markup: keyboards.none() }), 'hapus tombol metode');
  return generateDepositInvoice(ctx, rupiah, ctx.match[1]);
});

composer.callbackQuery(/^checkpay_(.+)$/, async (ctx) => {
  const reference = ctx.match[1];
  const tx = transactions.getTransaction(reference);

  if (!tx) return answer(ctx, 'Transaksi tidak ditemukan.', true);
  if (tx.user_id !== ctx.from.id) return answer(ctx, 'Ini bukan invoice kamu.', true);
  if (tx.status === 'success') return answer(ctx, 'Deposit ini sudah berhasil diproses.', true);
  if (tx.status === 'expired') return answer(ctx, 'Invoice ini sudah kedaluwarsa. Buat deposit baru.', true);

  await answer(ctx, 'Mengecek pembayaran ke QRIS...');

  const meta = deposits.getDepositMeta(reference);
  const provider = meta?.provider || tx.provider_id || 'autogopay';
  const result = await checkDepositStatus(provider, reference);

  if (result.status !== 'PAID') {
    return answer(ctx, 'Pembayaran belum terdeteksi. Coba lagi beberapa saat.', true);
  }

  // Bonus sama dengan jalur polling: dari meta invoice, atau dari nominal yang
  // diminta (tx.rupiah sudah termasuk kode unik provider, bisa lompat tier).
  const coinBonus = meta ? meta.bonus_coin : calculateDepoBonus(Math.round(tx.coins * COIN_PRICE)).coinBonus;
  const { settled, totalAdded } = settleSuccess({
    reference,
    userId: tx.user_id,
    coins: tx.coins,
    bonusCoin: coinBonus,
  });
  if (!settled) return;

  return finalizeSuccess(ctx.api, {
    reference,
    chatId: meta?.chat_id ?? ctx.chat?.id,
    userId: tx.user_id,
    userName: meta?.user_name || ctx.from.first_name,
    provider,
    coins: tx.coins,
    amount: tx.rupiah,
    bonusCoin: coinBonus,
    invoiceMsgId: meta?.invoice_msg_id ?? ctx.callbackQuery.message?.message_id,
    totalAdded,
  });
});

module.exports = composer;
