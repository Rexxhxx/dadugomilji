'use strict';

/**
 * Teks Rich Markdown untuk menu akun pemain (start, saldo, TO, cashback,
 * win streak, riwayat, bonus deposit, leaderboard, angpao).
 *
 * Semua fungsi murni: terima data, kembalikan string markdown.
 */

const { env, COIN_PRICE, LB_PRIZES, LBW_PRIZES, LB_MIN_BET } = require('../../config');
const { esc, bold, code, heading, kv, table, blocks, divider, italic, details, fancy } = require('../md');
const { coin, rupiah } = require('../../utils/format');
const { DEPOSIT_BONUS_TIERS } = require('../../services/deposit.service');
const { forBot } = require('../../handlers/commandCatalog');

const WHERE_LABEL = { privat: 'Privat', grup: 'Grup', semua: 'Semua' };

/** Tabel perintah: Perintah | Fungsi | Tempat. */
function commandTable(commands) {
  return [
    '| Perintah | Fungsi | Tempat |',
    '|:--|:--|:--|',
    ...commands.map((c) => `| ${code(c.usage)} | ${esc(c.desc)} | ${WHERE_LABEL[c.where]} |`),
  ].join('\n');
}

/**
 * Daftar perintah untuk satu bot.
 * `role` 'A' | 'B' | 'ALL', `me`/`other` = username bot ini & pasangannya.
 * Perintah owner hanya ditampilkan ke owner.
 */
function commandList({ role, me, other, isOwner = false }) {
  const players = (bot) => forBot(bot).filter((c) => !c.owner);
  const owners = forBot(role).filter((c) => c.owner);

  if (role === 'ALL') {
    return blocks(
      details(bold(fancy('Menu Chat Privat')), commandTable(players('ALL').filter((c) => c.where !== 'grup')), true),
      details(bold(fancy('Menu di Grup')), commandTable(players('ALL').filter((c) => c.where !== 'privat'))),
      isOwner && owners.length ? details(bold(fancy('Khusus Owner')), commandTable(owners)) : null,
    );
  }

  const otherRole = role === 'A' ? 'B' : 'A';
  return blocks(
    heading(`Perintah di bot ini${me ? ` (@${me})` : ''}`, 3),
    commandTable(players(role)),
    isOwner && owners.length ? details(bold(fancy('Khusus Owner (bot ini)')), commandTable(owners)) : null,
    details(
      bold(fancy(`Perintah di bot lain${other ? ` (@${other})` : ''}`)),
      commandTable(players(otherRole)),
    ),
    italic(`Ketik perintah ke bot yang sesuai. Di grup cukup ketik biasa, bot yang benar akan membalas.`),
  );
}

const commandMenu = (opts) => blocks(heading('Daftar Perintah', 2), commandList(opts));

function start({ user, balance, cashback, menu }) {
  return blocks(
    heading('DADUGO MILJI', 1),
    `Halo ${bold(esc(user.first_name || 'Pemain'))}! Platform dadu BO3 otomatis — deposit QRIS instan, withdraw instan.`,
    heading('Informasi Akun', 3),
    kv([
      ['ID', code(user.id)],
      ['Saldo', bold(`${coin(balance)} Koin`)],
      ['Cashback hari ini', `${coin(cashback)} Koin`],
      ['Nilai rupiah', bold(esc(rupiah(Math.floor(balance * COIN_PRICE))))],
    ]),
    commandList(menu || { role: 'ALL' }),
    divider(),
    italic(`Owner: ${esc(env.ownerUsername)}`),
  );
}

function bondep() {
  const rows = DEPOSIT_BONUS_TIERS.slice().reverse().map((tier, index, arr) => {
    const next = arr[index + 1];
    const range = next
      ? `${esc(rupiah(tier.min))} – ${esc(rupiah(next.min - 1))}`
      : `≥ ${esc(rupiah(tier.min))}`;
    return [range, bold(`+${coin(tier.coinBonus)} Koin`)];
  });

  return blocks(
    heading('Bonus Deposit', 2),
    'Bonus koin otomatis masuk bersamaan dengan deposit.',
    kv(rows, ['Nominal Deposit', 'Bonus']),
    italic('Rate: Rp1.000 = 1 Koin'),
  );
}

