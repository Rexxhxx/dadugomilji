'use strict';

/** Teks Rich Markdown untuk perintah owner (panel, statistik, saldo, admin title, broadcast). */

const { esc, bold, code, heading, kv, table, blocks, italic } = require('../md');
const { coin } = require('../../utils/format');
const { env } = require('../../config');

const accessDenied = () => 'Akses ditolak! Khusus Owner Utama.';

const commandRows = (rows) => table(['Perintah', 'Fungsi'], rows.map(([c, d]) => [code(c), d]));

function panel() {
  return blocks(
    heading('Panel Owner DADUGO MILJI', 1),
    heading('Saldo & Cashback', 3),
    commandRows([
      ['addsaldo @username <nominal>', 'Tambah saldo'],
      ['minsaldo @username <nominal>', 'Kurangi saldo'],
      ['mincashback @username <nominal>', 'Kurangi cashback'],
    ]),
    heading('Game & Restore', 3),
    commandRows([
      ['resetmeja', 'Reset meja nyangkut + refund taruhan'],
      ['restore', 'Reply list taruhan untuk memulihkan meja'],
      ['setgame on/off', 'Buka atau tutup meja'],
      ['resetlw', 'Reset meja ke GAME 1'],
      ['resetangpao [kata]', 'Hapus angpao + refund sisa'],
      ['out', 'Keluar dari grup'],
    ]),
    heading('Admin Custom Title', 3),
    commandRows([
      ['add @username <title>', 'Angkat admin pajangan'],
      ['deladmin @username', 'Turunkan admin'],
      ['listadmin', 'Daftar admin title'],
    ]),
    heading('Data & Informasi', 3),
    commandRows([
      ['backup', 'Kirim file database ke chat pribadi'],
      ['stats', 'Total member & koin'],
      ['bc <pesan>', 'Broadcast ke semua user'],
    ]),
  );
}

const stats = ({ totalUsers, totalCoins, gameId }) => blocks(
  heading('Statistik Bot', 2),
  kv([
    ['Total member', bold(`${totalUsers} orang`)],
    ['Total koin', bold(`${coin(totalCoins)} Koin`)],
    ['Game saat ini', bold(`GAME ${gameId}`)],
  ]),
);

const balanceFormat = (command) => `Format: ${code(`${command} @username <nominal>`)} atau reply pesan user lalu ${code(`${command} <nominal>`)}.`;
const userNotFound = () => 'User tidak ditemukan. Pastikan dia pernah memakai bot.';

const balanceAdded = ({ target, amount, total }) =>
  `Saldo ${bold(esc(target))} ditambah ${bold(`+${coin(amount)} Koin`)}. Total sekarang ${bold(`${coin(total)} Koin`)}.`;

const balanceRemoved = ({ target, amount, total }) =>
  `Saldo ${bold(esc(target))} dikurangi ${bold(`-${coin(amount)} Koin`)}. Total sekarang ${bold(`${coin(total)} Koin`)}.`;

const balanceRemoveFailed = ({ target }) => `Saldo ${bold(esc(target))} tidak cukup untuk dikurangi.`;

const cashbackReduced = ({ target, amount, total }) =>
  `Cashback ${bold(esc(target))} dikurangi ${bold(`-${coin(amount)} Koin`)}. Sisa ${bold(`${coin(total)} Koin`)}.`;

const adminTitleFormat = () => `Format: ${code('add @username <Nama Title>')} atau reply pesan user lalu ${code('add <Nama Title>')}.`;

const adminTitleSaved = ({ target, title }) =>
  `${bold(esc(target))} disimpan sebagai admin title ${bold(esc(title))}.`;

const adminTitlePromoted = ({ target, title }) => blocks(
  heading('Admin Title Dipasang', 2),
  kv([
    ['User', esc(target)],
    ['Title', bold(esc(title))],
  ]),
  italic('Title hanya pajangan, tanpa izin admin apa pun.'),
);

const adminTitlePromoteFailed = ({ target, reason }) => blocks(
  `${bold(esc(target))} tersimpan di database, tapi gagal diangkat di grup.`,
  italic(esc(reason || 'Pastikan bot admin dengan izin "Tambah Admin Baru".')),
);

const adminTitleRemoved = (target) => `${bold(esc(target))} dihapus dari daftar admin title.`;

function adminList(titleAdmins) {
  const owners = table(['ID', 'Peran'], env.ownerIds.map((id) => [code(id), 'Owner Utama']));
  const titles = titleAdmins.length
    ? table(['User', 'Title'], titleAdmins.map((a) => [esc(a.username ? `@${a.username}` : a.user_id), bold(esc(a.custom_title))]))
    : italic('Belum ada admin title.');
  return blocks(heading('Daftar Admin', 2), heading('Owner', 3), owners, heading('Admin Title', 3), titles);
}

const gameOpened = () => `${bold('Meja DaduGo DIBUKA!')}`;
const gameClosed = () => `${bold('Meja DaduGo DITUTUP!')}`;

const broadcastFormat = () => `Format: ${code('bc <pesan>')}`;
const broadcastSending = (total) => `Mengirim broadcast ke ${bold(`${total} user`)}...`;
const broadcastDone = ({ sent, total }) => `Broadcast terkirim ke ${bold(`${sent}/${total}`)} user.`;
const broadcastMessage = (text) => blocks(heading('Pengumuman', 2), esc(text));

const backupSent = () => 'Backup database telah dikirim ke chat pribadi kamu.';
// Caption dokumen tidak mendukung Rich Message, jadi teks polos.
const backupCaption = ({ time, totalUsers, totalCoins }) =>
  `BACKUP DATABASE OTOMATIS\n\nWaktu: ${time}\nTotal akun: ${totalUsers}\nTotal saldo: ${coin(totalCoins)} Koin`;

module.exports = {
  accessDenied,
  panel,
  stats,
  balanceFormat,
  userNotFound,
  balanceAdded,
  balanceRemoved,
  balanceRemoveFailed,
  cashbackReduced,
  adminTitleFormat,
  adminTitleSaved,
  adminTitlePromoted,
  adminTitlePromoteFailed,
  adminTitleRemoved,
  adminList,
  gameOpened,
  gameClosed,
  broadcastFormat,
  broadcastSending,
  broadcastDone,
  broadcastMessage,
  backupSent,
  backupCaption,
};
