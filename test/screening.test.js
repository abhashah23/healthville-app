'use strict';

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert');
const { DateTime } = require('luxon');
const screening = require('../src/screening');

let app;

test.before(async () => {
  await h.resetDb();
  app = h.createApp();
});

test.after(async () => {
  await h.db.pool.end();
});

// A group whose Session 1 is the coming Thursday, so the Session 1
// screening is open today.
async function groupBeforeSession1(name) {
  const today = DateTime.now().setZone('America/Toronto');
  let next = today.plus({ days: (4 - today.weekday + 7) % 7 }).startOf('day');
  if (today.weekday === 4 && today.hour >= 13) next = next.plus({ weeks: 1 });
  return h.db.one('INSERT INTO groups (name, session1_date) VALUES ($1, $2) RETURNING *', [name, next.toISODate()]);
}

test('screening windows: the week before Session 1 and the week before Session 6', () => {
  const group = { session1_date: '2026-11-05' };
  assert.strictEqual(screening.opens(group, 1).toISO(), '2026-10-29T00:00:00.000-04:00');
  assert.strictEqual(screening.closes(group, 1).toISO(), '2026-11-05T13:00:00.000-05:00');
  assert.strictEqual(screening.opens(group, 6).toISODate(), '2026-12-03');
  assert.strictEqual(screening.closes(group, 6).toISO(), '2026-12-10T13:00:00.000-05:00');
  const z = { zone: 'America/Toronto' };
  assert.strictEqual(screening.state(group, 1, DateTime.fromISO('2026-11-05T12:59', z)), 'open');
  assert.strictEqual(screening.state(group, 1, DateTime.fromISO('2026-11-05T13:00', z)), 'closed');
});

test('screening: follows the screenshot, saves as you go, submit needs all three', async () => {
  const group = await groupBeforeSession1('S1');
  const p = await h.makeUser('participant', { groupId: group.id });
  const { agent, csrf } = await h.signIn(app, p);

  const home = await agent.get('/tracker');
  assert.match(home.text, /Weekly Fatigue Tracker/);
  assert.match(home.text, /Before Session 1, start with the Fatigue Screening/);

  const form = await agent.get('/tracker/screening/1');
  assert.match(form.text, /How tired have you felt over the last week\?/);
  assert.match(form.text, /1: No fatigue/);
  assert.match(form.text, /Very mild/);
  assert.doesNotMatch(form.text, /value="0"/, 'scale is 1 to 10');

  const partial = await agent.post('/tracker/screening/1').set('X-CSRF-Token', csrf).send({ tired_score: 7 });
  assert.deepStrictEqual(partial.body, { ok: true, error: null });
  const bad = await agent.post('/tracker/screening/1').set('X-CSRF-Token', csrf).send({ tired_score: 0 });
  assert.strictEqual(bad.status, 400);

  const notYet = await agent.post('/tracker/screening/1').type('form').send({ _csrf: csrf, tired_score: 7, go: 'submit' });
  assert.strictEqual(notYet.status, 400);
  assert.match(notYet.text, /Your severity level/);
  assert.strictEqual((await screening.get(p.id, 1)).submitted_at, null);

  const done = await agent.post('/tracker/screening/1').type('form')
    .send({ _csrf: csrf, tired_score: 7, severity: 'very_mild', pattern: 'Worst in the afternoon', go: 'submit' });
  assert.match(done.text, /is submitted/);
  const row = await screening.get(p.id, 1);
  assert.ok(row.submitted_at);
  assert.strictEqual(row.severity, 'very_mild');

  const after = await agent.post('/tracker/screening/1').set('X-CSRF-Token', csrf).send({ tired_score: 2 });
  assert.strictEqual(after.status, 400);
  assert.strictEqual((await screening.get(p.id, 1)).tired_score, 7);

  await agent.get('/tracker/screening/2').expect(404);
});

test('screening: Session 6 is not open early; Session 1 is closed later', async () => {
  const group = await h.makeGroup('S2', 2);
  const p = await h.makeUser('participant', { groupId: group.id });
  const { agent, csrf } = await h.signIn(app, p);
  await agent.post('/tracker/screening/6').set('X-CSRF-Token', csrf).send({ tired_score: 3 }).expect(400);
  await agent.post('/tracker/screening/1').set('X-CSRF-Token', csrf).send({ tired_score: 3 }).expect(400);
  await agent.get('/tracker/screening/6').expect(200).expect(/This opens on/);
});

test('screening: staff see it once submitted, side by side for Session 1 and 6', async () => {
  const group = await groupBeforeSession1('S3');
  const f = await h.makeUser('facilitator');
  await h.db.query('INSERT INTO group_facilitators (group_id, user_id) VALUES ($1, $2)', [group.id, f.id]);
  const p = await h.makeUser('participant', { groupId: group.id });
  await screening.save(p.id, 1, { tired_score: 5, severity: 'moderate', pattern: 'Draft pattern text' });

  const { agent } = await h.signIn(app, f);
  let page = await agent.get(`/staff/participants/${p.id}`);
  assert.doesNotMatch(page.text, /Draft pattern text/);
  await screening.submit(p.id, 1);
  page = await agent.get(`/staff/participants/${p.id}`);
  assert.match(page.text, /Draft pattern text/);
  assert.match(page.text, /5 out of 10/);
  assert.match(page.text, /Before Session 6/);
  const grid = await agent.get(`/staff/groups/${group.id}`);
  assert.match(grid.text, /Before S1/);
  assert.doesNotMatch(grid.text, /Screening S6/);
  assert.match(grid.text, /before Session 1:<\/strong> 1 of 1 submitted/);
});

test('screening before Session 6 is part of week 5 and is submitted with it', async () => {
  const group = await h.makeGroup('S4', 5); // week 5 is open
  const p = await h.makeUser('participant', { groupId: group.id });
  const { agent, csrf } = await h.signIn(app, p);
  const tracker = require('../src/tracker');

  const home = await agent.get('/tracker');
  assert.match(home.text, /href="\/tracker\/screening\/6"/, 'continue starts with the screening');
  const week = await agent.get('/tracker/week/5');
  assert.match(week.text, /Fatigue Screening \(before Session 6\)/);
  const form = await agent.get('/tracker/screening/6');
  assert.match(form.text, /Save and go to the daily entries/);
  assert.doesNotMatch(form.text, /value="submit"/, 'no separate submit');

  // Daily entries and reflection done, screening not: the week cannot be submitted.
  await h.fillWeek(p.id, 5);
  const review = await agent.get('/tracker/week/5/review');
  assert.match(review.text, /Fatigue Screening: How tired/);
  assert.strictEqual((await tracker.submitWeek(p.id, 5)).length, 3);

  const saved = await agent.post('/tracker/screening/6').type('form')
    .send({ _csrf: csrf, tired_score: 4, severity: 'mild', pattern: 'Better now', go: 'week' });
  assert.strictEqual(saved.headers.location, '/tracker/week/5');
  assert.strictEqual((await screening.get(p.id, 6)).submitted_at, null);

  const done = await agent.post('/tracker/week/5/submit').type('form').send({ _csrf: csrf });
  assert.match(done.text, /Week 5 is submitted/);
  assert.ok((await screening.get(p.id, 6)).submitted_at, 'screening submitted with the week');
  await agent.post('/tracker/screening/6').set('X-CSRF-Token', csrf).send({ tired_score: 9 }).expect(400);
});
