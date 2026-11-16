'use strict';

/**
 * Helper kecil untuk menyusun Rich Markdown.
 *
 * Rich Markdown mengikuti aturan markdown biasa: satu baris baru di dalam
 * paragraf dianggap spasi. Karena itu pesan disusun per-blok (paragraf,
 * list, tabel) yang dipisah baris kosong, bukan teks dengan "\n" tunggal.
 */

const { escapeRich } = require('../utils/format');

const esc = escapeRich;
const bold = (t) => `**${t}**`;
const italic = (t) => `*${t}*`;
const code = (t) => `\`${String(t).replace(/`/g, '')}\``;
/**
 * Ubah huruf/angka ASCII jadi "Mathematical Bold Italic" (𝑨𝑩𝑪 𝒂𝒃𝒄) —
 * Telegram tidak bisa ganti font, ini satu-satunya cara judul tampil beda.
 * Unicode tidak punya angka bold-italic, jadi angka memakai Mathematical
 * Bold (𝟏𝟐𝟑). Simbol markdown, escape, dan emoji tidak disentuh. NFKC
 * mengembalikannya ke ASCII (dipakai parser `restore` dan test).
 * ponytail: screen reader membacanya kurang baik; hanya dipakai di judul.
 */
const fancy = (t) => String(t).replace(/[A-Za-z0-9]/g, (ch) => {
  const c = ch.charCodeAt(0);
  if (c <= 57) return String.fromCodePoint(0x1d7ce + c - 48); // 0-9 bold
  if (c <= 90) return String.fromCodePoint(0x1d468 + c - 65); // A-Z bold italic
  return String.fromCodePoint(0x1d482 + c - 97); // a-z bold italic
});

const heading = (t, level = 2) => `${'#'.repeat(level)} ${fancy(t)}`;
const quote = (t) => String(t).split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');
const divider = () => '---';

/** Blok lipat (klik untuk buka). Isi boleh markdown penuh. */
const details = (summary, content, open = false) =>
  `<details${open ? ' open' : ''}><summary>${summary}</summary>\n\n${content}\n\n</details>`;

/** List bullet; item kosong/false dibuang supaya mudah pakai kondisi inline. */
const list = (items) => items.filter(Boolean).map((i) => `- ${i}`).join('\n');

/**
 * Pasangan label/nilai.
 * Tanpa `headers` → kartu blockquote berisi list "label: nilai".
 * Dengan `headers` → tabel 2 kolom.
 */
function kv(rows, headers) {
  const body = rows.filter(Boolean);
  if (!headers) return quote(list(body.map(([k, v]) => `${k}: ${v}`)));
  return [`| ${headers[0]} | ${headers[1]} |`, '|:--|:--|', ...body.map(([k, v]) => `| ${k} | ${v} |`)].join('\n');
}

/**
 * Tabel bebas kolom. `align` per kolom: 'l' | 'c' | 'r' (default kiri).
 * Sel tidak boleh mengandung "|" mentah; nilai dari user wajib lewat esc().
 */
function table(headers, rows, align = []) {
  const sep = headers.map((_, i) => ({ c: ':-:', r: '--:' }[align[i]] || ':--'));
  return [
    `| ${headers.join(' | ')} |`,
    `|${sep.join('|')}|`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

/** Gabungkan blok dengan baris kosong; blok falsy dilewati. */
const blocks = (...parts) => parts.flat().filter(Boolean).join('\n\n');

module.exports = { esc, bold, italic, code, fancy, heading, quote, divider, details, list, kv, table, blocks };
