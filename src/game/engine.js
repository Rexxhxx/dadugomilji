'use strict';

const { env, WIN_FEE_PERCENT, LB_MIN_BET } = require('../config');
const { db, users, cashback, bets: betHistory, gameState: gameStateRepo } = require('../database');
const { gameState, totalK, totalB, clearRollConfirm, clearTable, getForcedSide } = require('./state');
const { calculateWsBonus } = require('./streak');
const { cancelBetList } = require('./betListNotifier');
const { sendRich, safeSend } = require('../ui/rich');
const keyboards = require('../ui/keyboards');
const msg = require('../ui/messages/game');
const { formatWibDate } = require('../utils/format');
const { sleep } = require('../utils/time');

const MAX_LAST_WINS = 20;
const round2 = (v) => parseFloat(v.toFixed(2));
const getCategory = (value) => (value >= 1 && value <= 3 ? 'K' : 'B');

function betListMarkdown() {
  return msg.betList({
    gameId: gameState.game_id,
    betsK: gameState.bets_k,
    betsB: gameState.bets_b,
    totalK: totalK(),
    totalB: totalB(),
  });
}

/**
 * Lempar dadu BO3. Kalau `forcedSide` di-set, tidak memanggil sendDice dan
 * setiap lemparan dihitung untuk sisi tsb. Mengembalikan null kalau dibatalkan.
 */
async function rollBestOfThree(api, chatId, epoch, forcedSide = null) {
  let scoreK = 0;
  let scoreB = 0;
  const dice = [];

  while (scoreK < 2 && scoreB < 2) {
    gameState.is_rolling = true;

    if (forcedSide) {
      const value = forcedSide === 'K' ? 1 : 6;
      dice.push(value);
      if (forcedSide === 'K') scoreK += 1; else scoreB += 1;

      await safeSend(
        () => api.sendMessage(
          chatId,
          `M${dice.length} ${value}${forcedSide === 'K' ? ' (Kecil)' : ' (Besar)'} · setting owner`,
        ),
        'label ronde override',
      );
      await sleep(1200);
    } else {
      await safeSend(() => api.sendMessage(chatId, `M${dice.length + 1} 123`), 'label ronde');
      const sent = await safeSend(() => api.sendDice(chatId, '🎲'), 'sendDice');
      if (!sent?.dice) throw new Error('sendDice gagal, ronde tidak bisa dilanjutkan');

      const value = sent.dice.value;
      dice.push(value);
      if (getCategory(value) === 'K') scoreK += 1;
      else scoreB += 1;

      await sleep(3500);
    }

    if (gameState.epoch !== epoch) return null;
  }

  const winSide = forcedSide || (scoreK === 2 ? 'K' : 'B');
  return { dice, scoreK, scoreB, winSide };
}

function settleBets({ winSide, bets, gameId, forcedSide = null }) {
  const timeNow = formatWibDate();
  const isReal = (b) => b.user_id > 0;
  const winners = winSide === 'K' ? bets.k : bets.b;
  const losers = winSide === 'K' ? bets.b : bets.k;
  const loserSideName = winSide === 'K' ? 'Besar' : 'Kecil';
  const winnerSideName = winSide === 'K' ? 'Kecil' : 'Besar';

  const streaks = [];
  const claims = [];
  const loseEvents = [];
  let totalFee = 0;

  for (const b of losers.filter(isReal)) {
    users.resetStreak(b.user_id);
    cashback.addCashback(b.user_id, b.amount);
    users.addTurnover(b.user_id, b.amount);
    const { total, reward } = users.registerLose(b.user_id, b.amount, env.loseEventMinBet);
    if (reward > 0) loseEvents.push({ name: b.name, total, reward });
    betHistory.addBetHistory(b.user_id, gameId, loserSideName, b.amount, 'L', timeNow, forcedSide);
  }

  for (const b of winners.filter(isReal)) {
    const stake = b.amount;
    users.resetLoseStreak(b.user_id);
    users.addTurnover(b.user_id, stake);
    if (stake >= LB_MIN_BET) users.addWinCount(b.user_id);

    const fee = stake * WIN_FEE_PERCENT;
    totalFee += fee;
    betHistory.addBetHistory(b.user_id, gameId, winnerSideName, stake, 'W', timeNow, forcedSide);

    if (stake >= env.wsMinBet) {
      const streak = users.incrementStreak(b.user_id);
      const bonus = calculateWsBonus(streak);
      streaks.push({ name: b.name, streak, bonus });
      if (bonus > 0) claims.push({ userId: b.user_id, name: b.name, bonus });
    } else {
      users.resetStreak(b.user_id);
    }

    users.addBalance(b.user_id, round2(stake + (stake - fee)));
  }

  return { totalFee, streaks, claims, loseEvents };
}

