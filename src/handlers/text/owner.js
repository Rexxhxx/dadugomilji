'use strict';

/**
 * Perintah teks khusus owner: backup, restore, admin title, setgame,
 * broadcast, dan koreksi saldo/cashback.
 */

const {
  users,
  cashback,
  titleAdmins,
  gameState: gameStateRepo,
} = require('../../database');
const { gameState } = require('../../game/state');
const { betListMarkdown } = require('../../game/engine');
const { sendDbBackup } = require('../../schedulers/backup');
const { messagePlainText } = require('../../ui/richText');
const { replyRich, sendRich } = require('../../ui/rich');
const { sleep } = require('../../utils/time');
const { isMainOwner } = require('../../utils/auth');
const msg = require('../../ui/messages/owner');
const gameMsg = require('../../ui/messages/game');

const BROADCAST_DELAY_MS = 50;
const ADMIN_TITLE_MAX_LENGTH = 16;
const TITLE_ONLY_PERMISSIONS = Object.freeze({
  can_manage_chat: false,
  can_change_info: false,
  can_delete_messages: false,
  can_invite_users: false,
  can_restrict_members: false,
  can_pin_messages: false,
  can_promote_members: false,
  can_manage_video_chats: false,
  is_anonymous: false,
});

const parseAmount = (raw) => parseFloat(String(raw ?? '').replace(',', '.'));
const displayName = (user) => (user.username ? `@${String(user.username).replace(/^@/, '')}` : String(user.user_id));

/**
 * Target dari reply (`cmd <nominal>`) atau `cmd @username <nominal>`.
 * Mengembalikan { target: row users | null, amount, lookedUp } — `lookedUp`
 * true berarti username dicari tapi tidak ketemu (bukan salah format).
 */
function resolveAmountTarget(ctx, text) {
  const parts = text.split(/\s+/);
  const reply = ctx.message.reply_to_message;

  if (reply?.from) {
    users.createUser(reply.from.id, reply.from.username || reply.from.first_name, reply.from.username);
    return { target: users.getUserById(reply.from.id), amount: parseAmount(parts[1]) };
  }
  if (parts.length >= 3 && parts[1].startsWith('@')) {
    return { target: users.getUserByUsername(parts[1]) || null, amount: parseAmount(parts[2]), lookedUp: true };
  }
  return { target: null, amount: NaN, lookedUp: false };
}

/** Validasi target+nominal; `error` berisi promise balasan kalau tidak valid. */
function validateAmountTarget(ctx, text, command) {
  const { target, amount, lookedUp } = resolveAmountTarget(ctx, text);
  if (!target) return { error: replyRich(ctx, lookedUp ? msg.userNotFound() : msg.balanceFormat(command)) };
  if (Number.isNaN(amount) || amount <= 0) return { error: replyRich(ctx, msg.balanceFormat(command)) };
  return { target, amount };
}

// ---------- Perintah ----------

async function backup(ctx) {
  await sendDbBackup(ctx.api, ctx.from.id);
  return replyRich(ctx, msg.backupSent());
}

/** Pulihkan meja dari pesan daftar taruhan yang di-reply (rich atau teks biasa). */
function restore(ctx) {
  const source = messagePlainText(ctx.message.reply_to_message);
  if (!source) return replyRich(ctx, gameMsg.restoreNeedReply());

  let side = null;
  let count = 0;

  for (const raw of source.split('\n')) {
    // NFKC: judul memakai huruf 𝑲𝑬𝑪𝑰𝑳 (lihat md.fancy), dikembalikan ke ASCII.
    const line = raw.normalize('NFKC').trim();
    if (line.includes('KECIL')) { side = 'K'; continue; }
    if (line.includes('BESAR')) { side = 'B'; continue; }
    if (!side) continue;

    // Baris taruhan: "• NAMA 5.00" (format list lama) atau "NAMA 5.00" (baris tabel).
    // Header tabel "Pemain Koin" otomatis terlewat karena kolom terakhir bukan angka.
    const parts = line.replace(/^•/, '').trim().split(/\s+/);
    if (parts.length < 2) continue;
    const amount = parseAmount(parts[parts.length - 1]);
    if (Number.isNaN(amount) || amount <= 0) continue;

    // user_id 0 = taruhan pulihan manual: saldo tidak pernah dipotong,
    // sehingga dilewati saat settle/refund.
    const bet = { user_id: 0, name: parts.slice(0, -1).join(' ').toUpperCase(), amount };
    if (side === 'K') gameState.bets_k.push(bet);
    else gameState.bets_b.push(bet);
    count += 1;
  }

  if (!count) return replyRich(ctx, gameMsg.restoreFailed());
  if (!gameState.first_bet_time) gameState.first_bet_time = Date.now();
  return replyRich(ctx, gameMsg.restored({ count, listMarkdown: betListMarkdown() }));
}

