'use strict';

const { env } = require('../config');

function isMainOwner(userId) {
  return env.ownerIds.includes(Number(userId));
}

module.exports = { isMainOwner };
