'use strict';

const { WS_BONUS_TIERS } = require('../config');

const TIERS = Object.keys(WS_BONUS_TIERS).map(Number).sort((a, b) => b - a);

/** Bonus win streak sesuai tier tertinggi yang tercapai. */
function calculateWsBonus(streak) {
  for (const tier of TIERS) {
    if (streak >= tier) return WS_BONUS_TIERS[tier];
  }
  return 0;
}

module.exports = { calculateWsBonus };
