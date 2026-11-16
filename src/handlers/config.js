// config.js
const OWNER_IDS = process.env.OWNER_IDS // Ganti 123456789 dengan ID Telegram Anda
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n));

module.exports = { OWNER_IDS };