'use strict';

/** Event keanggotaan bot: anti-culik (hanya owner utama yang boleh memasukkan bot ke grup). */

const { Composer } = require('grammy');
const { isMainOwner } = require('../utils/auth');
const { sendRich } = require('../ui/rich');
const gameMsg = require('../ui/messages/game');

const composer = new Composer();

composer.on('my_chat_member', async (ctx) => {
  const update = ctx.myChatMember;
  const chat = update.chat;
  if (chat.type !== 'group' && chat.type !== 'supergroup') return;

  const status = update.new_chat_member.status;
  if (status !== 'member' && status !== 'administrator') return;

  const addedBy = update.from.id;
  if (isMainOwner(addedBy)) {
    console.log(`Bot ditambahkan ke grup ${chat.title || chat.id} oleh owner ${addedBy}`);
    return;
  }

  console.warn(`Bot ditambahkan ke ${chat.title || chat.id} oleh non-owner ${addedBy}, keluar.`);
  await sendRich(ctx.api, chat.id, gameMsg.antiKidnap());
  try {
    await ctx.api.leaveChat(chat.id);
  } catch (err) {
    console.error('Gagal keluar dari grup:', err?.message || err);
  }
});

module.exports = composer;
