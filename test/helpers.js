'use strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://hv:hv@localhost:5432/healthville_test';

const request = require('supertest');
const { DateTime } = require('luxon');
const db = require('../src/db');
const migrate = require('../scripts/migrate');
const auth = require('../src/auth');
const createApp = require('../src/app');

async function resetDb() {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  auth.resetRateLimits();
}

// A Thursday so that the given week number is open today.
function session1ForOpenWeek(n) {
  const today = DateTime.now().setZone('America/Toronto');
  let thursday = today.minus({ days: (today.weekday - 4 + 7) % 7 }).startOf('day');
  // Before 1 PM on a Thursday, the previous week is still open.
  if (today.weekday === 4 && today.hour < 13) thursday = thursday.minus({ weeks: 1 });
  return thursday.minus({ weeks: n - 1 }).toISODate();
}

async function makeGroup(name, openWeek = 1) {
  return db.one('INSERT INTO groups (name, session1_date) VALUES ($1, $2) RETURNING *', [name, session1ForOpenWeek(openWeek)]);
}

let counter = 0;
async function makeUser(role, extra = {}) {
  counter += 1;
  return db.one(
    `INSERT INTO users (name, email, role, participant_code, group_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [extra.name || `Person ${counter}`, `user${counter}@test.example`, role, role === 'participant' ? `HV-T${counter}` : null, extra.groupId || null]
  );
}

// Signs in through the real sign-in link flow and returns an agent plus the
// CSRF token for its session.
async function signIn(app, user) {
  const agent = request.agent(app);
  const token = await auth.createLoginToken(user.id);
  await agent.post('/sign-in/confirm').type('form').send({ token }).expect(302);
  const home = await agent.get(user.role === 'participant' ? '/tracker' : '/staff');
  const csrf = (home.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
  return { agent, csrf };
}

async function fillWeek(userId, n, { reflections = true } = {}) {
  const tracker = require('../src/tracker');
  for (let d = 0; d < 7; d++) {
    for (const t of tracker.TIMES) {
      await tracker.saveSlot(userId, n, d, t, { score: 5, activity: 'Walk', notes: '' });
    }
  }
  if (reflections) {
    await tracker.saveWeekly(userId, n, { tired_score: 6, pattern: 'Worst in the afternoon' });
    for (let d = 0; d < 7; d++) await tracker.saveSeverity(userId, n, d, 'moderate');
    await tracker.saveReflections(userId, n, {
      reflection_most_fatigued: 'a',
      reflection_biggest_impact: 'b',
      reflection_one_change: 'c',
    });
  }
}

module.exports = { db, createApp, resetDb, makeGroup, makeUser, signIn, fillWeek, session1ForOpenWeek };
