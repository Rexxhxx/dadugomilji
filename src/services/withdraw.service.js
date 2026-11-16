'use strict';

const axios = require('axios');
const { env } = require('../config');
const { httpsAgent } = require('../utils/http');
const { getWibMinutesOfDay, parseHhMm, formatMinutes } = require('../utils/time');

const MAINT_START = parseHhMm(env.withdrawMaintenance.start, 22 * 60);
const MAINT_END = parseHhMm(env.withdrawMaintenance.end, 15);

const WITHDRAW_METHODS = Object.freeze({
  DANA: { label: 'DANA', product: 'BBSD', fee: 0.2 },
  GOPAY: { label: 'GOPAY', product: 'BBSGOP', fee: 0.7 },
  OVO: { label: 'OVO', product: 'BBSOVON', fee: 0.7 },
  SP: { label: 'SHOPEEPAY', product: 'BBSSH', fee: 0.7 },
});

/** Jendela maintenance bisa melewati tengah malam (start > end). */
function isWithdrawMaintenance() {
  const now = getWibMinutesOfDay();
  return MAINT_START > MAINT_END
    ? now >= MAINT_START || now < MAINT_END
    : now >= MAINT_START && now < MAINT_END;
}

function maintenanceWindow() {
  return { start: formatMinutes(MAINT_START), end: formatMinutes(MAINT_END) };
}

/** Event withdraw: tarik ≥ `min` koin → bonus `bonus` koin (1 koin = Rp1.000). Urut dari terbesar. */
const WITHDRAW_BONUS_TIERS = Object.freeze([
  { min: 200, bonus: 20 },
  { min: 150, bonus: 15 },
  { min: 110, bonus: 10 },
  { min: 50, bonus: 5 },
]);

const calculateWithdrawBonus = (coins) => WITHDRAW_BONUS_TIERS.find((t) => coins >= t.min)?.bonus ?? 0;

function getWithdrawFee(method) {
  return method === 'DANA' ? 0.2 : 0.7;
}

function getProductCodeByMethod(method) {
  const m = String(method || '').toUpperCase();
  if (m.includes('DANA')) return 'BBSD';
  if (m.includes('OVO')) return 'BBSOVON';
  if (m.includes('GOPAY')) return 'BBSGOP';
  if (m.includes('SP') || m.includes('SHOPEE')) return 'BBSSH';
  return 'BBSD';
}

/**
 * Kirim transaksi ke H2H Okeconnect.
 * Hasil: success=true (diterima), success=false (ditolak tegas),
 * atau pending=true (status tidak pasti: saldo JANGAN dikembalikan otomatis).
 */
async function processOkeconnectWD(product, dest, qty, refID) {
  try {
    const response = await axios.get(env.okeconnect.url, {
      params: {
        product,
        dest,
        qty,
        refID,
        memberID: env.okeconnect.userId,
        pin: env.okeconnect.pin,
        password: env.okeconnect.password,
      },
      timeout: 15000,
      httpsAgent,
    });
    const text = String(response.data || '').toUpperCase();

    if (['GAGAL', 'GGL', 'ERR', 'SALDO TIDAK CUKUP'].some((k) => text.includes(k))) {
      return { success: false, refID, message: text };
    }
    // Hanya SUKSES yang final. "PROSES"/"T#" baru berarti diterima antrean,
    // jadi diperlakukan pending: saldo tetap ditahan dan bonus WD tidak dibayar otomatis.
    if (text.includes('SUKSES')) {
      return { success: true, refID, message: text };
    }
    return { success: false, pending: true, refID, message: text || 'Status tidak diketahui dari server H2H Okeconnect.' };
  } catch (error) {
    console.error('❌ Error API Okeconnect:', error.message);
    return { success: false, pending: true, refID, message: 'Tidak dapat memastikan status ke server H2H Okeconnect (timeout/jaringan).' };
  }
}

/**
 * Cek status WD yang sudah dikirim (refID sama + check=1, format H2H Okeconnect).
 * Urutan penting: balasan pending ("Mhn tunggu") bisa memuat kata lain.
 */
async function checkOkeconnectWD(product, dest, qty, refID) {
  try {
    const response = await axios.get(env.okeconnect.url, {
      params: {
        product, dest, qty, refID, check: 1,
        memberID: env.okeconnect.userId,
        pin: env.okeconnect.pin,
        password: env.okeconnect.password,
      },
      timeout: 15000,
      httpsAgent,
    });
    const text = String(response.data || '').toUpperCase();
    if (!text || text.includes('TIDAK ADA')) return { status: 'unknown', message: text };
    if (text.includes('MHN TUNGGU') || text.includes('MENUNGGU') || text.includes('AKAN DIPROSES')) return { status: 'pending', message: text };
    if (text.includes('SUKSES')) return { status: 'success', message: text };
    if (text.includes('GAGAL')) return { status: 'failed', message: text };
    return { status: 'unknown', message: text };
  } catch (error) {
    return { status: 'unknown', message: error.message };
  }
}

module.exports = {
  WITHDRAW_METHODS,
  WITHDRAW_BONUS_TIERS,
  calculateWithdrawBonus,
  isWithdrawMaintenance,
  maintenanceWindow,
  getWithdrawFee,
  getProductCodeByMethod,
  processOkeconnectWD,
  checkOkeconnectWD,
};

// Self-check: `node src/services/withdraw.service.js`
if (require.main === module) {
  const assert = require('node:assert');
  const cases = [[49.99, 0], [50, 5], [109, 5], [110, 10], [149.5, 10], [150, 15], [199, 15], [200, 20], [1000, 20]];
  for (const [coins, bonus] of cases) assert.strictEqual(calculateWithdrawBonus(coins), bonus, `WD ${coins}`);
  console.log('calculateWithdrawBonus OK');
}
