'use strict';

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const email = require('../src/email');
const tracker = require('../src/tracker');

let app;

test.before(async () => {
  await h.resetDb();
  app = h.createApp();
});

test.after(async () => {
  await h.db.pool.end();
});

test('sign-in: same answer for unknown emails, link works once, opening it does not use it', async () => {
  const group = await h.makeGroup('G', 1);
  const p = await h.makeUser('participant', { groupId: group.id });
  email.outbox.length = 0;

  const unknown = await request(app).post('/sign-in').type('form').send({ email: 'nobody@test.example' });
  assert.match(unknown.text, /Check your email/);
  assert.strictEqual(email.outbox.length, 0);

  const known = await request(app).post('/sign-in').type('form').send({ email: p.email.toUpperCase() });
  assert.match(known.text, /Check your email/);
  assert.strictEqual(email.outbox.length, 1);
  assert.doesNotMatch(email.outbox[0].text, /fatigue|score/i, 'sign-in email holds no health information');
  const token = email.outbox[0].text.match(/token=([^\s]+)/)[1];

  // A mail scanner opening the link must not use it up.
  await request(app).get(`/sign-in/confirm?token=${token}`).expect(200);
  await request(app).get(`/sign-in/confirm?token=${token}`).expect(200);

  const agent = request.agent(app);
  await agent.post('/sign-in/confirm').type('form').send({ token: decodeURIComponent(token) }).expect(302);
  await agent.get('/tracker').expect(200);
  await request(app).post('/sign-in/confirm').type('form').send({ token: decodeURIComponent(token) }).expect(400);
});

test('participant: autosave, required fields, submit once, no changes after', async () => {
  const group = await h.makeGroup('G2', 1);
  const p = await h.makeUser('participant', { groupId: group.id });
  const { agent, csrf } = await h.signIn(app, p);

  // Without the CSRF token, saving is refused.
  await agent.post('/tracker/week/1/day/1/morning').send({ score: 4, activity: 'x' }).expect(403);

  const form = await agent.get('/tracker/week/1/day/1/morning');
  assert.match(form.text, /0 = No fatigue/);
  assert.match(form.text, /10 = Worst possible fatigue/);
  assert.match(form.text, /What I was doing/);

  const ok = await agent.post('/tracker/week/1/day/1/morning').set('X-CSRF-Token', csrf).send({ score: 4, activity: '' });
  assert.deepStrictEqual(ok.body, { ok: true, error: null });

  const bad = await agent.post('/tracker/week/1/day/1/morning').set('X-CSRF-Token', csrf).send({ score: 11, activity: 'x' });
  assert.strictEqual(bad.status, 400);

  // Incomplete week: submit goes back to the review list.
  await agent.post('/tracker/week/1/submit').type('form').send({ _csrf: csrf }).expect(302);
  let week = await tracker.getWeek(p.id, 1);
  assert.strictEqual(week.row.submitted_at, null);
  const review = await agent.get('/tracker/week/1/review');
  assert.match(review.text, /what you were doing/);

  // All slots but no weekly questions, severity or reflection: still not allowed.
  await h.fillWeek(p.id, 1, { reflections: false });
  const gaps = await tracker.submitWeek(p.id, 1);
  assert.deepStrictEqual(gaps.map((g) => g.key || g.kind), ['tired', 'pattern', 'severity', 'severity', 'severity', 'severity', 'severity', 'severity', 'severity', 'reflection_most_fatigued', 'reflection_biggest_impact', 'reflection_one_change']);
  const reviewAll = await agent.get('/tracker/week/1/review');
  assert.match(reviewAll.text, /How tired have you felt over the last week\?/);
  assert.match(reviewAll.text, /your severity level/);

  // The two weekly questions are at the top of the week page.
  const weekPage = await agent.get('/tracker/week/1');
  assert.match(weekPage.text, /id="weekly-questions"/);
  assert.ok(weekPage.text.indexOf('How tired have you felt over the last week?') < weekPage.text.indexOf('Day 1:'), 'weekly questions come first');
  assert.match(weekPage.text, /1: No fatigue/);
  assert.match(weekPage.text, /Three things fatigue prevents me from doing/);
  const home = await agent.get('/tracker');
  assert.match(home.text, /href="\/tracker\/week\/1#weekly-questions"/);
  const partial = await agent.post('/tracker/week/1/weekly').set('X-CSRF-Token', csrf).send({ tired_score: 7 });
  assert.deepStrictEqual(partial.body, { ok: true, error: null });
  await agent.post('/tracker/week/1/weekly').set('X-CSRF-Token', csrf).send({ tired_score: 0 }).expect(400);

  // Severity level is asked every day, right after the evening.
  const evening = await agent.get('/tracker/week/1/day/1/evening');
  assert.match(evening.text, /Save and go to next/);
  const sevPage = await agent.get('/tracker/week/1/day/1/severity');
  assert.match(sevPage.text, /Your severity level/);
  assert.match(sevPage.text, /Very mild/);
  const sev = await agent.post('/tracker/week/1/day/1/severity').type('form').send({ _csrf: csrf, severity: 'very_mild' });
  assert.strictEqual(sev.headers.location, '/tracker/week/1/day/2/morning');
  await agent.post('/tracker/week/1/day/1/severity').set('X-CSRF-Token', csrf).send({ severity: 'awful' }).expect(400);

  await h.fillWeek(p.id, 1);
  const done = await agent.post('/tracker/week/1/submit').type('form').send({ _csrf: csrf });
  assert.match(done.text, /Week 1 is submitted/);
  week = await tracker.getWeek(p.id, 1);
  assert.ok(week.row.submitted_at);

  const after = await agent.post('/tracker/week/1/day/1/morning').set('X-CSRF-Token', csrf).send({ score: 9, activity: 'changed' });
  assert.strictEqual(after.status, 400);
  week = await tracker.getWeek(p.id, 1);
  assert.strictEqual(week.entries['0-morning'].score, 5);
});

