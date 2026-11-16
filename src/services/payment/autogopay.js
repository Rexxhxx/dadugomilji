'use strict';

const axios = require('axios');
const { env } = require('../../config');
const { httpsAgent } = require('../../utils/http');
const { sleep } = require('../../utils/time');
const { qrImageUrl, normalizeStatus } = require('./common');

const authHeaders = () => ({
  Authorization: `Bearer ${env.autogopay.apiKey}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

async function createQris(amount) {
  const orderId = `MILJI-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.post(
        `${env.autogopay.baseUrl}/qris/generate`,
        { amount: Number(amount), order_id: orderId },
        { headers: authHeaders(), timeout: 25000, httpsAgent },
      );
      const body = res.data;
      if (body && (body.success === true || body.data || body.transaction_id || body.id)) {
        const d = body.data || body;
        const transactionId = d.transaction_id || d.id || d.ref_id;
        const qrString = d.qr_string || d.qris_string || d.qrString || d.qr;
        if (!transactionId) {
          return { success: false, msg: 'AutoGopay API tidak mengembalikan transaction_id.' };
        }
        return {
          success: true,
          data: {
            transactionId,
            orderId: d.order_id || orderId,
            totalAmount: Number(d.amount || amount),
            qrImage: d.qr_url || qrImageUrl(qrString),
            qrString,
            expiryTime: d.expired_at || d.expiry_time || '15 Menit',
          },
        };
      }
      return { success: false, msg: body?.message || 'Gagal membuat QRIS AutoGopay.' };
    } catch (err) {
      console.error(`❌ AutoGopay create attempt ${attempt}:`, err.response?.data || err.message);
      if (attempt === 3) {
        return { success: false, msg: `Gagal terhubung ke AutoGopay API (${err.response?.data?.message || err.message}).` };
      }
      await sleep(1500);
    }
  }
  return { success: false, msg: 'Gagal membuat QRIS AutoGopay.' };
}

async function checkStatus(transactionId) {
  try {
    const res = await axios.post(
      `${env.autogopay.baseUrl}/qris/status`,
      { transaction_id: transactionId },
      { headers: authHeaders(), timeout: 20000, httpsAgent },
    );
    const d = res.data?.data || res.data || {};
    return normalizeStatus(d.transaction_status || d.status, false, ['completed', 'berhasil']);
  } catch (err) {
    return { success: false, status: err.response?.status === 429 ? 'RATELIMIT' : 'ERROR' };
  }
}

module.exports = { createQris, checkStatus };
