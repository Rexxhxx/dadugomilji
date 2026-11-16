'use strict';

const { gameState: gameStateRepo, angpaos: angpaoRepo } = require('../database');
const { groupRollSettings } = require('../database');

const saved = gameStateRepo.loadGameState();

const gameState = {
  game_id: saved.game_id,
  is_game_open: saved.is_game_open,
  is_rolling: false,
  epoch: 0,
  bets_k: [],
  bets_b: [],
  first_bet_time: null,
  last_wins: saved.last_wins,
  last_win_msg_id: saved.last_win_msg_id,
};

const pendingRollConfirm = {};
const activeAngpaos = angpaoRepo.loadAngpaos();
const userSessions = {};

const totalOf = (bets) => bets.reduce((acc, b) => acc + b.amount, 0);
const totalK = () => totalOf(gameState.bets_k);
const totalB = () => totalOf(gameState.bets_b);

function clearAllRollConfirms() {
  for (const key of Object.keys(pendingRollConfirm)) {
    if (pendingRollConfirm[key]?.timer) clearTimeout(pendingRollConfirm[key].timer);
    delete pendingRollConfirm[key];
  }
}

function clearRollConfirm(chatId) {
  if (pendingRollConfirm[chatId]?.timer) clearTimeout(pendingRollConfirm[chatId].timer);
  delete pendingRollConfirm[chatId];
}

function clearTable() {
  gameState.bets_k = [];
  gameState.bets_b = [];
  gameState.first_bet_time = null;
}

function getForcedSide(chatId) {
  return groupRollSettings.getForcedSide(chatId);
}

module.exports = {
  gameState,
  pendingRollConfirm,
  activeAngpaos,
  userSessions,
  totalOf,
  totalK,
  totalB,
  clearAllRollConfirms,
  clearRollConfirm,
  clearTable,
  getForcedSide,
};