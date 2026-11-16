'use strict';

/** Teks Rich Markdown untuk alur deposit QRIS dan withdraw e-wallet. */

const { env, MIN_DEPOSIT_RUPIAH, COIN_PRICE } = require('../../config');
const { esc, bold, code, heading, kv, table, blocks, italic, quote } = require('../md');
const { coin, rupiah } = require('../../utils/format');
const { DEPOSIT_BONUS_TIERS } = require('../../services/deposit.service');
const { WITHDRAW_BONUS_TIERS } = require('../../services/withdraw.service');

/** Blok info event withdraw (dipakai di form jumlah tarik). */
const withdrawEventInfo = () => blocks(
  heading('Event Withdraw', 4),
  table(['Tarik', 'Bonus', 'Nilai'], WITHDRAW_BONUS_TIERS.slice().reverse()
    .map((t) => [`${t.min}+ Koin`, bold(`+${coin(t.bonus)} Koin`), esc(rupiah(t.bonus * COIN_PRICE))]), ['l', 'r', 'r']),
  italic('Bonus masuk otomatis setelah WD sukses, wajib TO 50% dari bonus.'),
);

// ---------- Deposit ----------

const depositPrivateOnly = () => `Gunakan perintah ${code('deposit')} atau ${code('depo')} di chat pribadi dengan bot.`;

function depositIntro() {
  const tiers = DEPOSIT_BONUS_TIERS.slice().reverse()
    .map((t) => [`${esc(rupiah(t.min))}+`, bold(`+${coin(t.coinBonus)} Koin`)]);
  return blocks(
    heading('Top Up Koin (QRIS)', 2),
    kv([
      ['Minimal', `${esc(rupiah(MIN_DEPOSIT_RUPIAH))} (${coin(MIN_DEPOSIT_RUPIAH / COIN_PRICE)} Koin)`],
      ['Rate', 'Rp1.000 = 1 Koin'],
    ]),
    heading('Bonus Otomatis', 3),
    table(['Deposit', 'Bonus'], tiers, ['l', 'r']),
    `Ketik nominal sekarang dalam Rupiah, contoh ${code('5000')}, ${code('10000')}, ${code('50000')}.`,
  );
}

const depositMinimum = () => `Minimal deposit ${bold(esc(rupiah(MIN_DEPOSIT_RUPIAH)))} (${code(coin(MIN_DEPOSIT_RUPIAH / COIN_PRICE))} Koin).`;

const depositChooseMethod = (amount) => blocks(
  `Nominal deposit: ${bold(esc(rupiah(amount)))}`,
  'Pilih metode QRIS untuk pembayaran:',
);

const depositSessionExpired = () => `Sesi deposit habis. Ketik ${code('deposit')} lagi.`;
const depositCreating = (name) => `${bold(`Sedang membuat QRIS ${esc(name)}...`)}`;
const depositCreateFailed = (msg) => `${bold('Gagal membuat QRIS:')} ${esc(msg || 'Server pembayaran tidak merespons.')}`;

/** `qrMarkdown` = markdown gambar QR (sudah jadi), disisipkan di atas detail. */
function depositInvoice({ label, transactionId, amount, coins, bonusCoin, qrMarkdown }) {
  return blocks(
    qrMarkdown,
    heading(`Invoice ${esc(label)}`, 2),
    kv([
      ['Transaction ID', code(transactionId)],
      ['Nominal', `${esc(rupiah(amount))} (${coin(coins)} Koin)`],
      bonusCoin > 0 && ['Bonus depo', bold(`+${coin(bonusCoin)} Koin`)],
      ['Status', '**MENUNGGU PEMBAYARAN**'],
      ['Batas waktu', '15 Menit'],
    ]),
    heading('Instruksi', 3),
    [
      '1. Scan QRIS di atas dengan m-Banking atau e-wallet apa saja.',
      '2. Bayar sesuai nominal yang tertera.',
      '3. Saldo otomatis masuk setelah pembayaran terdeteksi.',
    ].join('\n'),
  );
}

