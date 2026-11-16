'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../database.db');

const db = new Database(DB_PATH);

// WAL: baca tidak menunggu tulis, dan commit jauh lebih cepat (tanpa fsync
// penuh tiap UPDATE). synchronous=NORMAL di WAL tetap aman dari korupsi; yang
// bisa hilang saat listrik mati hanya commit beberapa milidetik terakhir.
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');
db.pragma('temp_store = MEMORY');
db.pragma('cache_size = -16000'); // ~16 MB page cache

const statementCache = new Map();

/**
 * Prepared statement yang di-cache per SQL. Disiapkan saat pertama dipakai
 * (bukan saat modul di-load) supaya aman dipanggil setelah initDb() membuat tabel.
 */
function sql(query) {
  let statement = statementCache.get(query);
  if (!statement) {
    statement = db.prepare(query);
    statementCache.set(query, statement);
  }
  return statement;
}

module.exports = { db, sql, DB_PATH };
