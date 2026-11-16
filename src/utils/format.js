'use strict';

const { TIME_ZONE } = require('./time');

/**
 * Escape teks dinamis (nama user, dsb.) sebelum disisipkan ke Rich Markdown,
 * supaya nama seperti "*_kevin_*" tidak merusak format pesan.
 */
function escapeRich(text) {
  return String(text ?? '').replace(/([\\`*_~=|[\]()<>#+\-!.{}])/g, '\\$1');
}

function coin(value) {
  return Number(value || 0).toFixed(2);
}

function rupiah(value) {
  return `Rp${Number(value || 0).toLocaleString('id-ID')}`;
}

/** "dd/mm HH:MM WIB" */
function formatWibDate(date = new Date()) {
  const map = {};
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  return `${map.day}/${map.month} ${map.hour}:${map.minute} WIB`;
}

function nowLocaleWib() {
  return new Date().toLocaleString('id-ID', { timeZone: TIME_ZONE });
}

/** Normalisasi nomor HP: buang non-digit, awalan 62 jadi 0. */
function formatPhoneNumber(phone) {
  let clean = String(phone).replace(/[^0-9]/g, '');
  if (clean.startsWith('62')) clean = `0${clean.slice(2)}`;
  return clean;
}

module.exports = { escapeRich, coin, rupiah, formatWibDate, nowLocaleWib, formatPhoneNumber };
