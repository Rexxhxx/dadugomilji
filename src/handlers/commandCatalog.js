'use strict';

/**
 * Katalog perintah: SATU sumber untuk pembagian bot A/B, daftar menu yang
 * ditampilkan ke pemain, dan menu "/" Telegram (setMyCommands).
 *
 * Field:
 *   bot    'A' | 'B'     bot pemilik perintah di mode dua bot
 *   names  alias yang dikenali router bot A/B (names[0] = nama kanonis)
 *   usage  contoh ketik yang ditampilkan di menu
 *   desc   deskripsi singkat untuk menu
 *   where  'privat' | 'grup' | 'semua'
 *   owner  true = khusus owner (TIDAK didaftarkan ke menu "/" publik)
 *   slash  true = didaftarkan ke menu "/" Telegram
 *
 * Catatan:
 *   - `menu`/`help`/`perintah` dijawab KEDUA bot di private chat dengan daftar
 *     perintahnya masing-masing; MENU_NAMES terpisah agar tidak termasuk
 *     daftar `forBot()` (router menanganinya via regex MENU_COMMAND).
 *   - Perintah owner yang sensitif (settingrol, addsaldo, dll.) WAJIB
 *     owner:true + slash:false agar tidak muncul di menu "/" pemain biasa.
 *   - Mengubah pembagian bot cukup di file ini.
 */

/** Deep-freeze agar katalog tidak bisa berubah tak sengaja saat runtime. */
function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) deepFreeze(obj[key]);
  }
  return obj;
}

