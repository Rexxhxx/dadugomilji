'use strict';

const autogopay = require('./autogopay');
const shopeepay = require('./shopeepay');

const PROVIDERS = Object.freeze({
  autogopay: { client: autogopay, label: 'QRIS AUTOGOPAY', name: 'AutoGopay' },
  shopeepay: { client: shopeepay, label: 'QRIS SHOPEEPAY', name: 'ShopeePay' },
});

function getProvider(key) {
  return PROVIDERS[key] || PROVIDERS.autogopay;
}

const createQris = (provider, amount) => getProvider(provider).client.createQris(amount);
const checkDepositStatus = (provider, id) => getProvider(provider).client.checkStatus(id);

module.exports = { PROVIDERS, getProvider, createQris, checkDepositStatus };
