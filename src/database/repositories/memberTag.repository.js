'use strict';

const { sql } = require('../connection');

/** `qualified_date` = tanggal WIB (YYYY-MM-DD) terakhir user memenuhi syarat tag. */
function getMemberTag(userId) {
  return sql('SELECT user_id, tag, qualified_date FROM member_tags WHERE user_id = ?').get(userId);
}

function saveMemberTag(userId, tag, qualifiedDate) {
  sql(`INSERT INTO member_tags (user_id, tag, qualified_date) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET tag = excluded.tag, qualified_date = excluded.qualified_date`)
    .run(userId, tag, qualifiedDate);
}

/** Tag yang syarat terakhirnya terpenuhi sebelum kemarin, jadi sudah lewat masa berlaku. */
function getExpiredMemberTags(today) {
  return sql("SELECT user_id, tag, qualified_date FROM member_tags WHERE qualified_date < date(?, '-1 day')").all(today);
}

function deleteMemberTag(userId) {
  sql('DELETE FROM member_tags WHERE user_id = ?').run(userId);
}

module.exports = { getMemberTag, saveMemberTag, getExpiredMemberTags, deleteMemberTag };
