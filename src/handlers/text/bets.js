'use strict';

/**
 * Perintah taruhan di grup: pasang (`k`/`b`), pindah sisi, kurangi (`kur`),
 * dan transfer saldo antar pemain (`geser`).
 */

const { env, ROLL_COOLDOWN_SECONDS } = require('../../config');
const { users } = require('../../database');
const { gameState, pendingRollConfirm, totalK, totalB } = require('../../game/state');
const { startRound, betListMarkdown } = require('../../game/engine');
const { notifyBetList } = require('../../game/betListNotifier');
const table = require('../../game/table');
const { replyRich, replyRichPlainReply } = require('../../ui/rich');
const msg = require('../../ui/messages/game');

// Perintah hanya diproses kalau formatnya persis; teks lain (mis. `geser` saja) diabaikan.
const BET_PATTERN = /^\/?(k|b|kecil|besar)\s*([0-9]+(?:[.,][0-9]+)?|all)$/i;
const REDUCE_PATTERN = /^\/?kur(?:ang)?\s*([0-9]+(?:[.,][0-9]+)?|all)$/i;
const MOVE_PATTERN = /^\/?pindah(?:\s+([0-9]+(?:[.,][0-9]+)?))?$/i;
const TRANSFER_REPLY_PATTERN = /^\/?geser\s+([0-9]+(?:[.,][0-9]+)?)$/i;
const TRANSFER_AT_PATTERN = /^\/?geser\s+(@\w+)\s+([0-9]+(?:[.,][0-9]+)?)$/i;

const parseAmount = (raw) => parseFloat(String(raw).replace(',', '.'));
const round2 = table.round2;

/** Meja terkunci karena sedang roll atau menunggu konfirmasi selisih. */
const isTableLocked = (chatId) => gameState.is_rolling || Boolean(pendingRollConfirm[chatId]);

/** Roll otomatis saat kedua sisi seimbang dan cooldown sudah lewat. */
async function maybeAutoRoll(ctx) {
  const k = totalK();
  if (k <= 0 || !table.isBalanced(k, totalB())) return;
  if (table.cooldownRemaining(ROLL_COOLDOWN_SECONDS) > 0) return;

  gameState.is_rolling = true;
  startRound(ctx.api, ctx.chat.id);
}

// ---------- k / b ----------

async function tryBet(ctx, text) {
  const match = text.match(BET_PATTERN);
  if (!match) return false;

  if (isTableLocked(ctx.chat.id)) {
    await replyRich(ctx, msg.diceSpinning());
    return true;
  }
  if (!gameState.is_game_open) {
    await replyRich(ctx, msg.tableClosed());
    return true;
  }

  const userId = ctx.from.id;
  const side = match[1].toLowerCase().startsWith('k') ? 'K' : 'B';
  const opposite = table.oppositeSide(side);

  if (table.userTotal(opposite, userId) > 0) {
    await replyRich(ctx, msg.betOppositeSide(opposite));
    return true;
  }

  const balance = users.getBalance(userId);
  const amount = round2(match[2].toLowerCase() === 'all' ? balance : parseAmount(match[2]));

  if (!Number.isFinite(amount) || amount < env.minBet) {
    await replyRich(ctx, msg.betMinimum());
    return true;
  }
  if (!users.removeBalance(userId, amount)) {
    await replyRich(ctx, msg.balanceInsufficient());
    return true;
  }

  table.addBet(side, { userId, name: ctx.from.first_name.toUpperCase(), amount });
  // Digabung per grup supaya tidak kena limit pesan Telegram saat ramai.
  notifyBetList(ctx.api, ctx.chat.id, betListMarkdown);
  await maybeAutoRoll(ctx);
  return true;
}

// ---------- pindah ----------

