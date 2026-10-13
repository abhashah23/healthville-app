'use strict';

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert');
const energy = require('../src/energy');

let app;

test.before(async () => {
  await h.resetDb();
  app = h.createApp();
});

test.after(async () => {
  await h.db.pool.end();
});

test('energy balance: add lines, daily total is used minus given back', async () => {
  const group = await h.makeGroup('E1', 2); // week 2 (after Session 2) is open
  const p = await h.makeUser('participant', { groupId: group.id });
  const { agent, csrf } = await h.signIn(app, p);

  await agent.get('/tracker').expect(200).expect(/Energy Balance Blueprint/);
  await agent.post('/tracker/energy/day/3/add/activity').type('form').send({ _csrf: csrf, activity: 'Groceries', points: 3 }).expect(302);
  await agent.post('/tracker/energy/day/3/add/activity').type('form').send({ _csrf: csrf, activity: 'Shower', points: 2, comment: 'Took a while' }).expect(302);
  await agent.post('/tracker/energy/day/3/add/replenish').type('form').send({ _csrf: csrf, activity: 'Nap', points: 4 }).expect(302);

  const bad = await agent.post('/tracker/energy/day/3/add/activity').type('form').send({ _csrf: csrf, activity: 'Walk', points: 5 });
  assert.strictEqual(bad.status, 400);
  assert.match(bad.text, /points from 1 to 4/);
  const noText = await agent.post('/tracker/energy/day/3/add/activity').type('form').send({ _csrf: csrf, activity: ' ', points: 2 });
  assert.strictEqual(noText.status, 400);

  const data = await energy.getSheet(p.id);
  assert.strictEqual(data.days[2].used, 5);
  assert.strictEqual(data.days[2].given, 4);
  assert.strictEqual(data.days[2].total, 1);
  assert.strictEqual(data.days[0].count, 0);

  const day = await agent.get('/tracker/energy/day/3');
  assert.match(day.text, /Groceries/);
  assert.match(day.text, /Took a while/);
});

test('energy balance: change and remove a line, but not someone else\'s', async () => {
  const group = await h.makeGroup('E2', 2);
  const p = await h.makeUser('participant', { groupId: group.id });
  const other = await h.makeUser('participant', { groupId: group.id });
  await energy.addLine(other.id, 0, 'activity', { activity: 'Theirs', points: 1 });
  const theirs = (await energy.getSheet(other.id)).lines[0];

  const { agent, csrf } = await h.signIn(app, p);
  await energy.addLine(p.id, 0, 'activity', { activity: 'Mine', points: 1 });
  const mine = (await energy.getSheet(p.id)).lines[0];

  await agent.post(`/tracker/energy/line/${mine.id}`).type('form').send({ _csrf: csrf, activity: 'Mine, changed', points: 2 }).expect(302);
  assert.strictEqual((await energy.getSheet(p.id)).lines[0].points, 2);

  await agent.get(`/tracker/energy/line/${theirs.id}`).expect(404);
  await agent.post(`/tracker/energy/line/${theirs.id}/delete`).type('form').send({ _csrf: csrf }).expect(404);
  assert.strictEqual((await energy.getSheet(other.id)).lines.length, 1);

  await agent.post(`/tracker/energy/line/${mine.id}/delete`).type('form').send({ _csrf: csrf }).expect(302);
  assert.strictEqual((await energy.getSheet(p.id)).lines.length, 0);
});

test('energy balance: submit needs one activity, then nothing can change', async () => {
  const group = await h.makeGroup('E3', 2);
  const p = await h.makeUser('participant', { groupId: group.id });
  const { agent, csrf } = await h.signIn(app, p);

  await agent.post('/tracker/energy/submit').type('form').send({ _csrf: csrf }).expect(302).expect('Location', '/tracker/energy/review');
  await energy.addLine(p.id, 1, 'replenish', { activity: 'Rest', points: 2 });
  assert.strictEqual(await energy.submit(p.id), false, 'replenishing alone is not enough');

  await energy.addLine(p.id, 1, 'activity', { activity: 'Cooking', points: 3 });
  const done = await agent.post('/tracker/energy/submit').type('form').send({ _csrf: csrf });
  assert.match(done.text, /is submitted/);

  assert.match(await energy.addLine(p.id, 1, 'activity', { activity: 'Late', points: 1 }), /already been submitted/);
  const line = (await energy.getSheet(p.id)).lines[0];
  assert.match(await energy.deleteLine(p.id, line.id), /already been submitted/);
  await agent.get('/tracker/energy/day/2').expect(302);
});

test('energy balance: not open before Session 2, closed after Session 3 starts', async () => {
  const before = await h.makeGroup('E4', 1);
  const after = await h.makeGroup('E5', 3);
  const p1 = await h.makeUser('participant', { groupId: before.id });
  const p2 = await h.makeUser('participant', { groupId: after.id });
  const a1 = await h.signIn(app, p1);
  await a1.agent.get('/tracker/energy').expect(200).expect(/not open yet/);
  await a1.agent.post('/tracker/energy/day/1/add/activity').type('form').send({ _csrf: a1.csrf, activity: 'x', points: 1 }).expect(302);
  const a2 = await h.signIn(app, p2);
  await a2.agent.post('/tracker/energy/day/1/add/activity').type('form').send({ _csrf: a2.csrf, activity: 'x', points: 1 }).expect(302);
  assert.strictEqual((await energy.getSheet(p1.id)).lines.length, 0);
  assert.strictEqual((await energy.getSheet(p2.id)).lines.length, 0);
});

test('energy balance: staff see it once submitted, not while in progress', async () => {
  const group = await h.makeGroup('E6', 2);
  const f = await h.makeUser('facilitator');
  await h.db.query('INSERT INTO group_facilitators (group_id, user_id) VALUES ($1, $2)', [group.id, f.id]);
  const p = await h.makeUser('participant', { groupId: group.id });
  await energy.addLine(p.id, 4, 'activity', { activity: 'Private draft line', points: 2 });

  const { agent } = await h.signIn(app, f);
  let page = await agent.get(`/staff/participants/${p.id}`);
  assert.doesNotMatch(page.text, /Private draft line/);
  const grid = await agent.get(`/staff/groups/${group.id}`);
  assert.match(grid.text, /Energy Balance Blueprint/);
  assert.match(grid.text, /0 of 1 submitted/);

  await energy.submit(p.id);
  page = await agent.get(`/staff/participants/${p.id}`);
  assert.match(page.text, /Private draft line/);
  assert.match(page.text, /Daily total: 2/);
});

test('energy balance: deleting a participant removes their worksheet', async () => {
  const group = await h.makeGroup('E7', 2);
  const p = await h.makeUser('participant', { groupId: group.id });
  await energy.addLine(p.id, 0, 'activity', { activity: 'x', points: 1 });
  await h.db.query('DELETE FROM users WHERE id = $1', [p.id]);
  assert.strictEqual((await h.db.one('SELECT count(*)::int AS n FROM energy_lines')).n > 0, true, 'other test data remains');
  assert.strictEqual((await h.db.one('SELECT count(*)::int AS n FROM energy_sheets WHERE participant_id = $1', [p.id])).n, 0);
});
