'use strict';

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert');
const spoons = require('../src/spoons');

let app;

test.before(async () => {
  await h.resetDb();
  app = h.createApp();
});

test.after(async () => {
  await h.db.pool.end();
});

test('spoon tracker: just 12 spoons to cross off for today', async () => {
  const group = await h.makeGroup('P1', 2); // opens on the day of Session 2
  const p = await h.makeUser('participant', { groupId: group.id });
  const { agent, csrf } = await h.signIn(app, p);

  const home = await agent.get('/tracker');
  assert.match(home.text, /Spoon Tracker/);
  assert.doesNotMatch(home.text, /[Ss]ession \d|home practice|Screening/);

  const page = await agent.get('/tracker/spoons');
  assert.match(page.text, /Today&#39;s Spoons/);
  assert.strictEqual((page.text.match(/class="spoon-btn"/g) || []).length, 12);
  assert.doesNotMatch(page.text, />[^<]*(Submit|[Ww]eek|[Ss]ession \d)/);

  const today = spoons.dates(group)[spoons.todayIndex(group)].toISODate();
  let r = await agent.post('/tracker/spoons').set('X-CSRF-Token', csrf).send({ spoon: 0, date: today });
  assert.strictEqual(r.body.crossed, 1);
  r = await agent.post('/tracker/spoons').set('X-CSRF-Token', csrf).send({ spoon: 4, date: today });
  assert.strictEqual(r.body.crossed, 17);
  r = await agent.post('/tracker/spoons').set('X-CSRF-Token', csrf).send({ spoon: 0, date: today });
  assert.strictEqual(r.body.crossed, 16, 'tapping again puts the spoon back');
  await agent.post('/tracker/spoons').set('X-CSRF-Token', csrf).send({ spoon: 12, date: today }).expect(400);

  // Without JavaScript the form posts and reloads.
  await agent.post('/tracker/spoons').type('form').send({ _csrf: csrf, spoon: 1, date: today }).expect(302);
  const days = await spoons.getDays(p.id);
  assert.strictEqual(spoons.countCrossed(days[spoons.todayIndex(group)]), 2);
});

test('spoon tracker: staff see the days straight away; closed outside its week', async () => {
  const group = await h.makeGroup('P2', 2);
  const f = await h.makeUser('facilitator');
  await h.db.query('INSERT INTO group_facilitators (group_id, user_id) VALUES ($1, $2)', [group.id, f.id]);
  const p = await h.makeUser('participant', { groupId: group.id });
  for (let i = 0; i < 9; i++) await spoons.toggle(p.id, 3, i);

  const fa = await h.signIn(app, f);
  const staff = await fa.agent.get(`/staff/participants/${p.id}`);
  assert.match(staff.text, /9 of 12<\/strong> crossed off/);
  const grid = await fa.agent.get(`/staff/groups/${group.id}`);
  assert.match(grid.text, /1 day/);

  const later = await h.makeGroup('P3', 3);
  const q = await h.makeUser('participant', { groupId: later.id });
  const qa = await h.signIn(app, q);
  await qa.agent.get('/tracker/spoons').expect(200).expect(/not open right now/);
  await qa.agent.post('/tracker/spoons').set('X-CSRF-Token', qa.csrf).send({ spoon: 1 }).expect(400);
  const home = await qa.agent.get('/tracker');
  assert.doesNotMatch(home.text, /Cross off today/);
});