async function tryMove(ctx, text) {
  const moveMatch = text.match(MOVE_PATTERN);
  if (!moveMatch) return false;

  if (gameState.is_rolling) {
    await replyRich(ctx, msg.rolling());
    return true;
  }
  if (pendingRollConfirm[ctx.chat.id]) {
    await replyRich(ctx, msg.waitingConfirm());
    return true;
  }

  const userId = ctx.from.id;
  const fromSide = table.userSide(userId);
  if (!fromSide) {
    await replyRich(ctx, msg.noUserBet());
    return true;
  }

  const toSide = table.oppositeSide(fromSide);
  const currentFrom = table.userTotal(fromSide, userId);
  const currentTo = table.userTotal(toSide, userId);

  const requested = parseAmount(moveMatch[1] ?? '');
  const moveAmount = !Number.isNaN(requested) && requested > 0
    ? Math.min(currentFrom, requested)
    : currentFrom;

  const remainder = round2(currentFrom - moveAmount);
  const targetAfter = round2(currentTo + moveAmount);

  if (remainder > 0 && remainder < env.minBet) {
    await replyRich(ctx, msg.moveRemainderTooSmall(round2(currentFrom - env.minBet)));
    return true;
  }
  if (targetAfter < env.minBet) {
    await replyRich(ctx, msg.moveTargetTooSmall());
    return true;
  }

  // Pindah tidak membuat taruhan baru masuk meja, jadi timer cooldown ronde
  // ini dipertahankan walau meja sesaat kosong setelah taruhan asal dipotong.
  const betTime = gameState.first_bet_time;
  table.trimUserBet(fromSide, userId, moveAmount);
  table.addBet(toSide, { userId, name: ctx.from.first_name.toUpperCase(), amount: moveAmount });
  gameState.first_bet_time = betTime;

  await replyRich(ctx, msg.moved({
    amount: moveAmount,
    from: fromSide,
    to: toSide,
    listMarkdown: betListMarkdown(),
  }));
  return true;
}

// ---------- kur ----------

async function tryReduce(ctx, text) {
  const match = text.match(REDUCE_PATTERN);
  if (!match) return false;

  if (gameState.is_rolling) {
    await replyRich(ctx, msg.rolling());
    return true;
  }

  const userId = ctx.from.id;
  const side = table.userSide(userId);
  if (!side) {
    await replyRich(ctx, msg.noUserBet());
    return true;
  }

  const userBet = table.userTotal(side, userId);
  const requested = match[1].toLowerCase() === 'all' ? userBet : Math.min(userBet, parseAmount(match[1]));
  if (Number.isNaN(requested) || requested <= 0) return true;

  // Sisa taruhan harus 0 (tarik semua) atau tetap >= minimal pasang; tanpa ini
  // `kur 4.9` pada taruhan 5.00 menyisakan 0.10 yang menembus aturan min bet.
  const remainder = round2(userBet - requested);
  if (remainder > 0 && remainder < env.minBet) {
    await replyRich(ctx, msg.reduceRemainderTooSmall(round2(userBet - env.minBet)));
    return true;
  }

  const trimmed = table.trimUserBet(side, userId, requested);
  users.addBalance(userId, trimmed);
  await replyRich(ctx, msg.reduced({ amount: trimmed, listMarkdown: betListMarkdown() }));
  return true;
}

// ---------- geser ----------

async function tryTransfer(ctx, text) {
  const reply = ctx.message.reply_to_message;
  const byReply = reply?.from ? text.match(TRANSFER_REPLY_PATTERN) : null;
  const byUsername = byReply ? null : text.match(TRANSFER_AT_PATTERN);
  if (!byReply && !byUsername) return false;

  let target;
  let amount;
  if (byReply) {
    users.createUser(reply.from.id, reply.from.username || reply.from.first_name, reply.from.username);
    target = users.getUserById(reply.from.id);
    amount = parseAmount(byReply[1]);
  } else {
    target = users.getUserByUsername(byUsername[1]);
    amount = parseAmount(byUsername[2]);
    if (!target) {
      await replyRich(ctx, msg.transferUserNotFound());
      return true;
    }
  }

  amount = round2(amount);
  if (!target || !Number.isFinite(amount) || amount < 0.01) {
    await replyRich(ctx, msg.transferMinimum());
    return true;
  }
  if (target.user_id === ctx.from.id) {
    await replyRich(ctx, msg.transferSelf());
    return true;
  }
  if (!users.removeBalance(ctx.from.id, amount)) {
    await replyRich(ctx, msg.balanceInsufficient());
    return true;
  }

  users.addBalance(target.user_id, amount);
  await replyRichPlainReply(ctx, msg.transferred({
    amount,
    target: target.username ? `@${target.username}` : String(target.user_id),
  }));
  return true;
}

/** Teks yang akan diproses sebagai perintah meja (dipakai router untuk pesan privat & meja terkunci). */
const isTableCommand = (text) => [BET_PATTERN, REDUCE_PATTERN, MOVE_PATTERN].some((re) => re.test(text));
const isTransferCommand = (text) => TRANSFER_REPLY_PATTERN.test(text) || TRANSFER_AT_PATTERN.test(text);

module.exports = { tryBet, tryMove, tryReduce, tryTransfer, isTableLocked, isTableCommand, isTransferCommand };