const COMMANDS = deepFreeze([
  // ---------- Bot A ----------
  { bot: 'A', names: ['start'], usage: 'start', desc: 'Info akun & daftar perintah', where: 'privat', slash: true },
  { bot: 'A', names: ['depo', 'deposit'], usage: 'depo', desc: 'Top up koin via QRIS instan', where: 'privat', slash: true },
  { bot: 'A', names: ['wd', 'tarik'], usage: 'wd', desc: 'Tarik saldo (DANA, GoPay, OVO, SP)', where: 'privat', slash: true },
  { bot: 'A', names: ['riwayat'], usage: 'riwayat', desc: '10 taruhan terakhir', where: 'semua', slash: true },
  { bot: 'A', names: ['ws', 'statusws'], usage: 'ws', desc: 'Status win streak', where: 'semua', slash: true },
  { bot: 'A', names: ['lb'], usage: 'lb', desc: 'Leaderboard menang harian', where: 'semua', slash: true },
  { bot: 'A', names: ['r', 'roll'], usage: 'r', desc: 'Roll BO3 (auto isi selisih)', where: 'grup', slash: true },
  { bot: 'A', names: ['ls', 'list'], usage: 'ls', desc: 'Isi meja sekarang', where: 'grup', slash: true },
  { bot: 'A', names: ['rekap'], usage: 'rekap', desc: 'Selisih meja', where: 'grup', slash: true },
  { bot: 'A', names: ['kur', 'kurang'], usage: 'kur 1', desc: 'Kurangi taruhan (atau kur all)', where: 'grup', slash: false },
  { bot: 'A', names: ['angpao'], usage: 'angpao <kata> <total> <kuota>', desc: 'Bagi koin rebutan', where: 'grup', slash: false },
  { bot: 'A', names: ['listap', 'listangpao'], usage: 'listap', desc: 'Angpao yang masih aktif', where: 'grup', slash: true },
  { bot: 'A', names: ['resetangpao', 'resetap'], usage: 'resetangpao [kata]', desc: 'Hapus angpao (sisa dikembalikan)', where: 'semua', owner: true },
  { bot: 'A', names: ['addsaldo'], usage: 'addsaldo @user 5', desc: 'Tambah saldo pemain', where: 'semua', owner: true },

  // ---------- Bot A: setting roll per grup (khusus owner) ----------
  { bot: 'A', names: ['settingrol'], usage: 'settingrol <id_grup> <kecil|besar>', desc: 'Kunci hasil roll grup', where: 'privat', owner: true, slash: false },
  { bot: 'A', names: ['unsettingrol'], usage: 'unsettingrol <id_grup>', desc: 'Hapus setting roll grup', where: 'privat', owner: true, slash: false },
  { bot: 'A', names: ['listsettingrol'], usage: 'listsettingrol', desc: 'Daftar setting roll aktif', where: 'privat', owner: true, slash: false },

  // ---------- Bot B ----------
  { bot: 'B', names: ['k', 'b', 'kecil', 'besar'], usage: 'k 1 / b 1', desc: 'Pasang Kecil / Besar', where: 'grup', slash: false },
  { bot: 'B', names: ['pindah'], usage: 'pindah', desc: 'Pindah sisi taruhan', where: 'grup', slash: true },
  { bot: 'B', names: ['geser'], usage: 'geser @user 5', desc: 'Transfer saldo ke pemain lain', where: 'grup', slash: false },
  { bot: 'B', names: ['saldo'], usage: 'saldo', desc: 'Cek sisa koin', where: 'semua', slash: true },
  { bot: 'B', names: ['to'], usage: 'to', desc: 'Status turnover & saldo bebas', where: 'semua', slash: true },
  { bot: 'B', names: ['bondep', 'bonusdepo'], usage: 'bondep', desc: 'Daftar bonus deposit', where: 'semua', slash: true },
  { bot: 'B', names: ['cashback'], usage: 'cashback', desc: 'Cek cashback harian', where: 'semua', slash: true },
  { bot: 'B', names: ['claimcb', 'claimcashback', 'klaimcb', 'klaimcashback'], usage: 'claimcb', desc: 'Klaim cashback (18:00–23:59 WIB)', where: 'semua', slash: true },
  { bot: 'B', names: ['claimws', 'klaimws'], usage: 'claimws', desc: 'Klaim bonus win streak', where: 'semua', slash: true },
  { bot: 'B', names: ['lbm'], usage: 'lbm', desc: 'Leaderboard menang mingguan', where: 'semua', slash: true },
  { bot: 'B', names: ['owner'], usage: 'owner', desc: 'Kontak owner', where: 'semua', slash: true },
  { bot: 'B', names: ['minsaldo'], usage: 'minsaldo @user 5', desc: 'Kurangi saldo pemain', where: 'semua', owner: true },
  { bot: 'B', names: ['mincashback'], usage: 'mincashback @user 1', desc: 'Kurangi cashback pemain', where: 'semua', owner: true },
  { bot: 'B', names: ['resetmeja', 'resetbet'], usage: 'resetmeja', desc: 'Kosongkan meja + refund', where: 'grup', owner: true },
  { bot: 'B', names: ['resetlw', 'resetgame'], usage: 'resetlw', desc: 'Reset nomor game & LAST WIN', where: 'grup', owner: true },
  { bot: 'B', names: ['setgame'], usage: 'setgame on / off', desc: 'Buka / tutup meja', where: 'grup', owner: true },
  { bot: 'B', names: ['restore'], usage: 'restore (reply daftar meja)', desc: 'Pulihkan meja', where: 'grup', owner: true },
  { bot: 'B', names: ['bc'], usage: 'bc <pesan>', desc: 'Broadcast ke semua pemain', where: 'semua', owner: true },
  { bot: 'B', names: ['backup'], usage: 'backup', desc: 'Kirim backup database', where: 'privat', owner: true },
  { bot: 'B', names: ['add', 'addadmin'], usage: 'add @user <title>', desc: 'Tambah title admin', where: 'grup', owner: true },
  { bot: 'B', names: ['deladmin'], usage: 'deladmin @user', desc: 'Hapus title admin', where: 'grup', owner: true },
  { bot: 'B', names: ['listadmin'], usage: 'listadmin', desc: 'Daftar title admin', where: 'semua', owner: true },
  { bot: 'B', names: ['admin', 'panel'], usage: 'admin', desc: 'Panel owner', where: 'semua', owner: true },
  { bot: 'B', names: ['stats'], usage: 'stats', desc: 'Total member & koin', where: 'semua', owner: true },
  { bot: 'B', names: ['out', 'leave', 'keluar'], usage: 'out', desc: 'Bot keluar dari grup', where: 'grup', owner: true },
]);

/** Perintah daftar menu; dijawab KEDUA bot di chat privat. */
const MENU_NAMES = Object.freeze(['menu', 'help', 'perintah']);

const forBot = (bot) => COMMANDS.filter((c) => bot === 'ALL' || c.bot === bot);

/** Nama kanonis semua perintah milik bot (alias pertama). */
const canonicalNames = (bot) => forBot(bot).map((c) => c.names[0]);

/** Cari definisi perintah dari salah satu alias (tanpa slash, lowercase). */
function findByName(name) {
  const n = String(name || '').toLowerCase().replace(/^\//, '');
  return COMMANDS.find((c) => c.names.includes(n));
}

module.exports = { COMMANDS, MENU_NAMES, forBot, canonicalNames, findByName };