'use strict';

/**
 * Konstanta aturan main (non-secret).
 *
 * Nilai di sini adalah aturan bisnis yang tidak berubah per-deploy, jadi
 * sengaja tidak diambil dari .env. Yang bisa dikonfigurasi ada di config/env.js.
 */

/** Harga 1 coin dalam rupiah. */
const COIN_PRICE = 1000;

/** Minimal deposit dalam rupiah. */
const MIN_DEPOSIT_RUPIAH = 100;

/** Potongan admin dari kemenangan (12%). */
const WIN_FEE_PERCENT = 0.12;

/** Jeda antar roll dalam detik. */
const ROLL_COOLDOWN_SECONDS = 15;

/**
 * Tier bonus Win Streak: jumlah streak -> bonus coin.
 * Dicek dari streak terbesar ke terkecil.
 */
const WS_BONUS_TIERS = Object.freeze({
  20: 18.0,
  15: 8.0,
  10: 4.0,
  7: 2.0,
  5: 1.0,
  3: 0.5,
});

/** Hadiah leaderboard harian Top 1-5 (koin, 1 koin = Rp1.000): 30K/25K/20K/15K/10K. */
const LB_PRIZES = Object.freeze([30, 25, 20, 15, 10]);
const LBW_PRIZES = Object.freeze([70, 50, 30]);

/** Hadiah LB harian, LB mingguan, dan bonus event WD wajib TO sebesar 50% hadiahnya. */
const PRIZE_TO_RATIO = 0.5;

/** Minimal taruhan (koin) yang menang supaya dihitung di leaderboard harian & mingguan. */
const LB_MIN_BET = 5;

module.exports = Object.freeze({
  COIN_PRICE,
  LB_PRIZES,
  LBW_PRIZES,
  LB_MIN_BET,
  PRIZE_TO_RATIO,
  MIN_DEPOSIT_RUPIAH,
  WIN_FEE_PERCENT,
  ROLL_COOLDOWN_SECONDS,
  WS_BONUS_TIERS,
});
