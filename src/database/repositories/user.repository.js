'use strict';

const { db, sql } = require('../connection');
const { getTodayWib } = require('../../utils/time');

function createUser(userId, displayName, tgUsername = null) {
  const handle = tgUsername ? String(tgUsername).replace(/^@/, '') : null;
  sql(`INSERT INTO users (user_id, username, tg_username, cashback_date) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, tg_username = excluded.tg_username
       WHERE users.username IS NOT excluded.username OR users.tg_username IS NOT excluded.tg_username`)
    .run(userId, displayName, handle, getTodayWib());
  if (handle) {
    sql('UPDATE users SET tg_username = NULL WHERE LOWER(tg_username) = LOWER(?) AND user_id != ?').run(handle, userId);
  }
}

function getUserById(userId) {
  return sql('SELECT * FROM users WHERE user_id = ?').get(userId);
}

function getUserByUsername(username) {
  const clean = String(username).replace(/^@/, '').toLowerCase().trim();
  if (!clean) return undefined;
  return sql('SELECT * FROM users WHERE LOWER(tg_username) = ?').get(clean);
}

function getAllUsers() {
  return sql('SELECT user_id, username, balance FROM users').all();
}

function getBalance(userId) {
  const row = sql('SELECT balance FROM users WHERE user_id = ?').get(userId);
  return row ? parseFloat(row.balance) : 0.0;
}

const toCents = (coins) => Math.round(Number(coins) * 100) / 100;

function addBalance(userId, coins) {
  sql('UPDATE users SET balance = round(balance + ?, 2) WHERE user_id = ?').run(toCents(coins), userId);
}

function addBonusWithTurnover(userId, coins, toRatio = 1) {
  const cents = toCents(coins);
  const toCoins = toCents(cents * toRatio);
  sql('UPDATE users SET balance = round(balance + ?, 2), to_target = round(MAX(to_target, to_progress) + ?, 2) WHERE user_id = ?')
    .run(cents, toCoins, userId);
}

function removeBalance(userId, coins) {
  const cents = toCents(coins);
  if (!Number.isFinite(cents) || cents < 0) return false;
  const info = sql('UPDATE users SET balance = round(balance - ?, 2) WHERE user_id = ? AND balance >= ?')
    .run(cents, userId, cents);
  return info.changes === 1;
}

function addTurnover(userId, amount) {
  sql('UPDATE users SET to_progress = round(to_progress + ?, 2) WHERE user_id = ?').run(amount, userId);
}

function getTurnoverInfo(userId) {
  const row = sql('SELECT balance, to_target, to_progress FROM users WHERE user_id = ?').get(userId);
  if (!row) return { balance: 0, target: 0, progress: 0, sisa: 0, bebas: 0 };
  const balance = parseFloat(row.balance || 0);
  const target = parseFloat(row.to_target || 0);
  const progress = parseFloat(row.to_progress || 0);
  const sisa = Math.max(0, parseFloat((target - progress).toFixed(2)));
  const bebas = progress >= target ? balance : Math.max(0, parseFloat((balance - sisa).toFixed(2)));
  return { balance, target, progress, sisa, bebas };
}

function addWinCount(userId) {
  sql('UPDATE users SET total_wins = total_wins + 1, weekly_wins = weekly_wins + 1 WHERE user_id = ?').run(userId);
}

function getLeaderboardTop5() {
  return sql('SELECT user_id, username, total_wins FROM users WHERE total_wins > 0 ORDER BY total_wins DESC LIMIT 5').all();
}

function getWeeklyTop(limit) {
  return sql(`SELECT user_id, username, weekly_wins FROM users WHERE weekly_wins > 0
              ORDER BY weekly_wins DESC, user_id ASC LIMIT ?`).all(limit);
}

function resetWeeklyWins() {
  sql('UPDATE users SET weekly_wins = 0 WHERE weekly_wins > 0').run();
}

function resetAllWins() {
  sql('UPDATE users SET total_wins = 0').run();
}

function getStreakInfo(userId) {
  const row = sql('SELECT streak, max_streak, username FROM users WHERE user_id = ?').get(userId);
  return row
    ? { streak: row.streak, max_streak: row.max_streak, username: row.username }
    : { streak: 0, max_streak: 0, username: 'User' };
}

function incrementStreak(userId) {
  const row = sql(`UPDATE users SET streak = streak + 1, max_streak = MAX(max_streak, streak + 1)
                   WHERE user_id = ? RETURNING streak`).get(userId);
  return row ? row.streak : 0;
}

function resetStreak(userId) {
  sql('UPDATE users SET streak = 0 WHERE user_id = ?').run(userId);
}

const claimStreakBonus = db.transaction((userId, minStreak, bonusFor) => {
  const row = sql('SELECT streak FROM users WHERE user_id = ?').get(userId);
  if (!row || row.streak < minStreak) return null;
  const bonus = bonusFor(row.streak);
  if (bonus <= 0) return null;
  sql('UPDATE users SET streak = 0 WHERE user_id = ?').run(userId);
  addBonusWithTurnover(userId, bonus);
  return { streak: row.streak, bonus };
});

const LOSE_EVENT_REWARDS = Object.freeze({ 3: 2, 5: 3, 7: 4, 10: 5 });

const incrementLoseStreakAndReward = db.transaction((userId) => {
  const today = getTodayWib();
  const row = sql(`UPDATE users SET lose_streak = lose_streak + 1,
                     lose_event_paid = CASE WHEN lose_event_date IS ? THEN lose_event_paid ELSE 0 END,
                     lose_event_date = ?
                   WHERE user_id = ? RETURNING lose_streak`).get(today, today, userId);
  const total = row ? row.lose_streak : 0;
  const reward = row ? (LOSE_EVENT_REWARDS[total] || 0) : 0;
  if (reward > 0) {
    sql('UPDATE users SET lose_event_paid = round(lose_event_paid + ?, 2) WHERE user_id = ?').run(reward, userId);
    addBonusWithTurnover(userId, reward);
    console.log(`[EVENT_LOSE] ${userId},${total}, ${reward},${new Date().toISOString()}`);
  }
  return { total, reward };
});

function registerLose(userId, betAmount, minBet) {
  if (!userId || userId <= 0) return { total: 0, reward: 0 };
  if (betAmount < minBet) {
    const row = sql('SELECT lose_streak FROM users WHERE user_id = ?').get(userId);
    return { total: row ? row.lose_streak : 0, reward: 0 };
  }
  return incrementLoseStreakAndReward(userId);
}

function resetLoseStreak(userId) {
  sql('UPDATE users SET lose_streak = 0 WHERE user_id = ?').run(userId);
}

module.exports = {
  createUser,
  getUserById,
  getUserByUsername,
  getAllUsers,
  getBalance,
  addBalance,
  addBonusWithTurnover,
  removeBalance,
  addTurnover,
  getTurnoverInfo,
  addWinCount,
  getLeaderboardTop5,
  getWeeklyTop,
  resetWeeklyWins,
  resetAllWins,
  getStreakInfo,
  incrementStreak,
  resetStreak,
  claimStreakBonus,
  LOSE_EVENT_REWARDS,
  registerLose,
  resetLoseStreak,
};