const settleAndClearTx = db.transaction((args) => {
  const result = settleBets(args);
  gameStateRepo.clearPendingBets();
  return result;
});

async function updateLastWinBoard(api, chatId, entry) {
  gameState.last_wins.push(entry);
  if (gameState.last_wins.length > MAX_LAST_WINS) gameState.last_wins.shift();

  if (gameState.last_win_msg_id) {
    const oldId = gameState.last_win_msg_id;
    await api.deleteMessage(chatId, oldId).catch(() => {});
  }

  const sent = await sendRich(api, chatId, msg.lastWinsBoard(gameState.last_wins));
  gameState.last_win_msg_id = sent?.message_id ?? null;
  if (sent) {
    await api.pinChatMessage(chatId, sent.message_id, { disable_notification: true })
      .catch((err) => console.error('⚠️ Gagal pin LAST WIN:', err?.message || err));
  }
}

async function executeBo3AndSettle(api, chatId) {
  gameState.is_rolling = true;
  const epoch = gameState.epoch;
  clearRollConfirm(chatId);
  cancelBetList(chatId);

  const totalPool = totalK();
  const forcedSide = getForcedSide(chatId);

  try {
    await sendRich(api, chatId, msg.bo3Start(forcedSide));
    await sleep(2000);

    const outcome = await rollBestOfThree(api, chatId, epoch, forcedSide);
    if (!outcome || gameState.epoch !== epoch) {
      console.warn(`⚠️ Ronde GAME ${gameState.game_id} dibatalkan: meja di-reset saat roll.`);
      gameState.is_rolling = false;
      await sendRich(api, chatId, msg.roundCancelled());
      return;
    }

    const { dice, scoreK, scoreB, winSide } = outcome;
    const score = winSide === 'K' ? `2-${scoreB}` : `2-${scoreK}`;
    const gameId = gameState.game_id;
    const bets = { k: gameState.bets_k, b: gameState.bets_b };

    const result = settleAndClearTx({ winSide, bets, gameId, forcedSide });
    clearTable();

    await sendRich(api, chatId, msg.bo3Result({ winSide, score, dice, ...result, forcedSide }), {
      reply_markup: keyboards.claimWinStreak(result.claims),
    });

    await updateLastWinBoard(api, chatId, `GAME ${gameId} :${winSide} ${score}   ${totalPool.toFixed(2)}`);

    gameState.game_id += 1;
    gameStateRepo.saveGameState(
      gameState.game_id,
      gameState.last_wins,
      gameState.last_win_msg_id,
      gameState.is_game_open,
    );
    await sendRich(api, chatId, msg.gameOpened(gameState.game_id));
  } finally {
    gameState.is_rolling = false;
  }
}

let roundApi = null;
const setRoundApi = (api) => { roundApi = api; };

function startRound(api, chatId) {
  executeBo3AndSettle(roundApi || api, chatId).catch((err) => {
    console.error(`❌ Ronde di chat ${chatId} gagal:`, err?.message || err);
  });
}

module.exports = {
  executeBo3AndSettle,
  startRound,
  setRoundApi,
  betListMarkdown,
  getCategory,
  rollBestOfThree,
};