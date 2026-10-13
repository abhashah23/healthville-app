'use strict';

require('./helpers');
const test = require('node:test');
const assert = require('node:assert');
const { DateTime } = require('luxon');
const time = require('../src/time');

const S1 = '2026-11-05'; // Pilot Session 1, a Thursday.

test('week 1 runs from Thursday Nov 5 until Session 2 starts at 1:00 PM ET', () => {
  assert.strictEqual(time.weekOpens(S1, 1).toISO(), '2026-11-05T00:00:00.000-05:00');
  assert.strictEqual(time.weekCloses(S1, 1).toISO(), '2026-11-12T13:00:00.000-05:00');
  const days = time.weekDays(S1, 1);
  assert.strictEqual(days.length, 7);
  assert.strictEqual(time.formatDay(days[0]), 'Thursday, November 5');
  assert.strictEqual(time.formatDay(days[6]), 'Wednesday, November 11');
});

test('week state changes exactly at the session start', () => {
  const z = { zone: 'America/Toronto' };
  assert.strictEqual(time.weekState(S1, 1, DateTime.fromISO('2026-11-04T23:59', z)), 'upcoming');
  assert.strictEqual(time.weekState(S1, 1, DateTime.fromISO('2026-11-12T12:59', z)), 'open');
  assert.strictEqual(time.weekState(S1, 1, DateTime.fromISO('2026-11-12T13:00', z)), 'closed');
  assert.strictEqual(time.openWeek(S1, DateTime.fromISO('2026-11-12T13:00', z)), 2);
});

test('a participant in Sydney gets the same deadline moment', () => {
  const sydney = DateTime.fromISO('2026-11-13T05:00', { zone: 'Australia/Sydney' });
  assert.strictEqual(time.weekState(S1, 1, sydney), 'closed');
  assert.strictEqual(time.weekState(S1, 1, sydney.minus({ minutes: 1 })), 'open');
});

test('deadline text is plain and has no em dash', () => {
  const text = time.formatDeadline(time.weekCloses(S1, 1));
  assert.strictEqual(text, 'Thursday, November 12 at 1:00 PM Eastern Time');
});
