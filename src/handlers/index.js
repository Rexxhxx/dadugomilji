'use strict';

/** Merangkai semua handler ke satu Composer dengan urutan prioritas yang tetap. */

const { Composer } = require('grammy');
const { registerUser, persistPendingBets } = require('./middlewares');
const member = require('./member');
const accountCommands = require('./commands/account');
const paymentCommands = require('./commands/payment');
const gameCommands = require('./commands/game');
const ownerCommands = require('./commands/owner');
const depositCallbacks = require('./callbacks/deposit');
const withdrawCallbacks = require('./callbacks/withdraw');
const rollCallbacks = require('./callbacks/roll');
const winStreakCallbacks = require('./callbacks/winStreak');
const textRouter = require('./text');

const handlers = new Composer();

handlers.use(registerUser);
handlers.use(persistPendingBets);

handlers.use(member);

// Perintah satu kata harus mendahului router teks; `hears` yang cocok
// tidak memanggil next(), jadi router teks tidak ikut memproses.
handlers.use(accountCommands);
handlers.use(paymentCommands);
handlers.use(gameCommands);
handlers.use(ownerCommands);

handlers.use(depositCallbacks);
handlers.use(withdrawCallbacks);
handlers.use(rollCallbacks);
handlers.use(winStreakCallbacks);

handlers.use(textRouter);

module.exports = handlers;
