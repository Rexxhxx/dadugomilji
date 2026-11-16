'use strict';

/**
 * Operasi taruhan di meja (pasang, pindah, kurangi).
 *
 * Semua fungsi di sini hanya mengubah state meja di memori dan mengembalikan
 * hasil; pemotongan/penambahan saldo dilakukan pemanggil supaya urutan
 * "potong saldo dulu, baru catat taruhan" tetap eksplisit di handler.
 */

const { gameState, totalOf } = require('./state');

const round2 = (v) => parseFloat(v.toFixed(2));

const sideList = (side) => (side === 'K' ? gameState.bets_k : gameState.bets_b);
const setSideList = (side, list) => {
  if (side === 'K') gameState.bets_k = list;
  else gameState.bets_b = list;
};

const oppositeSide = (side) => (side === 'K' ? 'B' : 'K');

/** Total taruhan satu user di satu sisi. */
function userTotal(side, userId) {
  return round2(totalOf(sideList(side).filter((b) => b.user_id === userId)));
}

/**
 * Kurangi taruhan user di satu sisi sebanyak `amount` (dari entri paling awal).
 * Mengembalikan jumlah yang benar-benar terpotong.
 */
function trimUserBet(side, userId, amount) {
  let remaining = round2(amount);
  const kept = [];

  for (const bet of sideList(side)) {
    if (bet.user_id !== userId || remaining <= 0) {
      kept.push(bet);
      continue;
    }
    if (bet.amount <= remaining) {
      remaining = round2(remaining - bet.amount);
    } else {
      bet.amount = round2(bet.amount - remaining);
      remaining = 0;
      kept.push(bet);
    }
  }

  setSideList(side, kept);
  return round2(amount - remaining);
}

/** Tambahkan taruhan; digabung ke entri user yang sudah ada di sisi itu. */
function addBet(side, { userId, name, amount }) {
  // Timer cooldown roll di-set setiap taruhan mendarat di meja KOSONG, bukan
  // hanya saat first_bet_time masih null: kalau semua taruhan sempat ditarik
  // (`kur all`), meja kosong tapi stempel waktu lama masih menempel — bet
  // berikutnya akan mewarisi timer basi itu sehingga cooldown dianggap lewat
  // dan roll bisa jalan sebelum pemain lain ikut memasang.
  if (isTableEmpty()) gameState.first_bet_time = Date.now();

  const list = sideList(side);
  const existing = list.find((b) => b.user_id === userId);
  if (existing && userId > 0) existing.amount = round2(existing.amount + amount);
  else list.push({ user_id: userId, name, amount: round2(amount) });
}

const isTableEmpty = () => gameState.bets_k.length === 0 && gameState.bets_b.length === 0;

/** Sisi tempat user sudah memasang taruhan, atau null. */
function userSide(userId) {
  if (gameState.bets_k.some((b) => b.user_id === userId)) return 'K';
  if (gameState.bets_b.some((b) => b.user_id === userId)) return 'B';
  return null;
}

/** Detik tersisa sebelum roll diizinkan. */
function cooldownRemaining(seconds) {
  if (!gameState.first_bet_time) return 0;
  const elapsed = Math.floor((Date.now() - gameState.first_bet_time) / 1000);
  return Math.max(0, seconds - elapsed);
}

/** Bandingkan total dengan presisi 2 desimal (hindari galat float). */
const isBalanced = (a, b) => Math.round(a * 100) === Math.round(b * 100);

module.exports = {
  round2,
  sideList,
  setSideList,
  oppositeSide,
  userTotal,
  trimUserBet,
  addBet,
  isTableEmpty,
  userSide,
  cooldownRemaining,
  isBalanced,
};
