'use strict';

const PAID = ['success', 'paid', 'settlement'];
const EXPIRED = ['expire', 'expired', 'cancel', 'failed'];

function qrImageUrl(qrString) {
  return qrString
    ? `https://api.qrserver.com/v1/create-qr-code/?size=450x450&qzone=4&data=${encodeURIComponent(qrString)}`
    : null;
}

/** Ubah status mentah provider jadi { success, status: PAID|EXPIRED|PENDING }. */
function normalizeStatus(raw, paidFlag = false, extraPaid = []) {
  const s = String(raw || '').toLowerCase();
  if (paidFlag || PAID.includes(s) || extraPaid.includes(s)) return { success: true, status: 'PAID' };
  if (EXPIRED.includes(s)) return { success: false, status: 'EXPIRED' };
  return { success: false, status: 'PENDING' };
}

module.exports = { qrImageUrl, normalizeStatus };
