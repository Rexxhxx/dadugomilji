'use strict';

// ==============================================================================
// PENGAMAN MODUL (ANTI-CRASH)
// ==============================================================================
const { env, WIN_FEE_PERCENT, COIN_PRICE } = require('../../config');

let md;
try {
  md = require('../md');
} catch (err) {
  console.error('⚠️ Gagal memuat ui/md.js:', err.message);
  md = {};
}

// Fallback jika md.js gagal dimuat
const esc = md.esc || ((s) => String(s));
const bold = md.bold || ((s) => `**${s}**`);
const code = md.code || ((s) => `\`${s}\``);
const heading = md.heading || ((s) => `**${s}**`);
const kv = md.kv || ((arr) => arr.map(([k, v]) => `${k}: ${v}`).join('\n'));
const table = md.table || ((headers, rows) => rows.map(r => r.join(' | ')).join('\n'));
const blocks = md.blocks || ((...args) => args.flat().filter(Boolean).join('\n\n'));
const italic = md.italic || ((s) => `*${s}*`);
const quote = md.quote || ((s) => `> ${s}`);

let fmt;
try {
  fmt = require('../../utils/format');
} catch (err) {
  fmt = {};
}
// Fallback jika utils/format gagal dimuat
const coin = fmt.coin || ((n) => `${Number(n || 0).toFixed(2)} Koin`);
const rupiah = fmt.rupiah || ((n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`);

const SIDE_NAME = { K: 'KECIL', B: 'BESAR' };

// ==============================================================================
// FUNGSI PESAN
// ==============================================================================

function betList({ gameId, betsK, betsB, totalK, totalB }) {
  const side = (title, bets, total) => blocks(
    heading(`${title} · ${coin(total)}`, 3),
    bets.length
      ? table(['Pemain', 'Koin'], bets.map((b) => [esc(b.name), bold(coin(b.amount))]), ['l', 'r'])
      : italic('Belum ada yang pasang'),
  );
  const diff = Math.abs(totalK - totalB);
  const status = totalK === 0 && totalB === 0 ? null
    : diff === 0 ? 'Meja seimbang, siap roll.'
      : `${totalK > totalB ? 'BESAR' : 'KECIL'} kurang ${bold(coin(diff))}`;
  return blocks(
    heading(`GAME ${gameId}`, 2),
    side('KECIL', betsK, totalK),
    side('BESAR', betsB, totalB),
    status ? quote(status) : null,
  );
}

const rolling = () => 'Taruhan sedang di-roll, tunggu hasilnya dulu.';
const diceSpinning = () => 'Dadu sedang dikocok — tunggu selesai.';
const tableClosed = () => 'Meja game saat ini sedang ditutup.';
const waitingConfirm = () => 'Menunggu sesi konfirmasi sebelumnya selesai.';
const noBets = () => 'Belum ada taruhan di meja!';
const cooldown = (seconds) => `Tunggu ${bold(`${seconds} detik`)} lagi sebelum roll.`;
const groupOnly = () => 'Perintah ini hanya berlaku di dalam grup.';
const ownerOnly = () => 'Khusus Owner Utama!';

function rekap({ totalK, totalB }) {
  if (totalK === 0 && totalB === 0) return 'Belum ada pasangan di meja.';
  if (totalK === totalB) return 'Meja seimbang! (K 0 / B 0)';
  const diff = Math.abs(totalK - totalB);
  const side = totalK > totalB ? 'B' : 'K';
  return `${side} -${Number.isInteger(diff) ? diff : diff.toFixed(2)}`;
}

const autoBalance = ({ name, side, diff, balance }) => blocks(
  heading('Auto-Balance', 3),
  `Taruhan ${bold(esc(name))} di ${bold(SIDE_NAME[side])} dikurangi ${bold(coin(diff))} supaya meja seimbang.`,
  kv([['Saldo', bold(`${coin(balance)} Koin`)]]),
  quote('BO3 dimulai!'),
);

const fillInsufficient = ({ balance, diff, side }) =>
  `Saldo kamu (${coin(balance)}) tidak cukup untuk mengisi selisih ${bold(coin(diff))} di sisi ${bold(SIDE_NAME[side])}.`;

const fillConfirm = ({ listMarkdown, side, diff, name }) => blocks(
  listMarkdown,
  heading('Konfirmasi Isi Selisih', 3),
  table(
    ['Pemain', 'Sisi', 'Isi dari saldo'],
    [[bold(esc(name)), bold(SIDE_NAME[side]), bold(`${coin(diff)} Koin`)]],
    ['l', 'c', 'r'],
  ),
  'Isi selisih lalu langsung roll?',
  italic('Otomatis batal dalam 30 detik.'),
);

const fillExpired = () => 'Sesi konfirmasi telah kedaluwarsa.';
const notYourSession = () => 'Bukan sesi Anda!';
const fillCancelled = () => 'Pengisian selisih dibatalkan.';
const fillBalanceFailed = () => 'Saldo tidak cukup saat konfirmasi!';
const fillConfirmed = ({ name, diff, side }) =>
  `Dikonfirmasi! ${bold(esc(name))} mengisi ${bold(`${coin(diff)} Koin`)} di sisi ${bold(SIDE_NAME[side])}. Dadu segera berputar!`;

const bo3Start = (forcedSide = null) => (forcedSide
  ? blocks(
    heading('Taruhan IMBANG!', 3),
    `Dadu BO3 dimulai — hasil dikunci owner ke ${bold(SIDE_NAME[forcedSide])}.`,
    italic('Mode setting roll aktif untuk grup ini.'),
  )
  : 'Taruhan IMBANG! Dadu otomatis di-roll BO3...');

const roundCancelled = () => blocks(
  heading('Ronde Dibatalkan', 2),
  'Meja di-reset saat dadu berputar. Ronde ini tidak dihitung dan semua taruhan sudah dikembalikan.',
);

function bo3Result({ winSide, score, dice, totalFee, streaks, loseEvents, forcedSide = null }) {
  const rounds = table(
    ['Lemparan', 'Dadu', 'Sisi'],
    dice.map((d, i) => [`M${i + 1}`, bold(d), d <= 3 ? 'K' : 'B']),
    ['l', 'c', 'c'],
  );
  const streakRows = streaks.map((s) => [
    bold(esc(s.name)),
    `${s.streak}x`,
    s.bonus > 0 ? `+${coin(s.bonus)} siap klaim (${code('claimws')})`
      : s.streak < 3 ? `${3 - s.streak}x lagi menuju bonus` : '-',
  ]);
  const loseRows = loseEvents.map((e) => [bold(esc(e.name)), `${e.total}x`, `+${coin(e.reward)} (wajib TO)`]);

  return blocks(
    heading(`${SIDE_NAME[winSide]} MENANG ${score}`, 2),
    forcedSide ? quote(`Ronde memakai setting owner: ${SIDE_NAME[forcedSide]}.`) : null,
    rounds,
    kv([
      ['Fee meja', `${Math.round(WIN_FEE_PERCENT * 100)}%`],
      ['Total fee', `+${coin(totalFee)} Koin (${esc(rupiah(Math.floor(totalFee * COIN_PRICE)))})`],
    ]),
    streakRows.length ? heading('Win Streak', 4) : null,
    streakRows.length ? table(['Pemain', 'Streak', 'Bonus'], streakRows) : null,
    loseRows.length ? heading('Event Lose', 4) : null,
    loseRows.length ? table(['Pemain', 'Lose', 'Hadiah'], loseRows) : null,
  );
}

const LAST_WIN_ENTRY = /^GAME\s+(\d+)\s*:([KB])\s+(\S+)\s+([\d.]+)$/;

function lastWinsBoard(entries) {
  if (!entries.length) return blocks(heading('LAST WIN', 3), italic('Belum ada ronde selesai.'));
  const rows = entries.map((e) => {
    const m = LAST_WIN_ENTRY.exec(String(e).trim());
    return m ? [m[1], SIDE_NAME[m[2]], esc(m[3]), m[4]] : [esc(e), '', '', ''];
  });
  return blocks(heading('LAST WIN', 3), table(['Game', 'Menang', 'Skor', 'Pool'], rows, ['l', 'l', 'c', 'r']));
}

const gameOpened = (gameId) => `${bold(`GAME ${gameId} DIBUKA!`)} (Min bet: ${coin(env.minBet)} Koin)`;

const betOppositeSide = (side) => `Kamu sudah pasang di sisi ${bold(SIDE_NAME[side])}. Gunakan ${code('pindah')}.`;
const betMinimum = () => `Minimal pasang ${bold(`${coin(env.minBet)} Koin`)}.`;
const balanceInsufficient = () => 'Saldo tidak cukup!';
const noUserBet = () => 'Kamu belum memasang taruhan!';

const moveRemainderTooSmall = (max) =>
  `Sisa taruhan di sisi asal jadi di bawah minimal bet (${coin(env.minBet)}). Maksimal pindah ${bold(coin(max))} atau pindahkan semua.`;
const moveTargetTooSmall = () => `Total taruhan di sisi tujuan minimal ${bold(`${coin(env.minBet)} Koin`)}.`;
const moved = ({ amount, from, to, listMarkdown }) => blocks(
  `${bold('PINDAH MEJA BERHASIL!')} ${coin(amount)} Koin dari ${SIDE_NAME[from]} ke ${SIDE_NAME[to]}.`,
  listMarkdown,
);

const reduceRemainderTooSmall = (max) =>
  `Sisa taruhan tidak boleh di bawah ${coin(env.minBet)} Koin. Maksimal kur ${bold(coin(max))} atau ${code('kur all')}.`;
const reduced = ({ amount, listMarkdown }) => blocks(
  `${bold('TARUHAN DIKURANGI!')} ${coin(amount)} Koin dikembalikan ke saldo.`,
  listMarkdown,
);

const transferMinimum = () => `Nominal geser minimal ${bold('0.01 Koin')}.`;
const transferSelf = () => 'Tidak bisa transfer ke akun sendiri!';
const transferUserNotFound = () => 'User tidak ditemukan. Pastikan dia pernah memakai bot.';
const transferred = ({ amount, target }) => `${bold('TRANSFER SALDO BERHASIL!')} ${coin(amount)} Koin terkirim ke ${bold(esc(target))}.`;

const angpaoInvalid = () => 'Nominal & kuota harus angka positif.';
const angpaoDuplicate = () => 'Angpao dengan kata kunci tersebut sudah aktif!';
const angpaoGroupOnly = () => 'Klaim angpao hanya bisa dilakukan di dalam grup game!';
const angpaoAlreadyClaimed = () => 'Kamu sudah mengklaim angpao ini.';

const angpaoCreated = ({ creator, total, slots, perPerson, keyword }) => blocks(
  heading('Angpao Dibagikan!', 2),
  kv([
    ['Dari', esc(creator)],
    ['Total', `${coin(total)} Koin`],
    ['Kuota', `${slots} orang @ ${coin(perPerson)} Koin`],
  ]),
  `Ketik ${code(keyword)} untuk rebutan!`,
);

const angpaoClaimed = ({ name, amount, balance, remaining }) => blocks(
  `${bold('ANGPAO TERKLAIM!')} ${bold(esc(name))} dapat ${bold(`+${coin(amount)} Koin`)}.`,
  `Saldo: ${coin(balance)} Koin · Sisa slot: ${remaining}`,
);

const angpaoEmpty = (keyword) => `Angpao ${code(keyword)} sudah HABIS!`;
const angpaoResetDenied = () => 'Akses ditolak! Khusus Owner Utama.';
const angpaoResetNotFound = (keyword) => `Angpao ${code(keyword)} tidak ditemukan.`;
const angpaoReset = (removed) => (removed.length
  ? blocks(
    `${bold(`${removed.length} angpao`)} dihapus.`,
    table(
      ['Kata kunci', 'Pembuat', 'Refund'],
      removed.map((r) => [code(r.keyword), esc(r.creatorName), r.refund > 0 ? bold(`+${coin(r.refund)}`) : '-']),
      ['l', 'l', 'r'],
    ),
  )
  : 'Tidak ada angpao aktif.');

function resetTable({ entries, total, names }) {
  if (!entries.length) {
    return blocks(
      heading('Meja Sudah Direset', 2),
      'Tidak ada taruhan yang perlu dikembalikan. Kunci roll dilepas, meja siap dipakai lagi.',
    );
  }
  const MAX_SHOWN = 10;
  const rows = entries.slice(0, MAX_SHOWN).map(([uid, amt]) => [esc(names[uid] || `ID ${uid}`), bold(`+${coin(amt)}`)]);
  return blocks(
    heading('Meja Direset & Taruhan Dikembalikan', 2),
    kv([
      ['Pemain', `${entries.length} orang`],
      ['Total refund', bold(`${coin(total)} Koin`)],
    ]),
    table(['Pemain', 'Refund'], rows, ['l', 'r']),
    entries.length > MAX_SHOWN ? italic(`...dan ${entries.length - MAX_SHOWN} pemain lainnya`) : null,
    'Meja bersih & kunci roll dilepas. Silakan pasang lagi.',
  );
}

const resetLw = () => `Sesi meja game di-reset ke ${bold('GAME 1')}.`;

const restartRefund = ({ total, players }) => blocks(
  heading('Bot Sempat Restart di Tengah Ronde', 2),
  `Semua taruhan yang belum selesai (${bold(`${coin(total)} Koin`)}, ${players} pemain) sudah dikembalikan ke saldo masing-masing.`,
  'Silakan pasang ulang.',
);

const restoreNeedReply = () => `Reply pesan daftar taruhan lalu ketik ${code('restore')}.`;
const restoreFailed = () => 'Gagal membaca format list.';
const restored = ({ count, listMarkdown }) => blocks(`${bold('RESTORE BERHASIL!')} ${count} data dipulihkan.`, listMarkdown);

const leaveGroup = () => 'DADUGO MILJI pamit undur diri dari grup ini. Terima kasih!';
const antiKidnap = () => 'Maaf, bot ini privat dan hanya bisa dimasukkan ke grup oleh Owner (Milji). Saya pamit undur diri.';

const settingRollInvalid = () => 'Format: /settingrol [id_group] [kecil|besar]';
const settingRollInvalidSide = () => 'Sisi harus "kecil" atau "besar".';
const settingRollNotGroup = () => 'id_group harus berupa angka ID grup (bisa negatif, mis. -1001234567890).';
const settingRollSaved = ({ chatId, side }) => blocks(
  heading('Setting Roll Disimpan', 2),
  kv([
    ['Group', code(String(chatId))],
    ['Hasil dipaksa', bold(SIDE_NAME[side])],
  ]),
  italic('Semua ronde /roll di grup ini akan dimenangkan sisi tsb sampai di-unset.'),
);
const settingRollRemoved = ({ chatId }) => blocks(
  heading('Setting Roll Dihapus', 2),
  `Group ${code(String(chatId))} kembali ke dadu normal.`,
);
const settingRollNotFound = ({ chatId }) => `Tidak ada setting roll aktif untuk group ${code(String(chatId))}.`;
const settingRollList = (rows) => (rows.length
  ? blocks(
    heading('Daftar Setting Roll', 2),
    table(
      ['Group', 'Dipaksa', 'Diubah'],
      rows.map((r) => [code(String(r.chat_id)), bold(SIDE_NAME[r.side]), esc(String(r.updated_at || '-'))]),
      ['l', 'l', 'l'],
    ),
  )
  : 'Tidak ada setting roll aktif.');

module.exports = {
  SIDE_NAME,
  betList,
  rolling,
  diceSpinning,
  tableClosed,
  waitingConfirm,
  noBets,
  cooldown,
  groupOnly,
  ownerOnly,
  rekap,
  autoBalance,
  fillInsufficient,
  fillConfirm,
  fillExpired,
  notYourSession,
  fillCancelled,
  fillBalanceFailed,
  fillConfirmed,
  bo3Start,
  roundCancelled,
  bo3Result,
  lastWinsBoard,
  gameOpened,
  betOppositeSide,
  betMinimum,
  balanceInsufficient,
  noUserBet,
  moveRemainderTooSmall,
  moveTargetTooSmall,
  moved,
  reduceRemainderTooSmall,
  reduced,
  transferMinimum,
  transferSelf,
  transferUserNotFound,
  transferred,
  angpaoInvalid,
  angpaoDuplicate,
  angpaoGroupOnly,
  angpaoAlreadyClaimed,
  angpaoCreated,
  angpaoClaimed,
  angpaoEmpty,
  angpaoResetDenied,
  angpaoResetNotFound,
  angpaoReset,
  resetTable,
  resetLw,
  restartRefund,
  restoreNeedReply,
  restoreFailed,
  restored,
  leaveGroup,
  antiKidnap,
  settingRollInvalid,
  settingRollInvalidSide,
  settingRollNotGroup,
  settingRollSaved,
  settingRollRemoved,
  settingRollNotFound,
  settingRollList,
};