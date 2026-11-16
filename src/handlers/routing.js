'use strict';

/**
 * Pembagian perintah antara dua bot (BOT_TOKEN = bot A, BOT_TOKEN_B = bot B).
 *
 * Kedua bot ada di grup yang sama dan menerima pesan yang sama, jadi tiap
 * pesan teks hanya boleh diproses SATU bot. Kalau tidak, `r` akan dibalas dua
 * kali dan taruhan bisa terpasang dua kali.
 *
 * Daftar perintah per bot ada di commandCatalog.js (satu sumber untuk router,
 * menu `start`/`menu`, dan menu "/" Telegram).
 */

const { userSessions, activeAngpaos } = require('../game/state');
const { replyRich } = require('../ui/rich');
const { code, esc } = require('../ui/md');
const { COMMANDS, MENU_NAMES, forBot } = require('./commandCatalog');

const ROLE = Object.freeze({ A: 'A', B: 'B', ALL: 'ALL' });

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const namesOf = (bot) => forBot(bot).flatMap((c) => c.names);

/** Perintah milik bot A. Argumen setelah perintah diizinkan. */
const A_COMMAND = new RegExp(`^\\/?(?:${namesOf('A').map(escapeRe).join('|')})(?:\\s.*)?$`, 'is');
/** `kur2` / `kurall` (tanpa spasi) juga dikenali handler kur. */
const A_GLUED = /^\/?kur(?:ang)?\s*(?:[0-9]|all)/i;
const MENU_COMMAND = new RegExp(`^\\/?(?:${MENU_NAMES.map(escapeRe).join('|')})(?:\\s.*)?$`, 'i');
const START_COMMAND = /^\/?start(?:\s.*)?$/i;

/** Input wizard deposit/withdraw: nominal atau nomor HP. */
const WIZARD_INPUT = /^[\d\s.,+()-]+$/;

/**
 * 'A' | 'B' | 'BOTH' untuk satu pesan teks (sudah tanpa akhiran @namabot).
 * Prinsip: pesan milik tepat satu bot. Bila ambigu (mis. `start` di privat),
 * kembalikan 'BOTH' agar kedua bot yang relevan memutuskan sendiri.
 */
function ownerOf(ctx) {
  const rawText = ctx.message?.text;
  if (typeof rawText !== 'string') return ROLE.B;

  const text = rawText.trim();
  if (!text) return ROLE.B;

  const isPrivate = ctx.chat?.type === 'private';
  const userId = ctx.from?.id;
  const hasWizardSession = userId != null && userSessions[userId]?.step;

  if (isPrivate && (MENU_COMMAND.test(text) || START_COMMAND.test(text))) return 'BOTH';

  if (
    MENU_COMMAND.test(text)
    || A_COMMAND.test(text)
    || A_GLUED.test(text)
    || (isPrivate && hasWizardSession && WIZARD_INPUT.test(text))
  ) {
    return ROLE.A;
  }

  // Kata kunci angpao bagian dari fitur angpao (bot A). Guard tipe agar aman
  // walau `activeAngpaos` kosong/null.
  if (!isPrivate && activeAngpaos && typeof activeAngpaos === 'object') {
    const key = text.toLowerCase();
    if (activeAngpaos[key]) return ROLE.A;
  }

  return ROLE.B;
}

/**
 * `/saldo@NamaBot 5` → `/saldo 5` kalau ditujukan ke bot ini.
 * Mendukung dengan/tanpa slash, dan mengabaikan akhiran mention di private.
 * Mengembalikan false kalau pesan ditujukan ke bot LAIN (harus diabaikan).
 */
function stripBotMention(ctx) {
  const text = String(ctx.message?.text || '');
  const m = text.match(/^(\/?[a-z][a-z0-9_]*)(?:@(\w+))?(.*)$/is);
  if (!m) return true;
  if (!m[2]) return true;

  const target = m[2].toLowerCase();
  const me = String(ctx.me?.username || '').toLowerCase();
  if (!me) return false; // belum tahu username bot → abaikan untuk keamanan
  if (target !== me) return false;

  ctx.message.text = m[1] + m[3];
  return true;
}

/**
 * Middleware paling awal tiap bot. Pesan milik bot lain dihentikan di sini.
 * `otherUsername` = username bot pasangan (untuk petunjuk & daftar perintah).
 */
function commandFilter(role, otherUsername) {
  return async (ctx, next) => {
    ctx.botRole = role;
    ctx.otherBot = otherUsername;
    if (!ctx.message?.text) return next();
    if (!stripBotMention(ctx)) return undefined;
    if (role === ROLE.ALL) return next();

    const owner = ownerOf(ctx);
    if (owner === 'BOTH' || owner === role) return next();

    // Di grup diam (bot pasangan yang membalas); di privat beri petunjuk
    // HANYA kalau pesan berbentuk perintah dengan nama yang dikenal bot lain.
    if (ctx.chat?.type === 'private' && otherUsername) {
      const m = ctx.message.text.trim().match(/^\/?([a-z][a-z0-9_]*)(?:\s|$)/i);
      const word = m ? m[1].toLowerCase() : null;
      const knownByOther = word && namesOf(role === ROLE.A ? 'B' : 'A').includes(word);
      if (knownByOther) {
        await replyRich(
          ctx,
          `Perintah ${code('/' + word)} ada di bot ${esc(`@${otherUsername}`)}. `
          + `Ketik ${code('menu')} untuk daftar perintah bot ini.`,
        );
      }
    }
    return undefined;
  };
}

/**
 * Daftarkan menu "/" Telegram per bot (yang muncul saat pemain mengetik "/").
 * Hanya perintah pemain; gagal daftar tidak menghentikan bot.
 */
async function registerSlashMenu(api, role) {
  const commands = [
    ...(role === ROLE.B ? [] : COMMANDS.filter((c) => c.names[0] === 'start')),
    ...forBot(role).filter((c) => c.slash && !c.owner && c.names[0] !== 'start'),
    { names: ['menu'], desc: 'Daftar perintah bot ini' },
  ]
    // dedupe berdasarkan nama kanonis
    .reduce((acc, c) => {
      if (!acc.some((x) => x.command === c.names[0])) {
        acc.push({ command: c.names[0], description: c.desc });
      }
      return acc;
    }, []);

  await api.setMyCommands(commands)
    .catch((err) => console.error('Gagal daftar menu perintah:', err?.message || err));
}

module.exports = { ROLE, A_COMMAND, ownerOf, commandFilter, registerSlashMenu };