const depositSuccess = ({ transactionId, coins, bonusCoin, total, balance }) => blocks(
  heading('Deposit Berhasil', 2),
  kv([
    ['Koin pokok', `${coin(coins)} Koin`],
    bonusCoin > 0 && ['Bonus depo', `+${coin(bonusCoin)} Koin`],
    ['Total didapat', bold(`${coin(total)} Koin`)],
    ['Saldo sekarang', bold(`${coin(balance)} Koin`)],
    ['Transaksi', code(transactionId)],
  ]),
  'Selamat bermain di DADUGO MILJI!',
);

const depositExpired = ({ transactionId, amount, coins }) => blocks(
  heading('Invoice Kedaluwarsa', 2),
  kv([
    ['Transaction ID', code(transactionId)],
    ['Nominal', `${esc(rupiah(amount))} (${coin(coins)} Koin)`],
    ['Status', '**EXPIRED**'],
  ]),
  `Silakan buat deposit baru dengan perintah ${code('deposit')}.`,
);

// ---------- Withdraw ----------

const withdrawPrivateOnly = () => `Gunakan perintah ${code('tarik')} atau ${code('wd')} di chat pribadi.`;

const withdrawMaintenance = ({ start, end }) => blocks(
  heading('Penarikan Sementara Ditutup', 2),
  `Okeconnect sedang maintenance harian pukul ${bold(`${start}–${end} WIB`)}.`,
  `Penarikan dibuka kembali setelah ${bold(`${end} WIB`)}. Saldo kamu aman.`,
);

const withdrawMustJoin = () => `Wajib join channel ${esc(env.requiredChannelUsername)} dulu sebelum tarik saldo.`;

const withdrawTurnoverNotMet = (info) => blocks(
  heading('Penarikan Gagal', 2),
  'Turnover (TO) kamu belum terpenuhi.',
  kv([
    ['Progress', `${coin(info.progress)} / ${coin(info.target)}`],
    ['Sisa TO', bold(coin(info.sisa))],
  ]),
);

const withdrawMinimum = () => `Minimal tarik ${bold(`${coin(env.minWithdrawCoin)} Koin`)}.`;
const withdrawChooseMethod = () => blocks(heading('Tarik Saldo', 2), 'Pilih e-wallet pencairan instan:');
const withdrawAskPhone = (method) => `Masukkan nomor HP ${bold(esc(method))} (contoh ${code('081234567890')}):`;
const withdrawInvalidPhone = () => 'Nomor HP tidak valid. Masukkan minimal 10 digit angka.';

const withdrawAskAmount = ({ method, fee }) => blocks(
  `Masukkan jumlah koin yang ingin ditarik ke ${bold(esc(method))}.`,
  kv([
    ['Minimal', `${coin(env.minWithdrawCoin)} Koin`],
    ['Fee admin', `${coin(fee)} Koin`],
  ]),
  withdrawEventInfo(),
);

const withdrawInsufficient = (total) => `Saldo tidak cukup! Butuh ${bold(`${coin(total)} Koin`)} (termasuk fee).`;

const withdrawConfirm = ({ method, account, coins, fee, total }) => blocks(
  heading('Konfirmasi Penarikan', 2),
  kv([
    ['Tujuan', esc(method)],
    ['Nomor', code(account)],
    ['Tarik', `${coin(coins)} Koin (${esc(rupiah(Math.floor(coins * COIN_PRICE)))})`],
    ['Fee admin', `${coin(fee)} Koin`],
    ['Total terpotong', bold(`${coin(total)} Koin`)],
  ]),
);

const withdrawSessionExpired = () => 'Sesi habis. Ketik tarik lagi.';
const withdrawSending = ({ method, account }) => `Sedang mengirim pencairan otomatis ke ${bold(esc(method))} (${code(account)})...`;
const withdrawCancelled = () => 'Penarikan dibatalkan.';

