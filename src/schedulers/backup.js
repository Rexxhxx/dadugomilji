'use strict';

/** Backup file database ke owner (otomatis tiap 2 jam atau via perintah `backup`). */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { InputFile } = require('grammy');
const { env } = require('../config');
const { db, DB_PATH, users } = require('../database');
const { safeSend } = require('../ui/rich');
const ownerMsg = require('../ui/messages/owner');
const { formatWibDate } = require('../utils/format');

const BACKUP_INTERVAL_MS = 2 * 60 * 60 * 1000;

async function sendDbBackup(api, targetUserId = null) {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`⚠️ Backup dilewati: file ${DB_PATH} tidak ditemukan.`);
    return;
  }

  const recipients = targetUserId ? [targetUserId] : env.ownerIds;
  const all = users.getAllUsers();
  const caption = ownerMsg.backupCaption({
    time: formatWibDate(),
    totalUsers: all.length,
    totalCoins: all.reduce((acc, u) => acc + u.balance, 0),
  });

  // Snapshot konsisten lewat SQLite online backup: mode WAL menyimpan tulisan
  // terbaru di file -wal, jadi mengirim database.db mentah bisa ketinggalan data.
  const snapshot = path.join(os.tmpdir(), `backup_db_${Date.now()}.db`);
  try {
    await db.backup(snapshot);
    for (const ownerId of recipients) {
      await safeSend(
        () => api.sendDocument(ownerId, new InputFile(snapshot, path.basename(snapshot)), { caption }),
        `backup ke ${ownerId}`,
      );
    }
  } finally {
    fs.rmSync(snapshot, { force: true });
  }
}

function startBackupScheduler(api) {
  return setInterval(() => {
    sendDbBackup(api).catch((err) => console.error('⚠️ Backup otomatis gagal:', err?.message || err));
  }, BACKUP_INTERVAL_MS);
}

module.exports = { sendDbBackup, startBackupScheduler };
