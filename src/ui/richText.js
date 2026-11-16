'use strict';

/**
 * Ubah RichMessage yang DITERIMA (msg.rich_message) kembali jadi teks polos.
 *
 * Dipakai fitur `restore`: owner me-reply daftar taruhan lama untuk memasang
 * ulang meja. Karena daftar taruhan kini dikirim sebagai Rich Message,
 * `reply_to_message.text` kosong dan isinya harus dibaca dari blok-bloknya.
 */

function richTextToString(rt) {
  if (rt == null) return '';
  if (typeof rt === 'string') return rt;
  if (Array.isArray(rt)) return rt.map(richTextToString).join('');
  if (typeof rt === 'object') {
    if (rt.text !== undefined) return richTextToString(rt.text);
    if (typeof rt.expression === 'string') return rt.expression;
  }
  return '';
}

function blocksToLines(blocks, lines) {
  for (const block of blocks || []) {
    switch (block.type) {
      case 'list':
        for (const item of block.items || []) {
          const inner = [];
          blocksToLines(item.blocks, inner);
          lines.push(`• ${inner.join(' ').trim()}`);
        }
        break;
      case 'blockquote':
        blocksToLines(block.blocks, lines);
        break;
      case 'details':
        if (block.summary) lines.push(richTextToString(block.summary));
        blocksToLines(block.blocks, lines);
        break;
      case 'table':
        for (const row of block.cells || []) {
          lines.push(row.map((cell) => richTextToString(cell.text)).join(' '));
        }
        break;
      default:
        if (block.text !== undefined) lines.push(...richTextToString(block.text).split('\n'));
    }
  }
  return lines;
}

/** Teks polos dari sebuah Message (rich atau biasa). */
function messagePlainText(message) {
  if (!message) return '';
  if (message.rich_message?.blocks) return blocksToLines(message.rich_message.blocks, []).join('\n');
  return message.text || message.caption || '';
}

module.exports = { messagePlainText, richTextToString };
