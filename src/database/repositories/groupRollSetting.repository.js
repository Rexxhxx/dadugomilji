'use strict';

const { sql } = require('../connection');

const SIDES = { K: 'K', B: 'B' };

/** Normalisasi input 'kecil'/'besar' → 'K'/'B'. Return null kalau invalid. */
function parseSide(input) {
  const s = String(input || '').trim().toLowerCase();
  if (['k', 'kecil', 'small', 'kcl'].includes(s)) return 'K';
  if (['b', 'besar', 'big', 'bsr'].includes(s)) return 'B';
  return null;
}

function getSetting(chatId) {
  return sql(
    'SELECT chat_id, side, set_by, created_at, updated_at FROM group_roll_settings WHERE chat_id = ?',
  ).get(chatId);
}

function setSetting(chatId, side, setBy) {
  const normalized = SIDES[side];
  if (!normalized) throw new Error('side tidak valid');
  sql(
    `INSERT INTO group_roll_settings (chat_id, side, set_by)
     VALUES (?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET
       side = excluded.side,
       set_by = excluded.set_by,
       updated_at = CURRENT_TIMESTAMP`,
  ).run(chatId, normalized, setBy ?? null);
  return getSetting(chatId);
}

function unsetSetting(chatId) {
  const info = sql('DELETE FROM group_roll_settings WHERE chat_id = ?').run(chatId);
  return info.changes > 0;
}

function getAll() {
  return sql('SELECT * FROM group_roll_settings ORDER BY chat_id').all();
}

function getForcedSide(chatId) {
  const row = sql('SELECT side FROM group_roll_settings WHERE chat_id = ?').get(chatId);
  return row ? row.side : null;
}

module.exports = {
  SIDES,
  parseSide,
  getSetting,
  setSetting,
  unsetSetting,
  getAll,
  getForcedSide,
};