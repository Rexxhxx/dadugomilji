'use strict';

/** Kirim bukti transaksi (testimoni) ke channel publik. */

const { env } = require('../config');
const { sendRich } = require('../ui/rich');
const msg = require('../ui/messages/payment');
const { nowLocaleWib } = require('../utils/format');

/**
 * @param {import('grammy').Api} api
 * @param {'DEPOSIT'|'WITHDRAW'} type
 * @param {{userName, coins, rupiahAmount, refId, method, fee?}} data
 *   Untuk deposit, `fee` berisi bonus koin (sama seperti versi lama).
 */
async function sendTestimoni(api, type, data) {
  const base = { ...data, time: nowLocaleWib() };
  const text = type === 'DEPOSIT'
    ? msg.testimoniDeposit({ ...base, bonus: data.fee || 0 })
    : msg.testimoniWithdraw({ ...base, fee: data.fee || 0 });

  const sent = await sendRich(api, env.channelTestiId, text);
  if (sent) console.log(`✅ Testimoni ${type} terkirim ke ${env.channelTestiId}`);
  return sent;
}

module.exports = { sendTestimoni };
