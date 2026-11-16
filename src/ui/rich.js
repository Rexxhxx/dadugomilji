'use strict';

/**
 * Lapisan pengiriman Rich Message (grammY sendRichMessage).
 *
 * Semua UI bot memakai Rich Markdown. Fungsi di sini tidak boleh pernah
 * men-throw: pesan gagal kirim hanya dicatat di log, karena dipakai juga di
 * jalur settle ronde — satu error kirim tidak boleh membatalkan pembayaran.
 */

const { sleep } = require('../utils/time');

// Telegram bisa mengembalikan retry_after panjang kalau bot lama di-throttle.
// Menunggu selama itu di dalam ronde akan mengunci meja, jadi dibatasi.
const RATE_LIMIT_MAX_WAIT_MS = 30000;

function readError(err) {
  const payload = err?.payload || {};
  const code = err?.error_code ?? err?.code;
  const retryAfter = err?.parameters?.retry_after ?? err?.response?.parameters?.retry_after;
  return { code, chatId: payload.chat_id, retryAfterMs: Number(retryAfter) > 0 ? Number(retryAfter) * 1000 : 0 };
}

/**
 * Bungkus teks markdown jadi InputRichMessage.
 * `media` dipakai untuk gambar yang dirujuk lewat tg://photo?id=... (mis. QRIS).
 */
const rich = (markdown, media) => (media ? { markdown, media } : { markdown });

/**
 * Jalankan operasi kirim dengan penanganan 429 (tunggu lalu coba sekali lagi).
 * Error lain cukup dicatat; mengulang tidak membantu.
 */
async function safeSend(operation, label = 'kirim pesan') {
  try {
    return await operation();
  } catch (err) {
    const { code, retryAfterMs } = readError(err);

    if (code === 429) {
      if (retryAfterMs > RATE_LIMIT_MAX_WAIT_MS) {
        console.error(`⚠️ 429 (${label}): retry_after ${retryAfterMs / 1000}s melebihi batas, pesan dilewati.`);
        return null;
      }
      // +500ms jaga-jaga: retry_after adalah batas minimum, bukan pasti.
      await sleep(retryAfterMs + 500);
      try {
        return await operation();
      } catch (err2) {
        console.error(`⚠️ Masih gagal setelah menunggu 429 (${label}):`, err2?.message || err2);
        return null;
      }
    }

    console.error(`⚠️ Gagal ${label} (code ${code ?? '?'}):`, err?.message || err);
    return null;
  }
}

/** Kirim Rich Message ke chat tertentu lewat bot.api. */
function sendRich(api, chatId, markdown, other = {}) {
  return safeSend(() => api.sendRichMessage(chatId, rich(markdown), other), `sendRichMessage ke ${chatId}`);
}

/** Balas Rich Message berisi media terlampir (InputRichMessageMedia[]). */
function replyRichWithMedia(ctx, markdown, media, other = {}) {
  return safeSend(() => ctx.replyWithRichMessage(rich(markdown, media), other), 'replyWithRichMessage (media)');
}

/** Balas Rich Message di chat asal update, default sebagai reply ke pesan pemicu. */
function replyRich(ctx, markdown, other = {}) {
  const replyTo = ctx.message?.message_id;
  const options = replyTo && other.reply_parameters === undefined
    ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true }, ...other }
    : { ...other };
  return safeSend(() => ctx.replyWithRichMessage(rich(markdown), options), 'replyWithRichMessage');
}

/** Balas tanpa mengutip pesan pemicu. */
function replyRichPlainReply(ctx, markdown, other = {}) {
  return safeSend(() => ctx.replyWithRichMessage(rich(markdown), other), 'replyWithRichMessage');
}

/** Edit pesan jadi Rich Message (dipakai untuk invoice & panel). */
function editRich(api, chatId, messageId, markdown, other = {}) {
  return safeSend(
    () => api.editMessageText(chatId, messageId, rich(markdown), other),
    `editMessageText ${chatId}/${messageId}`,
  );
}

function editCallbackRich(ctx, markdown, other = {}) {
  return safeSend(() => ctx.editMessageText(rich(markdown), other), 'editMessageText (callback)');
}

/** Jawab callback query; error (query kedaluwarsa) diabaikan karena tidak berdampak. */
function answer(ctx, text, showAlert = false) {
  return ctx.answerCallbackQuery(text ? { text, show_alert: showAlert } : undefined).catch(() => {});
}

module.exports = {
  rich,
  safeSend,
  sendRich,
  replyRich,
  replyRichPlainReply,
  replyRichWithMedia,
  editRich,
  editCallbackRich,
  answer,
};
