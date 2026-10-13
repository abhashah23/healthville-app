'use strict';

const { bands } = require('./content');

// Band for a single whole-number score (0 to 10), or null.
function bandFor(score) {
  if (score === null || score === undefined || score === '') return null;
  const n = Number(score);
  return bands.find((b) => n >= b.min && n <= b.max) || null;
}

module.exports = { bandFor };