function saldo({ user, balance, cashback }) {
  return blocks(
    heading('Dompet Milji', 2),
    kv([
      ['Akun', esc(user.first_name || 'Pemain')],
      ['Saldo', bold(`${coin(balance)} Koin`)],
      ['Cashback hari ini', `${coin(cashback)} Koin`],
      ['Nilai', bold(esc(rupiah(Math.floor(balance * COIN_PRICE))))],
    ]),
  );
}

function turnover(info) {
  return blocks(
    heading('Status Turnover', 2),
    kv([
      ['Progress TO', `${coin(info.progress)} / ${coin(info.target)}`],
      ['Sisa TO', bold(coin(info.sisa))],
      ['Saldo', `${coin(info.balance)} Koin`],
      ['Saldo bebas tarik', bold(`${coin(info.bebas)} Koin`)],
    ]),
  );
}

function cashbackInfo({ amount, alreadyClaimed }) {
  const body = alreadyClaimed
    ? 'Kamu sudah klaim cashback hari ini. Besok bisa ambil lagi jam 18.00–23.59 WIB.'
    : amount > 0
      ? `Ada ${bold(`+${coin(amount)} Koin`)} yang bisa diambil. Ketik ${code('claimcb')} untuk klaim (jam 18.00–23.59 WIB).`
      : 'Belum ada yang bisa diambil hari ini. Main dulu ya.';

  return blocks(heading('Cashback Kamu', 2), 'Balik modal dari taruhan kalah minimal 3 koin.', body);
}

const cashbackNotOpen = () => blocks(
  heading('Klaim Cashback Belum Dibuka', 2),
  'Cashback harian hanya bisa diklaim pukul 18.00–23.59 WIB.',
);

const cashbackAlreadyClaimed = () => blocks(
  heading('Sudah Diklaim', 2),
  'Kamu sudah mengklaim cashback hari ini. Besok bisa ambil lagi jam 18.00–23.59 WIB.',
);

const cashbackClaimed = (claimed) => blocks(
  heading('Cashback Masuk', 2),
  `Cashback dari taruhan kalah masuk: ${bold(`+${coin(claimed)} Koin`)}.`,
  italic('Koin ini harus dimainkan dulu (TO), belum bisa langsung ditarik.'),
);

function winStreak({ user, info, bonus }) {
  const name = user.username ? `@${user.username}` : user.first_name || 'Pemain';
  const status = info.streak >= 20
    ? `${bold('MAX WIN STREAK TERCAPAI!')} Ketik ${code('claimws')} sekarang.`
    : info.streak >= 3
      ? `Bonus tersimpan ${bold(`+${coin(bonus)} Koin`)}. Ketik ${code('claimws')} untuk ambil atau lanjut main.`
      : `Bonus belum aktif (minimal WS 3x). Menang beruntun lagi ${bold(`${3 - info.streak}x`)}.`;

  return blocks(
    heading('Status Win Streak', 2),
    kv([
      ['User', esc(name)],
      ['Streak', bold(`${info.streak}x`)],
      ['Bonus saat ini', `${coin(bonus)} Koin`],
      ['Min. bet', `${coin(env.wsMinBet)} Koin`],
      ['Max streak', '20x (bonus 18 Koin)'],
    ]),
    status,
  );
}

const winStreakEmpty = () => 'Tidak ada bonus win streak untuk diklaim.';

const winStreakClaimed = ({ name, streak, bonus, balance }) => blocks(
  heading('Bonus Win Streak Diklaim', 2),
  kv([
    ['Pemain', esc(name)],
    ['Streak selesai', `${streak}x Win`],
    ['Bonus masuk', bold(`+${coin(bonus)} Koin`)],
    ['Saldo sekarang', bold(`${coin(balance)} Koin`)],
  ]),
  italic('Streak di-reset ke 0. Bonus ini wajib dimainkan dulu (TO) sebelum bisa ditarik.'),
);

function history(items) {
  if (!items.length) return blocks(heading('Riwayat', 2), 'Belum ada riwayat permainan.');
  const rows = items.map((i) => [esc(i.created_at), esc(i.side), coin(i.amount), i.result === 'W' ? bold('Menang') : 'Kalah']);
  return blocks(heading('10 Pick Terakhir', 2), table(['Waktu', 'Sisi', 'Nominal', 'Hasil'], rows, ['l', 'c', 'r', 'c']));
}

