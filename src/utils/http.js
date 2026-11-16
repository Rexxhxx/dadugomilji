'use strict';

const https = require('https');

/** Agent HTTPS bersama untuk semua panggilan API eksternal (keep-alive, TLS >= 1.2). */
const httpsAgent = new https.Agent({
  keepAlive: true,
  rejectUnauthorized: true,
  minVersion: 'TLSv1.2',
});

module.exports = { httpsAgent };
