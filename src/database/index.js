'use strict';

const { db, DB_PATH } = require('./connection');
const { initDb } = require('./schema');

module.exports = {
  db,
  DB_PATH,
  initDb,
  users: require('./repositories/user.repository'),
  groupRollSettings: require('./repositories/groupRollSetting.repository'),
  cashback: require('./repositories/cashback.repository'),
  transactions: require('./repositories/transaction.repository'),
  deposits: require('./repositories/deposit.repository'),
  bets: require('./repositories/betHistory.repository'),
  gameState: require('./repositories/gameState.repository'),
  titleAdmins: require('./repositories/titleAdmin.repository'),
  angpaos: require('./repositories/angpao.repository'),
  kv: require('./repositories/kv.repository'),
  memberTags: require('./repositories/memberTag.repository'),
};
