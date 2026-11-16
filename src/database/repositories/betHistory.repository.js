'use strict';

const { sql } = require('../connection');

/**
 * Catat riwayat taruhan.
 * `forcedSide` = 'K'/'B' kalau ronde memakai setting owner, atau null untuk normal.
 */
function addBetHistory(userId, gameId, side, amount, result, createdAt, forcedSide = null) {
  sql(
    `INSERT INTO bet_history (user_id, game_id, side, amount, result, created_at, forced_side)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, gameId, side, amount, result, createdAt, forcedSide);
}

/** Riwayat terbaru milik user (untuk /riwayat). */
function getUserBetHistory(userId, limit = 10) {
  return sql(
    'SELECT * FROM bet_history WHERE user_id = ? ORDER BY id DESC LIMIT ?',
  ).all(userId, limit);
}

/** Alias kompatibilitas. */
const getRecentByUser = getUserBetHistory;

function getByGame(gameId) {
  return sql('SELECT * FROM bet_history WHERE game_id = ? ORDER BY id ASC').all(gameId);
}

module.exports = {
  addBetHistory,
  getUserBetHistory,
  getRecentByUser,
  getByGame,
};