test('participant: closed and upcoming weeks cannot be changed', async () => {
  const group = await h.makeGroup('G3', 2);
  const p = await h.makeUser('participant', { groupId: group.id });
  const { agent, csrf } = await h.signIn(app, p);
  const closed = await agent.post('/tracker/week/1/day/1/morning').set('X-CSRF-Token', csrf).send({ score: 3, activity: 'x' });
  assert.strictEqual(closed.status, 400);
  const upcoming = await agent.post('/tracker/week/3/day/1/morning').set('X-CSRF-Token', csrf).send({ score: 3, activity: 'x' });
  assert.strictEqual(upcoming.status, 400);
  await agent.get('/tracker/week/3').expect(200).expect(/not open yet/);
  await agent.get('/tracker/week/7').expect(404);
});

test('roles: participants cannot see staff pages, facilitators cannot see admin', async () => {
  const group = await h.makeGroup('G4', 1);
  const p = await h.makeUser('participant', { groupId: group.id });
  const f = await h.makeUser('facilitator');
  const pa = await h.signIn(app, p);
  await pa.agent.get('/staff').expect(403);
  await pa.agent.get('/admin').expect(403);
  const fa = await h.signIn(app, f);
  await fa.agent.get('/admin').expect(403);
  await fa.agent.get('/tracker').expect(403);
  await request(app).get('/staff').expect(302).expect('Location', '/sign-in');
});

test('facilitators see only their own group, and every view is in the audit log', async () => {
  const mine = await h.makeGroup('Mine', 2);
  const theirs = await h.makeGroup('Theirs', 2);
  const f = await h.makeUser('facilitator');
  await h.db.query('INSERT INTO group_facilitators (group_id, user_id) VALUES ($1, $2)', [mine.id, f.id]);
  const p1 = await h.makeUser('participant', { groupId: mine.id, name: 'Visible Person' });
  const p2 = await h.makeUser('participant', { groupId: theirs.id, name: 'Hidden Person' });

  const { agent } = await h.signIn(app, f);
  const list = await agent.get('/staff');
  assert.match(list.text, /Mine/);
  assert.doesNotMatch(list.text, /Theirs/);
  await agent.get(`/staff/groups/${theirs.id}`).expect(404);
  await agent.get(`/staff/participants/${p2.id}`).expect(404);

  const page = await agent.get(`/staff/participants/${p1.id}`).expect(200);
  assert.match(page.text, /Visible Person/);
  const log = await h.db.one(`SELECT * FROM audit_log WHERE action = 'view_participant' AND actor_id = $1`, [f.id]);
  assert.strictEqual(log.subject_label, p1.participant_code);
});

