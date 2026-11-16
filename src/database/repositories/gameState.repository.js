'use strict';

const { db, sql } = require('../connection');
const { EMPTY_PENDING_BETS } = require('../schema');
const { addBalance } = require('./user.repository');

function loadGameState() {
  const row = sql('SELECT game_id, last_wins, last_win_msg_id, is_game_open FROM game_state WHERE id = 1').get();
  if (!row) return { game_id: 1, last_wins: [], last_win_msg_id: null, is_game_open: true };
  return {
    game_id: row.game_id,
    last_wins: JSON.parse(row.last_wins),
    last_win_msg_id: row.last_win_msg_id,
    is_game_open: Boolean(row.is_game_open),
  };
}

function saveGameState(gameId, lastWins, lastWinMsgId, isGameOpen = true) {
  sql('UPDATE game_state SET game_id = ?, last_wins = ?, last_win_msg_id = ?, is_game_open = ? WHERE id = 1')
    .run(gameId, JSON.stringify(lastWins), lastWinMsgId, isGameOpen ? 1 : 0);
}

function resetDbGameState() {
  sql(`UPDATE game_state SET game_id = 1, last_wins = '[]', last_win_msg_id = NULL, is_game_open = 1,
         pending_bets = '${EMPTY_PENDING_BETS}', chat_id = NULL WHERE id = 1`).run();
  lastSnapshot = null;
}

// ---------- Snapshot taruhan meja ----------
// Disimpan bersama chat_id supaya bisa di-refund kalau bot mati di tengah ronde.

// Snapshot dipanggil setelah SETIAP update grup (termasuk chat biasa). Lewati
// tulis kalau isinya sama dengan yang terakhir disimpan proses ini.
let lastSnapshot = null;

function savePendingBets(chatId, betsK, betsB) {
  const json = JSON.stringify({ k: betsK, b: betsB });
  const key = `${chatId ?? ''}|${json}`;
  if (key === lastSnapshot) return;
  sql('UPDATE game_state SET pending_bets = ?, chat_id = ? WHERE id = 1').run(json, chatId ?? null);
  lastSnapshot = key;
}

function loadPendingBets() {
  const row = sql('SELECT pending_bets, chat_id FROM game_state WHERE id = 1').get();
  let parsed = { k: [], b: [] };
  try {
    parsed = JSON.parse(row?.pending_bets || EMPTY_PENDING_BETS);
  } catch (err) {
    console.error('⚠️ pending_bets di DB rusak, dianggap kosong:', err.message);
  }
  return { betsK: parsed.k || [], betsB: parsed.b || [], chatId: row?.chat_id || null };
}

function clearPendingBets() {
  sql(`UPDATE game_state SET pending_bets = '${EMPTY_PENDING_BETS}', chat_id = NULL WHERE id = 1`).run();
  lastSnapshot = null;
}

/**
 * Kembalikan koin taruhan ke pemain lalu bersihkan snapshot, dalam SATU
 * transaksi: kalau gagal di tengah semuanya batal dan snapshot tetap utuh,
 * jadi tidak ada refund separuh jalan yang bisa terbayar dua kali.
 * Bet `restore` manual (user_id 0) dilewati karena saldonya tak pernah dipotong.
 */
function refundBetsAtomic(bets) {
  const refundByUser = {};
  for (const b of bets) {
    if (b && b.user_id > 0 && b.amount > 0) {
      refundByUser[b.user_id] = parseFloat(((refundByUser[b.user_id] || 0) + b.amount).toFixed(2));
    }
  }

  const entries = Object.entries(refundByUser);
  let total = 0;

  db.transaction(() => {
    for (const [uid, amount] of entries) {
      addBalance(Number(uid), amount);
      total = parseFloat((total + amount).toFixed(2));
    }
    clearPendingBets();
  })();

  return { entries, total };
}

module.exports = {
  loadGameState,
  saveGameState,
  resetDbGameState,
  savePendingBets,
  loadPendingBets,
  clearPendingBets,
  refundBetsAtomic,
};
