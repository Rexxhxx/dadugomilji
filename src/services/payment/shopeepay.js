'use strict';

const axios = require('axios');
const { env } = require('../../config');
const { httpsAgent } = require('../../utils/http');
const { sleep } = require('../../utils/time');
const { qrImageUrl, normalizeStatus } = require('./common');

// ShopeePay memakai API key & base URL yang sama dengan AutoGopay.
const authHeaders = () => ({
  Authorization: `Bearer ${env.autogopay.apiKey}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

async function createQris(amount) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.post(
        `${env.autogopay.baseUrl}/shopeepay/qris/create`,
        { amount: Number(amount) },
        { headers: authHeaders(), timeout: 25000, httpsAgent },
      );
      const d = res.data?.data;
      if (res.data?.success && d && d.order_sn) {
        return {
          success: true,
          data: {
            transactionId: d.order_sn,
            orderId: d.order_sn,
            totalAmount: Number(d.amount || amount),
            // qr_url ShopeePay kecil & tanpa border putih: di tema gelap mobile QR menyatu dengan latar.
            qrImage: qrImageUrl(d.qr_string) || d.qr_url,
            qrString: d.qr_string,
            expiryTime: d.expiry_time || '15 Menit',
          },
        };
      }
      return { success: false, msg: res.data?.message || 'Gagal membuat QRIS ShopeePay.' };
    } catch (err) {
      console.error(`❌ ShopeePay create attempt ${attempt}:`, err.response?.data || err.message);
      if (attempt === 3) {
        return { success: false, msg: `Gagal terhubung ke ShopeePay API (${err.response?.data?.message || err.message}).` };
      }
      await sleep(1500);
    }
  }
  return { success: false, msg: 'Gagal membuat QRIS ShopeePay.' };
}

async function checkStatus(orderSn) {
  try {
    const res = await axios.get(
      `${env.autogopay.baseUrl}/shopeepay/qris/status?order_sn=${encodeURIComponent(orderSn)}`,
      { headers: authHeaders(), timeout: 20000, httpsAgent },
    );
    const d = res.data?.data || {};
    return normalizeStatus(d.status, d.paid === true);
  } catch (err) {
    return { success: false, status: err.response?.status === 429 ? 'RATELIMIT' : 'ERROR' };
  }
}

module.exports = { createQris, checkStatus };
