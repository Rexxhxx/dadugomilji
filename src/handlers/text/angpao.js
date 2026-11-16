'use strict';

/** Angpao: buat (`angpao <kata> <total> <kuota>`) dan klaim lewat kata kunci. */

const { db, users, angpaos: angpaoRepo } = require('../../database');
const { isMainOwner } = require('../../utils/auth');
const { activeAngpaos } = require('../../game/state');
const { replyRich, replyRichPlainReply } = require('../../ui/rich');
const msg = require('../../ui/messages/game');

const CREATE_PATTERN = /^\/?angpao\s+(\S+)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+)$/i;
/** tryClaim jalan sebelum router perintah, jadi kata kunci ini akan membajak perintah. */
const RESERVED_KEYWORD = /^\/|^(k|b|kecil|besar|pindah|kur|kurang|r|roll|angpao|geser|saldo|bal|wd|depo|deposit|ws|statusws|claimws|klaimws|riwayat|menu|start|help|perintah|ls|list|lb|lbm|to|rekap|resetangpao|resetap)$/i;

/** Klaim angpao kalau teks persis kata kunci aktif. True kalau diproses. */
async function tryClaim(ctx, lower) {
  const a = activeAngpaos[lower];
  if (!a) return false;

  if (ctx.chat.type === 'private') {
    await replyRich(ctx, msg.angpaoGroupOnly());
    return true;
  }

  const userId = ctx.from.id;
  if (a.claimedBy.includes(userId)) {
    await replyRich(ctx, msg.angpaoAlreadyClaimed());
    return true;
  }

  a.claimedBy.push(userId);
  a.remainingSlots -= 1;
  users.addBalance(userId, a.amountPerPerson);

  await replyRich(ctx, msg.angpaoClaimed({
    name: ctx.from.first_name,
    amount: a.amountPerPerson,
    balance: users.getBalance(userId),
    remaining: `${a.remainingSlots}/${a.totalSlots}`,
  }));

  if (a.remainingSlots <= 0) {
    delete activeAngpaos[lower];
    angpaoRepo.deleteAngpao(lower);
    await replyRichPlainReply(ctx, msg.angpaoEmpty(a.keywordDisplay));
  } else {
    angpaoRepo.saveAngpao(lower, a);
  }
  return true;
}

/** Buat angpao baru. True kalau teks adalah perintah buat angpao. */
async function tryCreate(ctx, text) {
  const match = text.match(CREATE_PATTERN);
  if (!match) return false;

  const userId = ctx.from.id;
  const keyword = match[1];
  const key = keyword.toLowerCase();
  const total = parseFloat(match[2].replace(',', '.'));
  const slots = parseInt(match[3], 10);

  if (Number.isNaN(total) || Number.isNaN(slots) || total <= 0 || slots <= 0) {
    await replyRich(ctx, msg.angpaoInvalid());
    return true;
  }
  // Per orang dibulatkan ke bawah ke 0.01 dan hanya perPerson*slots yang dipotong:
  // pembulatan per-klaim di addBalance tidak boleh mencetak atau menghilangkan koin.
  const perPerson = Math.floor(Math.round(total * 1000) / 10 / slots) / 100;
  const cost = Math.round(perPerson * slots * 100) / 100;
  if (perPerson < 0.01 || RESERVED_KEYWORD.test(key)) {
    await replyRich(ctx, msg.angpaoInvalid());
    return true;
  }
  if (activeAngpaos[key]) {
    await replyRich(ctx, msg.angpaoDuplicate());
    return true;
  }
  if (!users.removeBalance(userId, cost)) {
    await replyRich(ctx, msg.balanceInsufficient());
    return true;
  }

  activeAngpaos[key] = {
    keywordDisplay: keyword,
    creatorId: userId,
    creatorName: ctx.from.first_name,
    amountPerPerson: perPerson,
    remainingSlots: slots,
    totalSlots: slots,
    claimedBy: [],
  };
  angpaoRepo.saveAngpao(key, activeAngpaos[key]);

  await replyRichPlainReply(ctx, msg.angpaoCreated({
    creator: ctx.from.first_name,
    total: cost,
    slots,
    perPerson,
    keyword,
  }));
  return true;
}

// Sisa slot yang belum diklaim dikembalikan ke pembuat supaya koin tidak hilang.
const resetAngpaosTx = db.transaction((keys) => {
  const removed = [];
  for (const key of keys) {
    const a = activeAngpaos[key];
    const refund = Math.round(a.amountPerPerson * Math.max(0, a.remainingSlots) * 100) / 100;
    if (refund > 0 && a.creatorId) users.addBalance(a.creatorId, refund);
    angpaoRepo.deleteAngpao(key);
    removed.push({ keyword: a.keywordDisplay, creatorName: a.creatorName, refund: a.creatorId ? refund : 0 });
  }
  for (const key of keys) delete activeAngpaos[key];
  return removed;
});

/** Owner: `resetangpao` hapus semua angpao aktif, `resetangpao <kata>` hapus satu. */
async function tryReset(ctx, text) {
  const m = /^\/?(?:resetangpao|resetap)(?:\s+(\S+))?\s*$/i.exec(text);
  if (!m) return false;
  if (!isMainOwner(ctx.from.id)) {
    await replyRich(ctx, msg.angpaoResetDenied());
    return true;
  }
  const keys = m[1] ? [m[1].toLowerCase()] : Object.keys(activeAngpaos);
  if (m[1] && !activeAngpaos[keys[0]]) {
    await replyRich(ctx, msg.angpaoResetNotFound(m[1]));
    return true;
  }
  await replyRich(ctx, msg.angpaoReset(resetAngpaosTx(keys)));
  return true;
}

const isCreateCommand = (text) => CREATE_PATTERN.test(text);

module.exports = { tryClaim, tryCreate, tryReset, isCreateCommand };
