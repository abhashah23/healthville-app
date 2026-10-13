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

test('spoon tracker: its own tracker, 12 a day, cross off and put back', async () => {
  const group = await h.makeGroup('P1', 2);
  const p = await h.makeUser('participant', { groupId: group.id });
  const { agent, csrf } = await h.signIn(app, p);

  const home = await agent.get('/tracker');
  assert.match(home.text, /Start the Daily Spoon Tracker/);
  assert.match(home.text, /Start the Energy Balance Blueprint/);

  const page = await agent.get('/tracker/spoons/day/2');
  assert.match(page.text, /0 of 12 spoons used/);

  for (let i = 0; i < 3; i++) {
    const r = await agent.post('/tracker/spoons/day/2').set('X-CSRF-Token', csrf).send({ change: 'add' });
    assert.strictEqual(r.body.used, i + 1);
  }
  await agent.post('/tracker/spoons/day/2').set('X-CSRF-Token', csrf).send({ change: 'remove' });
  // Without JavaScript the form posts and reloads.
  await agent.post('/tracker/spoons/day/5').type('form').send({ _csrf: csrf, change: 'add' }).expect(302);

  let data = await spoons.getSheet(p.id);
  assert.strictEqual(data.days[1], 2);
  assert.strictEqual(data.days[4], 1);
  assert.strictEqual(data.days[0], null);

  for (let i = 0; i < 15; i++) await agent.post('/tracker/spoons/day/7').set('X-CSRF-Token', csrf).send({ change: 'add' });
  data = await spoons.getSheet(p.id);
  assert.strictEqual(data.days[6], 12, 'never more than 12');

  // The Energy Balance Blueprint no longer shows spoons left.
  const eb = await agent.get('/tracker/energy/day/1');
  assert.doesNotMatch(eb.text, /Today.s Spoons/i);
});

test('spoon tracker: submit once, staff see it after', async () => {
  const group = await h.makeGroup('P2', 2);
  const f = await h.makeUser('facilitator');
  await h.db.query('INSERT INTO group_facilitators (group_id, user_id) VALUES ($1, $2)', [group.id, f.id]);
  const p = await h.makeUser('participant', { groupId: group.id });
  const { agent, csrf } = await h.signIn(app, p);

  await agent.post('/tracker/spoons/submit').type('form').send({ _csrf: csrf }).expect(302).expect('Location', '/tracker/spoons/review');
  await spoons.setUsed(p.id, 3, 9);

  const fa = await h.signIn(app, f);
  let staff = await fa.agent.get(`/staff/participants/${p.id}`);
  assert.doesNotMatch(staff.text, /9 of 12<\/strong> spoons used/);

  const done = await agent.post('/tracker/spoons/submit').type('form').send({ _csrf: csrf });
  assert.match(done.text, /Daily Spoon Tracker is submitted/);
  await agent.post('/tracker/spoons/day/4').set('X-CSRF-Token', csrf).send({ change: 'add' }).expect(400);

  staff = await fa.agent.get(`/staff/participants/${p.id}`);
  assert.match(staff.text, /9 of 12<\/strong> spoons used/);
  const grid = await fa.agent.get(`/staff/groups/${group.id}`);
  assert.match(grid.text, /Daily Spoon Tracker:<\/strong> 1 of 1 submitted/);
});

test('spoon tracker: closed outside the week after Session 2', async () => {
  const group = await h.makeGroup('P3', 3);
  const p = await h.makeUser('participant', { groupId: group.id });
  const { agent, csrf } = await h.signIn(app, p);
  await agent.post('/tracker/spoons/day/1').set('X-CSRF-Token', csrf).send({ change: 'add' }).expect(400);
  await agent.get('/tracker/spoons/day/1').expect(302);
});
