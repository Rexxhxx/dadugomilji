'use strict';

const { sql } = require('../connection');
const { getTodayWib, getWeekKeyWib } = require('../../utils/time');

function kvGet(key) {
  const row = sql('SELECT value FROM kv_store WHERE key = ?').get(key);
  return row ? row.value : null;
}

function kvSet(key, value) {
  sql('INSERT INTO kv_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

// Satu kunci (`lb_settled_date`) dipakai scheduler, perintah `lb`, dan catch-up
// saat start, supaya tidak ada jalur yang me-reset total_wins tanpa bagi hadiah.
const LB_SETTLED_KEY = 'lb_settled_date';

function isLeaderboardSettledToday() {
  return kvGet(LB_SETTLED_KEY) === getTodayWib();
}

function markLeaderboardSettled() {
  kvSet(LB_SETTLED_KEY, getTodayWib());
}

const LBW_SETTLED_KEY = 'lbw_settled_week';

function isWeeklyLeaderboardSettled() {
  return kvGet(LBW_SETTLED_KEY) === getWeekKeyWib();
}

function markWeeklyLeaderboardSettled() {
  kvSet(LBW_SETTLED_KEY, getWeekKeyWib());
}

module.exports = {
  kvGet,
  kvSet,
  isLeaderboardSettledToday,
  markLeaderboardSettled,
  isWeeklyLeaderboardSettled,
  markWeeklyLeaderboardSettled,
};
