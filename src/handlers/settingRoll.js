'use strict';

const { Composer } = require('grammy');

// ✅ FIX PATH: Naik 2 folder ke root, lalu masuk ke config
const { OWNER_IDS } = require('./config');

// ✅ FIX REQUIRE: Ambil dari file repository yang benar, bukan folder database
const { groupRollSettings } = require('../database');
const { replyRich } = require('../ui/rich');
const msg = require('../ui/messages/game');

const composer = new Composer();
const command = (pattern, handler) => composer.hears(pattern, handler);

// Pastikan OWNER_IDS dibaca dengan benar (array of numbers)
const isOwner = (userId) => {
  const ids = Array.isArray(OWNER_IDS) ? OWNER_IDS : String(OWNER_IDS).split(',').map(Number);
  return ids.includes(Number(userId));
};

function parseGroupId(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n === 0) return null;
  return n;
}

// REGEX SUPER LONGGAR
command(/^\/?(settingrol|unsettingrol|listsettingrol)(?:@\w+)?(?:\s+(.*))?$/i, async (ctx) => {
  const userId = ctx.from.id;
  const cmd = ctx.match[1].toLowerCase();
  const argsStr = (ctx.match[2] || '').trim();
  const args = argsStr ? argsStr.split(/\s+/) : [];

  // Log untuk memastikan perintah masuk
  console.log(`[SETTINGROL] Diterima dari ID ${userId} (Owner: ${isOwner(userId)}): ${cmd} ${args.join(' ')}`);

  // 1. Cek Owner
  if (!isOwner(userId)) {
    return replyRich(ctx, msg.ownerOnly());
  }

  // 2. Cek Private Chat
  if (ctx.chat.type !== 'private') {
    return replyRich(ctx, msg.groupOnly());
  }

  // 3. Handle /listsettingrol
  if (cmd === 'listsettingrol') {
    return replyRich(ctx, msg.settingRollList(groupRollSettings.getAll()));
  }

  // 4. Handle /settingrol & /unsettingrol
  const chatId = parseGroupId(args[0]);
  if (chatId == null) {
    return replyRich(ctx, msg.settingRollNotGroup());
  }

  if (cmd === 'unsettingrol') {
    const removed = groupRollSettings.unsetSetting(chatId);
    return replyRich(ctx, removed
      ? msg.settingRollRemoved({ chatId })
      : msg.settingRollNotFound({ chatId }));
  }

  const sideStr = args[1];
  if (!sideStr) {
    return replyRich(ctx, msg.settingRollInvalid());
  }

  const side = groupRollSettings.parseSide(sideStr);
  if (!side) {
    return replyRich(ctx, msg.settingRollInvalidSide());
  }

  groupRollSettings.setSetting(chatId, side, userId);
  return replyRich(ctx, msg.settingRollSaved({ chatId, side }));
});

module.exports = composer;