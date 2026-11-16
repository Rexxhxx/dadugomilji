'use strict';

/** Settle leaderboard harian: bagi hadiah Top 5 lalu reset counter menang. */

const { env, LB_PRIZES, LBW_PRIZES, PRIZE_TO_RATIO } = require('../config');
const { db, users, kv } = require('../database');
const { sendRich } = require('../ui/rich');
const msg = require('../ui/messages/account');

/** Hadiah leaderboard mingguan (koin, 1 koin = Rp1.000): J1 70K, J2 50K, J3 30K. */
const CHECK_INTERVAL_MS = 60 * 1000;

// Hadiah, reset counter, dan penanda "sudah settle hari ini" harus satu
// transaksi: kalau terpisah, crash di tengah bisa membuat hadiah dibayar dua kali.
const settleLeaderboardTx = db.transaction(() => {
  if (kv.isLeaderboardSettledToday()) return null;
  const top = users.getLeaderboardTop5();
  const winners = top.map((u, i) => ({ ...u, prize: LB_PRIZES[i] || 0 }));
  for (const w of winners) {
    if (w.prize > 0) users.addBonusWithTurnover(w.user_id, w.prize, PRIZE_TO_RATIO);
  }
  users.resetAllWins();
  kv.markLeaderboardSettled();
  return winners;
});

// Hadiah mingguan besar, jadi wajib TO: dua akun yang saling lawan bisa
// "membeli" kemenangan dengan fee kecil, TO mencegah hadiahnya langsung ditarik.
const settleWeeklyTx = db.transaction(() => {
  if (kv.isWeeklyLeaderboardSettled()) return null;
  const winners = users.getWeeklyTop(LBW_PRIZES.length).map((u, i) => ({ ...u, prize: LBW_PRIZES[i] }));
  for (const w of winners) users.addBonusWithTurnover(w.user_id, w.prize, PRIZE_TO_RATIO);
  users.resetWeeklyWins();
  kv.markWeeklyLeaderboardSettled();
  return winners;
});

async function settleWeeklyIfNewWeek(api) {
  const winners = settleWeeklyTx();
  if (!winners) return;

  console.log(`🏆 Leaderboard mingguan di-settle: ${winners.length} pemenang.`);
  await sendRich(api, env.channelTestiId, msg.weeklyLeaderboardAnnouncement(winners.map((w) => ({
    display: w.username ? `@${w.username}` : `ID ${w.user_id}`,
    weekly_wins: w.weekly_wins,
    prize: w.prize,
  }))));
}

async function settleLeaderboardIfNewDay(api) {
  // Mingguan dulu: menang hari Minggu masuk hitungan minggu itu sebelum counter harian direset.
  await settleWeeklyIfNewWeek(api).catch((err) => console.error('⚠️ Settle leaderboard mingguan gagal:', err?.message || err));
  const winners = settleLeaderboardTx();
  if (!winners) return;

  console.log(`🏆 Leaderboard harian di-settle: ${winners.length} pemenang.`);
  const display = winners.map((w) => ({
    display: w.username ? `@${w.username}` : `ID ${w.user_id}`,
    total_wins: w.total_wins,
    prize: w.prize,
  }));
  await sendRich(api, env.channelTestiId, msg.leaderboardAnnouncement(display));
}

function startLeaderboardScheduler(api) {
  return setInterval(() => {
    settleLeaderboardIfNewDay(api).catch((err) => console.error('⚠️ Settle leaderboard gagal:', err?.message || err));
  }, CHECK_INTERVAL_MS);
}

module.exports = { LB_PRIZES, LBW_PRIZES, settleLeaderboardIfNewDay, settleWeeklyIfNewWeek, startLeaderboardScheduler };