function angpaoList(angpaos) {
  const keys = Object.keys(angpaos);
  if (!keys.length) return 'Tidak ada angpao aktif.';
  const rows = keys.map((k) => {
    const a = angpaos[k];
    return [code(a.keywordDisplay), esc(a.creatorName), `${a.remainingSlots}/${a.totalSlots}`, coin(a.amountPerPerson)];
  });
  return blocks(
    heading('Angpao Aktif', 2),
    table(['Kata kunci', 'Dari', 'Sisa slot', 'Koin/orang'], rows, ['l', 'l', 'c', 'r']),
    italic('Ketik kata kuncinya di grup untuk klaim.'),
  );
}

const playerName = (u, i) => esc(u.username ? `@${u.username}` : `User_${i + 1}`);

/** Tabel peringkat; `prizes` opsional untuk kolom hadiah. */
function rankTable(rows, prizes) {
  const headers = prizes ? ['#', 'Pemain', 'Menang', 'Hadiah'] : ['#', 'Pemain', 'Menang'];
  return table(headers, rows.map(([name, wins], i) => [
    String(i + 1), name, bold(String(wins)), ...(prizes ? [`+${coin(prizes[i])}`] : []),
  ]), ['c', 'l', 'c', 'r']);
}

function leaderboard({ userWins, targetWins, top }) {
  return blocks(
    heading('Leaderboard Harian', 2),
    kv([
      ['Menang kamu', bold(`${userWins}x / ${targetWins}x`)],
      ['Kurang', `${Math.max(0, targetWins - userWins)}x menang lagi`],
      ['Syarat sah', `Menang dengan taruhan minimal ${coin(LB_MIN_BET)} Koin`],
      ['Reset', 'Setiap 00.00 WIB'],
    ]),
    heading('Top 5', 3),
    top.length
      ? rankTable(top.map((u, i) => [playerName(u, i), u.total_wins]), LB_PRIZES)
      : 'Belum ada data pemenang.',
    italic('Hadiah dalam Koin, wajib TO 50%.'),
    `Pengumuman harian di @DadugoMilji. Mingguan: ketik ${code('lbm')}`,
  );
}

function weeklyLeaderboard({ weeklyWins, weeklyTop }) {
  return blocks(
    heading('Leaderboard Mingguan', 2),
    kv([
      ['Menang kamu minggu ini', bold(`${weeklyWins}x`)],
      ['Syarat sah', `Menang dengan taruhan minimal ${coin(LB_MIN_BET)} Koin`],
      ['Periode', 'Senin 00.00 – Minggu 23.59 WIB'],
    ]),
    heading('Top 3', 3),
    weeklyTop.length
      ? rankTable(weeklyTop.map((u, i) => [playerName(u, i), u.weekly_wins]), LBW_PRIZES)
      : 'Belum ada data pemenang minggu ini.',
    italic('Hadiah: Juara 1 70, Juara 2 50, Juara 3 30 Koin, wajib TO 50%.'),
    `Pengumuman mingguan di @DadugoMilji. Harian: ketik ${code('lb')}`,
  );
}

function weeklyLeaderboardAnnouncement(winners) {
  return blocks(
    heading('Hasil Leaderboard Mingguan', 2),
    winners.length
      ? rankTable(winners.map((w) => [esc(w.display), w.weekly_wins]), winners.map((w) => w.prize))
      : 'Belum ada pemenang minggu ini.',
    italic('Hadiah wajib TO 50%. Periode mingguan baru dimulai.'),
  );
}

function leaderboardAnnouncement(winners) {
  return blocks(
    heading('Hasil Leaderboard Harian', 2),
    winners.length
      ? rankTable(winners.map((w) => [esc(w.display), w.total_wins]), winners.map((w) => w.prize))
      : 'Belum ada pemenang periode ini.',
    italic('Hadiah wajib TO 50%. Periode baru dimulai.'),
  );
}

const ownerContact = () => blocks(
  heading('Owner Bot', 2),
  `Hubungi ${esc(env.ownerUsername)} untuk bantuan.`,
);

module.exports = {
  start,
  commandMenu,
  bondep,
  saldo,
  turnover,
  cashbackInfo,
  cashbackNotOpen,
  cashbackAlreadyClaimed,
  cashbackClaimed,
  winStreak,
  winStreakEmpty,
  winStreakClaimed,
  history,
  angpaoList,
  leaderboard,
  leaderboardAnnouncement,
  weeklyLeaderboard,
  weeklyLeaderboardAnnouncement,
  ownerContact,
};
