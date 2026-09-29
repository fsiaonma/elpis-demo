'use strict';

const crypto = require('crypto');

const SIGN_KEY = 'klx05hb3n1c9ujp8uhxbs2ikkiowp212';

function buildSignHeaders(extra = {}) {
  const st = Date.now();
  return {
    'Content-Type': 'application/json',
    ...extra,
    s_t: String(st),
    s_sign: crypto.createHash('md5').update(`${SIGN_KEY}_${st}`).digest('hex'),
  };
}

module.exports = { buildSignHeaders };
