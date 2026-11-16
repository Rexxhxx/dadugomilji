'use strict';

const { COIN_PRICE, MIN_DEPOSIT_RUPIAH } = require('../config');

const DEPOSIT_BONUS_TIERS = Object.freeze([
  { min: 50000, rupiahBonus: 7000, coinBonus: 7 },
  { min: 40000, rupiahBonus: 5000, coinBonus: 5 },
  { min: 30000, rupiahBonus: 4000, coinBonus: 4 },
  { min: 20000, rupiahBonus: 3000, coinBonus: 3 },
  { min: 10000, rupiahBonus: 2000, coinBonus: 2 },
  { min: 5000, rupiahBonus: 1000, coinBonus: 1 },
]);

/** Input < 200 dianggap jumlah koin (dikali 1000), selain itu rupiah. */
function parseDepositInput(input) {
  const num = parseFloat(String(input).replace(/[^0-9.,]/g, '').replace(',', '.'));
  if (Number.isNaN(num) || num <= 0) return 0;
  return num < MIN_DEPOSIT_RUPIAH ? Math.round(num * COIN_PRICE) : Math.round(num);
}

function calculateDepoBonus(rupiah) {
  const tier = DEPOSIT_BONUS_TIERS.find((t) => rupiah >= t.min);
  return tier ? { rupiahBonus: tier.rupiahBonus, coinBonus: tier.coinBonus } : { rupiahBonus: 0, coinBonus: 0 };
}

module.exports = { DEPOSIT_BONUS_TIERS, parseDepositInput, calculateDepoBonus };
