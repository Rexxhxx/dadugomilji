'use strict';

/** Middleware global: registrasi user otomatis + snapshot taruhan ke DB. */

const { users, gameState: gameStateRepo } = require('../database');
const { gameState } = require('../game/state');

/** Setiap update dari user memastikan barisnya ada di tabel users. */
async function registerUser(ctx, next) {
  const from = ctx.from;
  if (from) {
    try {
      users.createUser(from.id, from.username || from.first_name || `user_${from.id}`, from.username);
    } catch (err) {
      console.error('Gagal registrasi user:', err?.message || err);
    }
  }
  await next();
}

/**
 * Simpan isi meja setelah tiap update di grup.
 *
 * Snapshot ini dipakai saat bot restart di tengah ronde: taruhan direfund dari
 * baris ini, jadi harus selalu mencerminkan state terakhir.
 */
async function persistPendingBets(ctx, next) {
  await next();
  const chat = ctx.chat;
  if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) return;
  try {
    gameStateRepo.savePendingBets(chat.id, gameState.bets_k, gameState.bets_b);
  } catch (err) {
    console.error('Gagal menyimpan snapshot taruhan:', err?.message || err);
  }
}

module.exports = { registerUser, persistPendingBets };
