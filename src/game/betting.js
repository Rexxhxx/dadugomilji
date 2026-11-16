'use strict';

/**
 * Logika inti untuk memasang, memindah, dan mengurangi taruhan.
 * Fungsi ini dipanggil oleh handler (mis. handlers/commands/game.js).
 */

const { users } = require('../database');
const { gameState, totalK, totalB } = require('./state');
const { replyRich } = require('../ui/rich');
const msg = require('../ui/messages/game');
const { env } = require('../config'); // Pastikan env.minBet ada di config
const { betListMarkdown } = require('./engine');

/**
 * Memasang taruhan baru ke meja.
 * @param {Context} ctx - Konteks grammY
 * @param {string} side - 'K' (Kecil) atau 'B' (Besar)
 * @param {number} amount - Nominal taruhan
 */
async function processBet(ctx, side, amount) {
  const userId = ctx.from.id;

  // 1. Cek apakah meja sedang buka (tidak sedang roll)
  if (gameState.is_rolling) {
    return replyRich(ctx, msg.rolling());
  }
  if (!gameState.is_game_open) {
    return replyRich(ctx, msg.tableClosed());
  }

  // 2. Cek apakah nominal valid
  if (isNaN(amount) || amount <= 0) {
    return replyRich(ctx, msg.betMinimum());
  }
  if (amount < env.minBet) {
    return replyRich(ctx, msg.betMinimum());
  }

  // 3. Cek apakah user sudah punya taruhan di sisi yang sama
  const targetBets = side === 'K' ? gameState.bets_k : gameState.bets_b;
  const oppositeBets = side === 'K' ? gameState.bets_b : gameState.bets_k;
  
  if (targetBets.some((b) => b.user_id === userId)) {
    // Jika sudah ada di sisi ini, tolak (harus pakai /kur atau /pindah)
    return replyRich(ctx, `Kamu sudah memasang taruhan di sisi ${msg.SIDE_NAME[side]}. Gunakan /kur atau /pindah.`);
  }
  
  if (oppositeBets.some((b) => b.user_id === userId)) {
    // Jika user ada di sisi berlawanan, minta gunakan perintah pindah
    return replyRich(ctx, msg.betOppositeSide(side === 'K' ? 'B' : 'K'));
  }

  // 4. Cek saldo user
  const balance = users.getBalance(userId);
  if (balance < amount) {
    return replyRich(ctx, msg.balanceInsufficient());
  }

  // 5. Potong saldo secara atomik
  const success = users.removeBalance(userId, amount);
  if (!success) {
    return replyRich(ctx, msg.balanceInsufficient());
  }

  // 6. Tambahkan ke state
  const userName = String(ctx.from.first_name || ctx.from.username || 'Pemain').toUpperCase();
  targetBets.push({
    user_id: userId,
    name: userName,
    amount: amount,
  });

  // 7. Kirim balasan sukses beserta daftar meja terbaru
  // Asumsi: Anda punya fungsi untuk merender daftar meja saat ini
  const listMarkdown = betListMarkdown();
  return replyRich(ctx, `✅ Taruhan **${msg.SIDE_NAME[side]}** sebesar **${amount} Koin** berhasil dipasang!\n\n${listMarkdown}`);
}

/**
 * Memindahkan taruhan user ke sisi sebaliknya.
 */
async function processMove(ctx) {
  const userId = ctx.from.id;

  if (gameState.is_rolling) return replyRich(ctx, msg.rolling());
  if (!gameState.is_game_open) return replyRich(ctx, msg.tableClosed());

  const betKIndex = gameState.bets_k.findIndex((b) => b.user_id === userId);
  const betBIndex = gameState.bets_b.findIndex((b) => b.user_id === userId);

  if (betKIndex === -1 && betBIndex === -1) return replyRich(ctx, msg.noUserBet());

  const fromSide = betKIndex !== -1 ? 'K' : 'B';
  const toSide = fromSide === 'K' ? 'B' : 'K';
  
  const sourceList = fromSide === 'K' ? gameState.bets_k : gameState.bets_b;
  const targetList = toSide === 'K' ? gameState.bets_k : gameState.bets_b;
  const index = fromSide === 'K' ? betKIndex : betBIndex;

  const bet = sourceList[index];
  const amount = bet.amount;

  // Cek minimal bet di sisi tujuan jika nanti ditambahkan (opsional)
  // Untuk mempermudah, kita langsung pindahkan seluruh nominal.
  
  // Hapus dari asal
  sourceList.splice(index, 1);
  
  // Tambahkan ke tujuan
  targetList.push(bet);

  // Kirim balasan
  return replyRich(ctx, msg.moved({
    amount,
    from: fromSide,
    to: toSide,
    listMarkdown: betListMarkdown(),
  }));
}

/**
 * Mengurangi nominal taruhan user.
 * @param {Context} ctx - Konteks grammY
 * @param {number|string} amountInput - Nominal yang ingin dikurangi, atau 'all'
 */
async function processReduce(ctx, amountInput) {
  const userId = ctx.from.id;

  if (gameState.is_rolling) return replyRich(ctx, msg.rolling());
  if (!gameState.is_game_open) return replyRich(ctx, msg.tableClosed());

  const betKIndex = gameState.bets_k.findIndex((b) => b.user_id === userId);
  const betBIndex = gameState.bets_b.findIndex((b) => b.user_id === userId);

  if (betKIndex === -1 && betBIndex === -1) return replyRich(ctx, msg.noUserBet());

  const side = betKIndex !== -1 ? 'K' : 'B';
  const list = side === 'K' ? gameState.bets_k : gameState.bets_b;
  const index = side === 'K' ? betKIndex : betBIndex;
  const bet = list[index];

  let reduceAmount = amountInput === 'all' ? bet.amount : parseFloat(amountInput);

  if (isNaN(reduceAmount) || reduceAmount <= 0) {
    return replyRich(ctx, msg.betMinimum());
  }

  if (reduceAmount > bet.amount) {
    reduceAmount = bet.amount;
  }

  // Cek jika sisa taruhan kurang dari minimal bet
  const remainder = bet.amount - reduceAmount;
  if (remainder > 0 && remainder < env.minBet) {
    return replyRich(ctx, msg.reduceRemainderTooSmall(bet.amount - env.minBet));
  }

  // Kembalikan saldo
  users.addBalance(userId, reduceAmount);

  // Update state
  if (remainder === 0) {
    list.splice(index, 1); // Hapus taruhan jika habis
  } else {
    bet.amount = remainder; // Kurangi nominal
  }

  return replyRich(ctx, msg.reduced({
    amount: reduceAmount,
    listMarkdown: betListMarkdown(),
  }));
}

module.exports = {
  processBet,
  processMove,
  processReduce,
};