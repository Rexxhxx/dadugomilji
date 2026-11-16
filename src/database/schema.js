'use strict';

const { db } = require('./connection');
const { getTodayWib, getWeekKeyWib } = require('../utils/time');

const TABLES = `
  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    balance REAL NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    max_streak INTEGER NOT NULL DEFAULT 0,
    cashback REAL NOT NULL DEFAULT 0,
    cashback_date TEXT,
    last_cb_claim TEXT,
    to_target REAL NOT NULL DEFAULT 0,
    to_progress REAL NOT NULL DEFAULT 0,
    total_wins INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    coins REAL NOT NULL,
    rupiah INTEGER NOT NULL,
    status TEXT NOT NULL,
    reference TEXT UNIQUE,
    provider_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bet_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    game_id INTEGER NOT NULL,
    side TEXT NOT NULL,
    amount REAL NOT NULL,
    result TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS game_state (
    id INTEGER PRIMARY KEY,
    game_id INTEGER NOT NULL DEFAULT 1,
    last_wins TEXT NOT NULL DEFAULT '[]',
    last_win_msg_id INTEGER,
    is_game_open INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS title_admins (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    custom_title TEXT NOT NULL,
    added_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS member_tags (
    user_id INTEGER PRIMARY KEY,
    tag TEXT NOT NULL,
    qualified_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS angpaos (
    keyword_key TEXT PRIMARY KEY,
    keyword_display TEXT NOT NULL,
    creator_id INTEGER,
    creator_name TEXT,
    amount_per_person REAL NOT NULL,
    remaining_slots INTEGER NOT NULL,
    total_slots INTEGER NOT NULL,
    claimed_by TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS group_roll_settings (
    chat_id INTEGER PRIMARY KEY,
    side TEXT NOT NULL CHECK (side IN ('K', 'B')),
    set_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS deposit_meta (
    reference TEXT PRIMARY KEY,
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    user_name TEXT,
    provider TEXT NOT NULL DEFAULT 'autogopay',
    coins REAL NOT NULL,
    amount INTEGER NOT NULL,
    bonus_coin REAL NOT NULL DEFAULT 0,
    invoice_msg_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

const EMPTY_PENDING_BETS = '{"k":[],"b":[]}';

const COLUMN_MIGRATIONS = [
  ['users', 'streak', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'max_streak', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'cashback', 'REAL NOT NULL DEFAULT 0'],
  ['users', 'cashback_date', 'TEXT'],
  ['users', 'last_cb_claim', 'TEXT'],
  ['users', 'to_target', 'REAL NOT NULL DEFAULT 0'],
  ['users', 'to_progress', 'REAL NOT NULL DEFAULT 0'],
  ['users', 'total_wins', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'lose_streak', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'tg_username', 'TEXT'],
  ['users', 'lose_event_date', 'TEXT'],
  ['users', 'weekly_wins', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'lose_event_paid', 'REAL NOT NULL DEFAULT 0'],
  ['game_state', 'pending_bets', `TEXT NOT NULL DEFAULT '${EMPTY_PENDING_BETS}'`],
  ['game_state', 'chat_id', 'INTEGER'],
  ['bet_history', 'forced_side', 'TEXT'],
];

function addMissingColumns() {
  const columnsOf = new Map();
  for (const [table] of COLUMN_MIGRATIONS) {
    if (!columnsOf.has(table)) {
      columnsOf.set(table, new Set(db.pragma(`table_info(${table})`).map((c) => c.name)));
    }
  }
  for (const [table, column, definition] of COLUMN_MIGRATIONS) {
    const existing = columnsOf.get(table);
    if (existing.has(column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    existing.add(column);
  }
}

function seedGameState() {
  const exists = db.prepare('SELECT id FROM game_state WHERE id = 1').get();
  if (exists) return;
  db.prepare("INSERT INTO game_state (id, game_id, last_wins, is_game_open) VALUES (1, 1, '[]', 1)").run();
}

function seedLeaderboardSettledDate() {
  const exists = db.prepare("SELECT value FROM kv_store WHERE key = 'lb_settled_date'").get();
  if (exists) return;
  db.prepare("INSERT INTO kv_store (key, value) VALUES ('lb_settled_date', ?)").run(getTodayWib());
}

function seedWeeklyLeaderboardSettled() {
  db.prepare("INSERT OR IGNORE INTO kv_store (key, value) VALUES ('lbw_settled_week', ?)").run(getWeekKeyWib());
}

const INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_bet_history_user ON bet_history (user_id, id DESC);
  DROP INDEX IF EXISTS idx_users_username_lower;
  CREATE INDEX IF NOT EXISTS idx_users_tg_username_lower ON users (LOWER(tg_username));
  CREATE INDEX IF NOT EXISTS idx_users_total_wins ON users (total_wins DESC) WHERE total_wins > 0;
  CREATE INDEX IF NOT EXISTS idx_users_weekly_wins ON users (weekly_wins DESC) WHERE weekly_wins > 0;
  CREATE INDEX IF NOT EXISTS idx_transactions_pending ON transactions (reference) WHERE status = 'pending';
  CREATE INDEX IF NOT EXISTS idx_group_roll_settings_side ON group_roll_settings (side);
`;

function initDb() {
  db.exec(TABLES);
  addMissingColumns();
  db.exec(INDEXES);
  db.pragma('optimize');
  seedGameState();
  seedLeaderboardSettledDate();
  seedWeeklyLeaderboardSettled();
}

module.exports = { initDb, EMPTY_PENDING_BETS };