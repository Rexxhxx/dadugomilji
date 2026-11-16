'use strict';

/**
 * Pratinjau tampilan Rich Message.
 *   node scripts/preview-messages.js         → cetak markdown ke terminal
 *   node scripts/preview-messages.js --send  → kirim contoh ke chat pribadi owner pertama (OWNER_IDS)
 */

const { Bot } = require('grammy');
const { env } = require('../src/config');
const game = require('../src/ui/messages/game');
const account = require('../src/ui/messages/account');
const payment = require('../src/ui/messages/payment');

const user = { id: 123456789, first_name: 'Budi', username: 'budi' };
const betsK = [{ name: 'BUDI', amount: 10 }, { name: 'SITI', amount: 5 }];
const betsB = [{ name: 'ANDI', amount: 12 }];

const samples = {
  betList: game.betList({ gameId: 42, betsK, betsB, totalK: 15, totalB: 12 }),
  bo3Result: game.bo3Result({
    winSide: 'B', score: '2-1', dice: [5, 2, 6], totalFee: 1.35,
    streaks: [{ name: 'ANDI', streak: 3, bonus: 1.5 }, { name: 'RINA', streak: 1, bonus: 0 }],
    loseEvents: [{ name: 'BUDI', total: 5, reward: 2 }],
  }),
  autoBalance: game.autoBalance({ name: 'Budi', side: 'K', diff: 3, balance: 50 }),
  fillConfirm: game.fillConfirm({
    listMarkdown: game.betList({ gameId: 42, betsK, betsB, totalK: 15, totalB: 12 }),
    side: 'B', diff: 3, name: 'Budi',
  }),
  saldo: account.saldo({ user, balance: 120.5, cashback: 2 }),
  start: account.start({ user, balance: 120.5, cashback: 2 }),
  depositSuccess: payment.depositSuccess({ transactionId: 'TRX123', coins: 50, bonusCoin: 2, total: 52, balance: 172.5 }),
};

// Self-check: judul fancy harus kembali ke ASCII lewat NFKC (dipakai `restore`).
const assert = require('node:assert');
const { fancy } = require('../src/ui/md');
assert.strictEqual(fancy('🔵 KECIL · 15.00 Game42').normalize('NFKC'), '🔵 KECIL · 15.00 Game42');
assert.strictEqual(fancy('**Rp1\\.350**'), '**𝑹𝒑𝟏\\.𝟑𝟓𝟎**');

async function main() {
  if (!process.argv.includes('--send')) {
    for (const [name, md] of Object.entries(samples)) console.log(`===== ${name} =====\n${md}\n`);
    return;
  }
  const bot = new Bot(env.botToken);
  const chatId = env.ownerIds[0];
  for (const [name, md] of Object.entries(samples)) {
    await bot.api.sendRichMessage(chatId, { markdown: md })
      .then(() => console.log(`✓ ${name}`))
      .catch((e) => console.error(`✗ ${name}: ${e.description || e.message}`));
  }
}

main();
