'use strict';

/**
 * Pembuatan invoice deposit QRIS.
 *
 * Invoice dikirim sebagai Rich Message (bukan foto + caption) supaya pesan yang
 * sama bisa di-edit jadi "sukses"/"expired" nanti — caption foto tidak mendukung
 * Rich Message. Gambar QR disisipkan lewat media `tg://photo?id=...`.
 */

const axios = require('axios');
const { InputFile } = require('grammy');
const { COIN_PRICE, MIN_DEPOSIT_RUPIAH } = require('../config');
const { transactions, deposits } = require('../database');
const { createQris, getProvider } = require('./payment');
const { calculateDepoBonus } = require('./deposit.service');
const { startDepositPolling } = require('./depositPolling.service');
const { replyRich, replyRichWithMedia } = require('../ui/rich');
const keyboards = require('../ui/keyboards');
const msg = require('../ui/messages/payment');
const { httpsAgent } = require('../utils/http');

const QR_MEDIA_ID = 'qris';
const QR_DOWNLOAD_TIMEOUT_MS = 15000;

/** Unduh gambar QR agar bisa dikirim sebagai file; null kalau gagal (pakai URL langsung). */
async function downloadQr(url) {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: QR_DOWNLOAD_TIMEOUT_MS, httpsAgent });
    return Buffer.from(res.data);
  } catch (err) {
    console.error('⚠️ Gagal mengunduh gambar QRIS, pakai URL langsung:', err?.message || err);
    return null;
  }
}

async function generateDepositInvoice(ctx, rupiah, providerKey) {
  if (rupiah < MIN_DEPOSIT_RUPIAH) return replyRich(ctx, msg.depositMinimum());

  const provider = getProvider(providerKey);
  const coins = parseFloat((rupiah / COIN_PRICE).toFixed(2));
  await replyRich(ctx, msg.depositCreating(provider.name));

  const qris = await createQris(providerKey, rupiah);
  if (!qris.success) return replyRich(ctx, msg.depositCreateFailed(qris.msg));

  const { transactionId, totalAmount, qrImage } = qris.data;
  const { coinBonus } = calculateDepoBonus(rupiah);

  // provider_id menyimpan nama provider: sumber kebenaran saat cek manual
  // kalau baris deposit_meta sudah terhapus.
  transactions.createTransaction(ctx.from.id, 'deposit', coins, totalAmount, 'pending', transactionId, providerKey);

  const invoiceText = msg.depositInvoice({
    label: provider.label,
    transactionId,
    amount: totalAmount,
    coins,
    bonusCoin: coinBonus,
    qrMarkdown: `![QRIS](tg://photo?id=${QR_MEDIA_ID})`,
  });

  const buffer = qrImage ? await downloadQr(qrImage) : null;
  const media = [{
    id: QR_MEDIA_ID,
    media: { type: 'photo', media: buffer ? new InputFile(buffer, 'qris.png') : qrImage },
  }];

  const sent = await replyRichWithMedia(ctx, invoiceText, media, {
    reply_markup: keyboards.checkPayment(transactionId),
  });

  deposits.saveDepositMeta(
    transactionId,
    ctx.chat.id,
    ctx.from.id,
    ctx.from.first_name,
    providerKey,
    coins,
    totalAmount,
    coinBonus,
    sent?.message_id ?? null,
  );

  startDepositPolling(ctx.api, {
    reference: transactionId,
    chatId: ctx.chat.id,
    userId: ctx.from.id,
    userName: ctx.from.first_name,
    provider: providerKey,
    coins,
    amount: totalAmount,
    bonusCoin: coinBonus,
    invoiceMsgId: sent?.message_id ?? null,
  });

  return sent;
}

module.exports = { generateDepositInvoice };
