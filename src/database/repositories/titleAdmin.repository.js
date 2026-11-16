'use strict';

const { sql } = require('../connection');

function addTitleAdmin(userId, username, customTitle, addedBy) {
  sql('INSERT OR REPLACE INTO title_admins (user_id, username, custom_title, added_by) VALUES (?, ?, ?, ?)')
    .run(userId, username, customTitle, addedBy);
}

function removeTitleAdmin(userId) {
  return sql('DELETE FROM title_admins WHERE user_id = ?').run(userId).changes > 0;
}

function getTitleAdminsList() {
  return sql('SELECT * FROM title_admins ORDER BY user_id ASC').all();
}

function isTitleAdmin(userId) {
  return !!sql('SELECT 1 FROM title_admins WHERE user_id = ?').get(userId);
}

module.exports = { addTitleAdmin, removeTitleAdmin, getTitleAdminsList, isTitleAdmin };
