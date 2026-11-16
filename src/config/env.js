'use strict';

/**
 * Pembacaan & validasi environment variable.
 *
 * Semua kredensial WAJIB berasal dari .env. Tidak ada nilai fallback untuk
 * secret di kode: kalau key wajib kosong, proses berhenti saat start dengan
 * pesan yang jelas, bukan diam-diam jalan memakai kredensial lama.
 */

const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const missing = [];

/** Ambil string wajib. Dicatat sebagai missing kalau kosong. */
function required(key) {
  const value = (process.env[key] || '').trim();
  if (!value) missing.push(key);
  return value;
}

/** Ambil string opsional (bukan secret) dengan default. */
function optional(key, fallback) {
  const value = (process.env[key] || '').trim();
  return value || fallback;
}

/**
 * Ambil angka opsional. Nilai yang tidak valid (NaN / negatif) jatuh ke
 * default dengan peringatan, karena salah tulis di .env bisa membocorkan
 * syarat minimal bet/withdraw.
 */
function number(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = parseFloat(raw);
  if (!Number.isFinite(value) || value < 0) {
    console.warn(`⚠️ ${key} tidak valid ("${raw}"), pakai default ${fallback}.`);
    return fallback;
  }
  return value;
}

function idList(key) {
  return required(key)
    .split(',')
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !Number.isNaN(id));
}

const env = Object.freeze({
  botToken: required('BOT_TOKEN'),
  /** Opsional: token bot kedua (bot B). Kosong = mode satu bot seperti dulu. */
  botTokenB: optional('BOT_TOKEN_B', ''),

  ownerIds: idList('OWNER_IDS'),
  ownerUsername: required('OWNER_USERNAME'),

  channelTestiId: required('CHANNEL_TESTI_ID'),
  /** Opsional: ID grup tujuan notifikasi withdraw. Kosong = notifikasi WD mati. */
  requiredChannelUsername: required('REQUIRED_CHANNEL_USERNAME'),
  requiredChannelLink: required('REQUIRED_CHANNEL_LINK'),

  autogopay: Object.freeze({
    apiKey: required('AUTOGOPAY_API_KEY'),
    baseUrl: optional('AUTOGOPAY_BASE_URL', 'https://v1-gateway.autogopay.site').replace(/\/$/, ''),
  }),

  okeconnect: Object.freeze({
    userId: required('OKECONNECT_USER_ID'),
    password: required('OKECONNECT_PASSWORD'),
    pin: required('OKECONNECT_PIN'),
    url: optional('OKECONNECT_URL', 'https://h2h.okeconnect.com/trx'),
  }),

  /** Jendela maintenance harian Okeconnect (WIB), format HH:MM. */
  withdrawMaintenance: Object.freeze({
    start: optional('WD_MAINT_START', '22:00'),
    end: optional('WD_MAINT_END', '00:15'),
  }),

  /** Opsional: ID grup tempat tag "PERINTIS DADU" dipasang. Kosong = fitur tag mati. */
  memberTagChatId: optional('MEMBER_TAG_CHAT_ID', ''),
  /** Minimal total deposit HARIAN (rupiah, WIB) untuk dapat / mempertahankan tag. */
  memberTagMinDeposit: number('MEMBER_TAG_MIN_DEPOSIT', 50000),

  minWithdrawCoin: number('MIN_WITHDRAW_COIN', 5),
  minBet: number('MIN_BET', 0.2),
  wsMinBet: number('WS_MIN_BET', 3.0),
  loseEventMinBet: number('LOSE_EVENT_MIN_BET', 3.0),
});

if (env.botTokenB && env.botTokenB === env.botToken) {
  console.error('❌ BOT_TOKEN_B tidak boleh sama dengan BOT_TOKEN.');
  process.exit(1);
}

if (missing.length > 0) {
  console.error(`❌ Environment variable wajib belum diisi di .env: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = env;