test('staff see entries once a week is submitted or closed, not while in progress', async () => {
  const group = await h.makeGroup('G5', 2); // week 1 closed, week 2 open
  const admin = await h.makeUser('admin');
  const p = await h.makeUser('participant', { groupId: group.id });
  await tracker.getOrCreateWeekRow(p.id, 1);
  await h.db.query(
    `INSERT INTO tracker_entries (week_id, day_index, time_of_day, score, activity)
     SELECT id, 0, 'morning', 8, 'Closed week activity' FROM tracker_weeks WHERE participant_id = $1 AND week_number = 1`,
    [p.id]
  );
  await tracker.saveSlot(p.id, 2, 0, 'morning', { score: 2, activity: 'Draft activity', notes: '' });

  const { agent } = await h.signIn(app, admin);
  const page = await agent.get(`/staff/participants/${p.id}`);
  assert.match(page.text, /Closed week activity/);
  assert.match(page.text, /Severe/);
  assert.doesNotMatch(page.text, /Draft activity/);

  const grid = await agent.get(`/staff/groups/${group.id}`);
  assert.match(grid.text, /Not submitted/);
  assert.match(grid.text, /In progress/);
});

test('group summary counts submitted weeks and averages their scores', async () => {
  const group = await h.makeGroup('G6', 1);
  const a = await h.makeUser('participant', { groupId: group.id });
  const b = await h.makeUser('participant', { groupId: group.id });
  await h.fillWeek(a.id, 1);
  await tracker.submitWeek(a.id, 1);
  await tracker.saveSlot(b.id, 1, 0, 'morning', { score: 10, activity: 'x', notes: '' });
  const summary = await tracker.groupSummary(group);
  assert.deepStrictEqual(summary[0], { week: 1, submitted: 1, total: 2, average: 5 });
});

test('admin: add people, and delete a participant with all their data', async () => {
  const group = await h.makeGroup('G7', 1);
  const admin = await h.makeUser('admin');
  const { agent, csrf } = await h.signIn(app, admin);

  await agent.post('/admin/people').type('form')
    .send({ _csrf: csrf, role: 'participant', name: 'New Person', email: 'new@test.example', group_id: group.id })
    .expect(302);
  const p = await h.db.one(`SELECT * FROM users WHERE email = 'new@test.example'`);
  assert.match(p.participant_code, /^HV-[A-Z2-9]{5}$/);

  const dup = await agent.post('/admin/people').type('form')
    .send({ _csrf: csrf, role: 'facilitator', name: 'Dup', email: 'NEW@test.example' });
  assert.strictEqual(dup.status, 400);
  assert.match(dup.text, /already has an account/);

  await tracker.saveSlot(p.id, 1, 0, 'morning', { score: 3, activity: 'x', notes: '' });

  const wrong = await agent.post(`/admin/people/${p.id}/delete`).type('form').send({ _csrf: csrf, confirm_code: 'nope' });
  assert.strictEqual(wrong.status, 400);

  await agent.post(`/admin/people/${p.id}/delete`).type('form').send({ _csrf: csrf, confirm_code: p.participant_code.toLowerCase() }).expect(302);
  assert.strictEqual(await h.db.one('SELECT * FROM users WHERE id = $1', [p.id]), null);
  assert.strictEqual((await h.db.one('SELECT count(*)::int AS n FROM tracker_weeks WHERE participant_id = $1', [p.id])).n, 0);
  const log = await h.db.one(`SELECT * FROM audit_log WHERE action = 'delete_participant'`);
  assert.strictEqual(log.subject_label, p.participant_code);
  assert.strictEqual(log.subject_user_id, null);
});

test('admin: Session 1 must be a Thursday', async () => {
  const admin = await h.makeUser('admin');
  const { agent, csrf } = await h.signIn(app, admin);
  const res = await agent.post('/admin/groups').type('form').send({ _csrf: csrf, name: 'X', session1_date: '2026-11-04' });
  assert.strictEqual(res.status, 400);
  assert.match(res.text, /Thursday/);
  await agent.post('/admin/groups').type('form').send({ _csrf: csrf, name: 'Pilot', session1_date: '2026-11-05' }).expect(302);
});

test('turning off an account signs the person out', async () => {
  const group = await h.makeGroup('G8', 1);
  const admin = await h.makeUser('admin');
  const p = await h.makeUser('participant', { groupId: group.id });
  const pa = await h.signIn(app, p);
  const { agent, csrf } = await h.signIn(app, admin);
  await agent.post(`/admin/people/${p.id}`).type('form')
    .send({ _csrf: csrf, name: p.name, email: p.email, group_id: group.id, participant_code: p.participant_code })
    .expect(302);
  await pa.agent.get('/tracker').expect(302);
});
