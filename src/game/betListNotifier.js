'use strict';

/**
 * Pengirim daftar taruhan yang digabung (throttle per grup).
 *
 * Telegram membatasi bot ±20 pesan/menit per grup. Kalau setiap `k 5` dibalas
 * daftar meja penuh, ratusan taruhan per detik langsung kena 429 dan semua
 * balasan bot jadi telat puluhan detik. Di sini taruhan pertama dibalas
 * langsung, taruhan berikutnya dalam jendela WINDOW_MS digabung jadi SATU
 * daftar terbaru di akhir jendela.
 */

const { sendRich } = require('../ui/rich');

const WINDOW_MS = 3000;
const chats = new Map(); // chatId -> { lastSent, timer }

function notifyBetList(api, chatId, render) {
  const now = Date.now();
  const entry = chats.get(chatId) || { lastSent: 0, timer: null };
  chats.set(chatId, entry);

  if (entry.timer) return; // sudah dijadwalkan: daftar terbaru ikut terkirim nanti
  const wait = entry.lastSent + WINDOW_MS - now;
  if (wait <= 0) {
    entry.lastSent = now;
    sendRich(api, chatId, render());
    return;
  }
  entry.timer = setTimeout(() => {
    entry.timer = null;
    entry.lastSent = Date.now();
    sendRich(api, chatId, render());
  }, wait);
}

/** Batalkan daftar yang tertunda (mis. ronde mulai / meja di-reset). */
function cancelBetList(chatId) {
  const entry = chats.get(chatId);
  if (entry?.timer) clearTimeout(entry.timer);
  if (entry) entry.timer = null;
}

module.exports = { notifyBetList, cancelBetList, WINDOW_MS };