async function addAdminTitle(ctx, text) {
  const parts = text.split(/\s+/);
  const reply = ctx.message.reply_to_message;
  let target = null;
  let title = '';

  if (reply?.from) {
    users.createUser(reply.from.id, reply.from.username || reply.from.first_name, reply.from.username);
    target = { id: reply.from.id, username: reply.from.username || reply.from.first_name };
    title = parts.slice(1).join(' ').trim();
  } else if (parts.length >= 3) {
    title = parts.slice(2).join(' ').trim();
    if (parts[1].startsWith('@')) {
      const row = users.getUserByUsername(parts[1]);
      if (row) target = { id: row.user_id, username: row.username };
    } else if (!Number.isNaN(parseInt(parts[1], 10))) {
      target = { id: parseInt(parts[1], 10), username: `User_${parts[1]}` };
    }
  }

  if (!target || !title) return replyRich(ctx, msg.adminTitleFormat());

  titleAdmins.addTitleAdmin(target.id, target.username, title, ctx.from.id);
  const name = target.username.startsWith('@') ? target.username : `@${target.username}`;

  if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
    return replyRich(ctx, msg.adminTitleSaved({ target: name, title }));
  }

  try {
    await ctx.promoteChatMember(target.id, TITLE_ONLY_PERMISSIONS);
    const cleanTitle = title.slice(0, ADMIN_TITLE_MAX_LENGTH);
    await ctx.setChatAdministratorCustomTitle(target.id, cleanTitle)
      .catch((err) => console.error('Gagal set custom title:', err?.message || err));
    return replyRich(ctx, msg.adminTitlePromoted({ target: name, title: cleanTitle }));
  } catch (err) {
    return replyRich(ctx, msg.adminTitlePromoteFailed({ target: name, reason: err?.message }));
  }
}

function removeAdminTitle(ctx, text) {
  const reply = ctx.message.reply_to_message;
  let targetId = null;
  let targetName = '';

  if (reply?.from) {
    targetId = reply.from.id;
    targetName = reply.from.username || reply.from.first_name;
  } else {
    const input = text.split(/\s+/)[1];
    if (input?.startsWith('@')) {
      const row = users.getUserByUsername(input);
      if (row) { targetId = row.user_id; targetName = row.username; }
    } else if (input && !Number.isNaN(parseInt(input, 10))) {
      targetId = parseInt(input, 10);
      targetName = input;
    }
  }

  if (!targetId) return replyRich(ctx, msg.adminTitleFormat());
  titleAdmins.removeTitleAdmin(targetId);
  return replyRich(ctx, msg.adminTitleRemoved(targetName));
}

const listAdmins = (ctx) => replyRich(ctx, msg.adminList(titleAdmins.getTitleAdminsList()));

function setGame(ctx, text) {
  const option = text.split(/\s+/)[1]?.toLowerCase();
  if (option !== 'on' && option !== 'off') return undefined;

  gameState.is_game_open = option === 'on';
  gameStateRepo.saveGameState(gameState.game_id, gameState.last_wins, gameState.last_win_msg_id, gameState.is_game_open);
  return replyRich(ctx, gameState.is_game_open ? msg.gameOpened() : msg.gameClosed());
}

async function broadcast(ctx, text) {
  const body = text.replace(/^\/?bc\s+/i, '').trim();
  if (!body) return replyRich(ctx, msg.broadcastFormat());

  const recipients = users.getAllUsers();
  await replyRich(ctx, msg.broadcastSending(recipients.length));

  let sent = 0;
  for (const u of recipients) {
    if (await sendRich(ctx.api, u.user_id, msg.broadcastMessage(body))) sent += 1;
    await sleep(BROADCAST_DELAY_MS);
  }
  return replyRich(ctx, msg.broadcastDone({ sent, total: recipients.length }));
}

function addSaldo(ctx, text) {
  const check = validateAmountTarget(ctx, text, 'addsaldo');
  if (check.error) return check.error;
  const { target, amount } = check;

  users.addBalance(target.user_id, amount);
  return replyRich(ctx, msg.balanceAdded({ target: displayName(target), amount, total: users.getBalance(target.user_id) }));
}

function minSaldo(ctx, text) {
  const check = validateAmountTarget(ctx, text, 'minsaldo');
  if (check.error) return check.error;
  const { target, amount } = check;

  if (!users.removeBalance(target.user_id, amount)) {
    return replyRich(ctx, msg.balanceRemoveFailed({ target: displayName(target) }));
  }
  return replyRich(ctx, msg.balanceRemoved({ target: displayName(target), amount, total: users.getBalance(target.user_id) }));
}

function minCashback(ctx, text) {
  const check = validateAmountTarget(ctx, text, 'mincashback');
  if (check.error) return check.error;
  const { target, amount } = check;

  cashback.reduceCashback(target.user_id, amount);
  return replyRich(ctx, msg.cashbackReduced({
    target: displayName(target),
    amount,
    total: cashback.getCashback(target.user_id),
  }));
}

/** Urutan dicek dari atas; pola pertama yang cocok dijalankan. */
const OWNER_COMMANDS = [
  [/^\/?backup$/i, backup],
  [/^\/?restore$/i, restore],
  [/^\/?(add|addadmin)\s+/i, addAdminTitle],
  [/^\/?deladmin\b/i, removeAdminTitle],
  [/^\/?listadmin$/i, listAdmins],
  [/^\/?setgame\s+/i, setGame],
  [/^\/?bc\s+/i, broadcast],
  [/^\/?addsaldo\s+/i, addSaldo],
  [/^\/?minsaldo\s+/i, minSaldo],
  [/^\/?mincashback\s+/i, minCashback],
];

/** True kalau teks adalah perintah owner (dan pengirim memang owner). */
async function handleOwnerCommand(ctx, text) {
  if (!isMainOwner(ctx.from.id)) return false;

  const entry = OWNER_COMMANDS.find(([pattern]) => pattern.test(text));
  if (!entry) return false;

  const result = await entry[1](ctx, text);
  // setgame dengan opsi tidak dikenal dibiarkan lewat seperti versi lama.
  return result !== undefined;
}

module.exports = { handleOwnerCommand };
