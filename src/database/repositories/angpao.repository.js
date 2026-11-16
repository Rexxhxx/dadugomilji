'use strict';

const { sql } = require('../connection');

/** Muat semua angpao aktif sebagai map keyword -> angpao (tahan restart). */
function loadAngpaos() {
  const map = {};
  for (const r of sql('SELECT * FROM angpaos').all()) {
    map[r.keyword_key] = {
      keywordDisplay: r.keyword_display,
      creatorId: r.creator_id,
      creatorName: r.creator_name,
      amountPerPerson: r.amount_per_person,
      remainingSlots: r.remaining_slots,
      totalSlots: r.total_slots,
      claimedBy: JSON.parse(r.claimed_by || '[]'),
    };
  }
  return map;
}

function saveAngpao(key, a) {
  sql(`INSERT INTO angpaos (keyword_key, keyword_display, creator_id, creator_name, amount_per_person, remaining_slots, total_slots, claimed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(keyword_key) DO UPDATE SET
         remaining_slots = excluded.remaining_slots,
         claimed_by = excluded.claimed_by`)
    .run(key, a.keywordDisplay, a.creatorId || null, a.creatorName, a.amountPerPerson, a.remainingSlots, a.totalSlots, JSON.stringify(a.claimedBy));
}

function deleteAngpao(key) {
  sql('DELETE FROM angpaos WHERE keyword_key = ?').run(key);
}

function deleteAllAngpaos() {
  sql('DELETE FROM angpaos').run();
}

module.exports = { loadAngpaos, saveAngpao, deleteAngpao, deleteAllAngpaos };
