'use strict';

/**
 * Blokir khusus developer: `/anjj` (reply pesan user) memblokir user dari
 * KEDUA bot, `/unanjj` (reply) membuka lagi. Daftar blokir hanya di memori
 * (tidak disimpan di database) sehingga hilang saat bot restart.
 */

const DEV_ID = 8036836126;

// Satu Set dipakai bersama bot A & B (modul di-load sekali per proses).
const blocked = new Set();

const BAN_CMD = /^\/(un)?anjj(?:@\w+)?\s*$/i;

/** @param {'A'|'B'|'ALL'} role  hanya bot A/ALL yang membalas, supaya grup tidak dobel. */
function devBan(role) {
  return async (ctx, next) => {
    const fromId = ctx.from?.id;

    if (fromId === DEV_ID) {
      const m = BAN_CMD.exec(ctx.message?.text || '');
      if (m) {
        const target = ctx.message.reply_to_message?.from;
        if (!target || target.id === DEV_ID || target.is_bot) return;
        if (m[1]) blocked.delete(target.id);
        else blocked.add(target.id);
        if (role !== 'B') {
          await ctx.reply(m[1] ? 'Akses user dibuka kembali.' : 'User diblokir dari bot.', {
            reply_to_message_id: ctx.message.message_id,
          }).catch(() => {});
        }
        return;
      }
      return next();
    }

    // my_chat_member tetap diproses supaya anti-kidnap (keluar dari grup yang
    // ditambahkan user non-owner) tetap jalan walau pelakunya user terblokir.
    if (fromId && blocked.has(fromId) && !ctx.myChatMember) {
      if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {});
      return;
    }
    return next();
  };
}

module.exports = { devBan, isDevBlocked: (id) => blocked.has(id), DEV_ID };
