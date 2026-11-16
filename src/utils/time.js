'use strict';

/** Utilitas waktu. Semua perhitungan memakai zona WIB (Asia/Jakarta). */

const TIME_ZONE = 'Asia/Jakarta';

function partsOf(options, locale = 'en-GB', date = new Date()) {
  const map = {};
  for (const p of new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, ...options }).formatToParts(date)) {
    map[p.type] = p.value;
  }
  return map;
}

/** Tanggal hari ini (WIB) dalam format YYYY-MM-DD. */
function getTodayWib() {
  const p = partsOf({ year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA');
  return `${p.year}-${p.month}-${p.day}`;
}

/** Jam sekarang (WIB), 0..23. */
function getWibHour() {
  return parseInt(partsOf({ hour: '2-digit', hourCycle: 'h23' }).hour || '0', 10) % 24;
}

/**
 * Menit ke-berapa dalam sehari menurut WIB (0..1439).
 * hourCycle h23 + normalisasi %24 dipakai karena `hour12: false` bisa
 * mengembalikan "24" pada tengah malam.
 */
function getWibMinutesOfDay() {
  const p = partsOf({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return (parseInt(p.hour || '0', 10) % 24) * 60 + parseInt(p.minute || '0', 10);
}

/** Parse "HH:MM" jadi menit-dalam-hari, atau fallback kalau tidak valid. */
function parseHhMm(str, fallbackMinutes) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || '').trim());
  if (!m) return fallbackMinutes;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h > 23 || mi > 59) return fallbackMinutes;
  return h * 60 + mi;
}

/** Format menit-dalam-hari jadi "HH:MM". */
function formatMinutes(total) {
  const h = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** Senin (YYYY-MM-DD) dari minggu yang memuat tanggal `ymd`. */
function weekStartOf(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // Senin = 0
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

/** Kunci minggu berjalan (WIB): tanggal Senin-nya. Lewat module.exports agar ikut mock jam. */
const getWeekKeyWib = () => weekStartOf(module.exports.getTodayWib());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
  TIME_ZONE,
  getTodayWib,
  getWibHour,
  getWibMinutesOfDay,
  parseHhMm,
  formatMinutes,
  weekStartOf,
  getWeekKeyWib,
  sleep,
};