const withdrawSuccess = ({ method, account, rupiahAmount, total, fee, refId, pending, bonus = 0 }) => blocks(
  heading(pending ? 'Penarikan Diproses' : 'Penarikan Berhasil', 2),
  kv([
    ['Tujuan', `${esc(method)} (${code(account)})`],
    ['Nominal', bold(esc(rupiah(rupiahAmount)))],
    ['Koin terpotong', `${coin(total)} Koin (fee ${coin(fee)})`],
    !pending && bonus > 0 && ['Bonus event WD', bold(`+${coin(bonus)} Koin`)],
    ['Ref ID', code(refId)],
  ]),
  pending ? italic('Transfer sedang diproses server, biasanya masuk dalam beberapa menit.') : null,
  pending && bonus > 0
    ? italic(`Bonus event WD +${coin(bonus)} Koin diberikan setelah transfer dipastikan sukses. Hubungi owner kalau belum masuk.`)
    : null,
);

const withdrawFailed = (message) => blocks(
  heading('Penarikan Otomatis Gagal', 2),
  quote(esc(message || 'Server tidak merespons.')),
  'Saldo kamu aman, tidak ada koin yang terpotong.',
);

const withdrawRefunded = ({ refId, refund, message }) => blocks(
  heading('Penarikan Gagal', 2),
  message ? quote(esc(String(message).replace(/SALDO[^@]*/g, '').slice(0, 200))) : null,
  `Saldo ${bold(`${coin(refund)} Koin`)} sudah dikembalikan ke akun kamu.`,
  kv([['Ref ID', code(refId)]]),
);

const systemError = () => 'Terjadi kesalahan sistem. Silakan coba lagi beberapa saat.';

/** 081234567890 -> 0812****7890. */
const maskPhone = (s) => String(s).replace(/\d{8,}/g, (d) => `${d.slice(0, 4)}${'*'.repeat(d.length - 8)}${d.slice(-4)}`);

// ---------- Testimoni channel ----------

const testimoniDeposit = ({ userName, method, rupiahAmount, coins, bonus, refId, time }) => blocks(
  heading('Testimoni Deposit Sukses', 2),
  kv([
    ['User', esc(userName)],
    ['Metode', esc(method)],
    ['Nominal', bold(esc(rupiah(rupiahAmount)))],
    ['Koin masuk', `+${coin(coins)} Koin`],
    bonus > 0 && ['Bonus depo', `+${coin(bonus)} Koin`],
    ['Transaksi', code(refId)],
    ['Waktu', esc(time)],
    ['Status', '**BERHASIL DITERIMA**'],
  ]),
  'Terima kasih telah melakukan deposit di DADUGO MILJI!',
);

/** Satu-satunya pesan publik untuk WD sukses; nomor HP selalu disamarkan. */
const testimoniWithdraw = ({ userName, method, account, rupiahAmount, coins, fee, refId, time }) => blocks(
  heading('Withdraw Sukses', 2),
  kv([
    ['User', esc(userName)],
    ['Tujuan', account ? `${esc(method)} (${code(maskPhone(account))})` : esc(method)],
    ['Total transfer', bold(esc(rupiah(rupiahAmount)))],
    ['Koin ditukar', `${coin(coins)} Koin + fee ${coin(fee)}`],
    ['Ref ID', code(refId)],
    ['Waktu', esc(time)],
    ['Status', bold('LUNAS')],
  ]),
  'DADUGO MILJI selalu membayar tepat waktu.',
);

module.exports = {
  depositPrivateOnly,
  depositIntro,
  depositMinimum,
  depositChooseMethod,
  depositSessionExpired,
  depositCreating,
  depositCreateFailed,
  depositInvoice,
  depositSuccess,
  depositExpired,
  withdrawPrivateOnly,
  withdrawMaintenance,
  withdrawMustJoin,
  withdrawTurnoverNotMet,
  withdrawMinimum,
  withdrawChooseMethod,
  withdrawAskPhone,
  withdrawInvalidPhone,
  withdrawAskAmount,
  withdrawInsufficient,
  withdrawConfirm,
  withdrawSessionExpired,
  withdrawSending,
  withdrawCancelled,
  withdrawSuccess,
  withdrawFailed,
  withdrawRefunded,
  systemError,
  testimoniDeposit,
  testimoniWithdraw,
};
