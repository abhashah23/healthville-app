'use strict';

// Admin only: groups, people, deletion requests and the audit log.

const crypto = require('crypto');
const express = require('express');
const { DateTime } = require('luxon');
const db = require('../db');
const auth = require('../auth');
const audit = require('../audit');
const config = require('../config');

const router = express.Router();
router.use(auth.requireRole('admin'));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function notFound(res) {
  return res.status(404).render('error', { title: 'Page not found', message: 'We could not find that page.' });
}

function newCode() {
  // Easy to read aloud: no 0/O or 1/I.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'HV-';
  for (let i = 0; i < 5; i++) code += chars[crypto.randomInt(chars.length)];
  return code;
}

function checkGroupInput(body) {
  const name = String(body.name || '').trim().slice(0, 100);
  const date = String(body.session1_date || '').trim();
  const dt = DateTime.fromISO(date, { zone: config.sessionTimeZone });
  if (!name) return { error: 'Please give the group a name.' };
  if (!dt.isValid) return { error: 'Please enter the date of Session 1.' };
  if (dt.weekday !== 4) return { error: 'Session 1 must be on a Thursday.' };
  return { name, date };
}

router.get('/', (req, res) => res.render('admin/index', { title: 'Admin' }));

// ---------- Groups ----------

router.get('/groups', async (req, res, next) => {
  try {
    const groups = await db.many('SELECT * FROM groups ORDER BY session1_date DESC, name');
    res.render('admin/groups', { title: 'Groups', groups, error: null, form: {} });
  } catch (err) {
    next(err);
  }
});

router.post('/groups', async (req, res, next) => {
  try {
    const input = checkGroupInput(req.body);
    if (input.error) {
      const groups = await db.many('SELECT * FROM groups ORDER BY session1_date DESC, name');
      return res.status(400).render('admin/groups', { title: 'Groups', groups, error: input.error, form: req.body });
    }
    const group = await db.one('INSERT INTO groups (name, session1_date) VALUES ($1, $2) RETURNING *', [input.name, input.date]);
    await audit.record(req.user, 'create_group', { groupId: group.id, details: group.name });
    res.redirect(`/admin/groups/${group.id}`);
  } catch (err) {
    next(err);
  }
});

async function renderGroupEdit(res, group, error, status = 200) {
  const facilitators = await db.many(
    `SELECT u.id, u.name, u.email, gf.user_id IS NOT NULL AS assigned
     FROM users u LEFT JOIN group_facilitators gf ON gf.user_id = u.id AND gf.group_id = $1
     WHERE u.role = 'facilitator' AND u.active ORDER BY u.name`,
    [group.id]
  );
  res.status(status).render('admin/group-edit', { title: `Edit ${group.name}`, group, facilitators, error });
}

router.get('/groups/:id', async (req, res, next) => {
  try {
    const group = await db.one('SELECT * FROM groups WHERE id = $1', [Number(req.params.id) || 0]);
    if (!group) return notFound(res);
    await renderGroupEdit(res, group, null);
  } catch (err) {
    next(err);
  }
});

router.post('/groups/:id', async (req, res, next) => {
  try {
    const group = await db.one('SELECT * FROM groups WHERE id = $1', [Number(req.params.id) || 0]);
    if (!group) return notFound(res);
    const input = checkGroupInput(req.body);
    if (input.error) return renderGroupEdit(res, { ...group, ...req.body, id: group.id }, input.error, 400);
    const chosen = [].concat(req.body.facilitators || []).map(Number).filter(Number.isInteger);
    await db.transaction(async (c) => {
      await c.query('UPDATE groups SET name = $2, session1_date = $3 WHERE id = $1', [group.id, input.name, input.date]);
      await c.query('DELETE FROM group_facilitators WHERE group_id = $1', [group.id]);
      if (chosen.length) {
        await c.query(
          `INSERT INTO group_facilitators (group_id, user_id)
           SELECT $1, id FROM users WHERE id = ANY($2::int[]) AND role = 'facilitator'`,
          [group.id, chosen]
        );
      }
    });
    await audit.record(req.user, 'update_group', { groupId: group.id, details: `facilitators: ${chosen.join(', ') || 'none'}` });
    res.redirect('/admin/groups');
  } catch (err) {
    next(err);
  }
});

// ---------- People ----------

router.get('/people', async (req, res, next) => {
  try {
    const people = await db.many(
      `SELECT u.*, g.name AS group_name FROM users u LEFT JOIN groups g ON g.id = u.group_id
       ORDER BY u.active DESC, u.role, u.name`
    );
    res.render('admin/people', { title: 'People', people, deleted: req.query.deleted || null });
  } catch (err) {
    next(err);
  }
});

async function renderPersonForm(res, person, error, status = 200) {
  const groups = await db.many('SELECT * FROM groups ORDER BY session1_date DESC, name');
  res.status(status).render('admin/person-form', {
    title: person.id ? `Edit ${person.name}` : 'Add a person',
    person,
    groups,
    error,
  });
}

router.get('/people/new', async (req, res, next) => {
  try {
    const role = ['participant', 'facilitator', 'admin'].includes(req.query.role) ? req.query.role : 'participant';
    await renderPersonForm(res, { role, name: '', email: '', participant_code: '', group_id: null, active: true }, null);
  } catch (err) {
    next(err);
  }
});

function checkPersonInput(body, existing) {
  const person = {
    id: existing ? existing.id : null,
    role: existing ? existing.role : body.role,
    name: String(body.name || '').trim().slice(0, 100),
    email: String(body.email || '').trim().toLowerCase().slice(0, 254),
    participant_code: String(body.participant_code || '').trim().toUpperCase().slice(0, 20),
    group_id: Number(body.group_id) || null,
    active: existing ? body.active === 'on' : true,
  };
  if (!['participant', 'facilitator', 'admin'].includes(person.role)) return { person, error: 'Please choose a role.' };
  if (!person.name) return { person, error: 'Please enter a name.' };
  if (!EMAIL_RE.test(person.email)) return { person, error: 'Please enter a valid email address.' };
  if (person.role === 'participant') {
    if (!person.group_id) return { person, error: 'Please choose a group for this participant.' };
    if (person.participant_code && !/^[A-Z0-9-]{3,20}$/.test(person.participant_code)) {
      return { person, error: 'Participant codes can use letters, numbers and dashes only.' };
    }
  } else {
    person.participant_code = null;
    person.group_id = null;
  }
  return { person, error: null };
}

function duplicateMessage(err) {
  if (err.code !== '23505') return null;
  return err.constraint === 'users_code_unique'
    ? 'That participant code is already in use.'
    : 'Someone with that email address already has an account.';
}

router.post('/people', async (req, res, next) => {
  try {
    const { person, error } = checkPersonInput(req.body, null);
    if (error) return renderPersonForm(res, person, error, 400);
    if (person.role === 'participant' && !person.participant_code) person.participant_code = newCode();
    let created;
    try {
      created = await db.one(
        `INSERT INTO users (email, name, role, participant_code, group_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [person.email, person.name, person.role, person.participant_code, person.group_id]
      );
    } catch (err) {
      const msg = duplicateMessage(err);
      if (msg) return renderPersonForm(res, person, msg, 400);
      throw err;
    }
    await audit.record(req.user, 'create_person', { subject: created, groupId: created.group_id, details: created.role });
    res.redirect('/admin/people');
  } catch (err) {
    next(err);
  }
});

router.get('/people/:id', async (req, res, next) => {
  try {
    const person = await db.one('SELECT * FROM users WHERE id = $1', [Number(req.params.id) || 0]);
    if (!person) return notFound(res);
    await renderPersonForm(res, person, null);
  } catch (err) {
    next(err);
  }
});

router.post('/people/:id', async (req, res, next) => {
  try {
    const existing = await db.one('SELECT * FROM users WHERE id = $1', [Number(req.params.id) || 0]);
    if (!existing) return notFound(res);
    const { person, error } = checkPersonInput(req.body, existing);
    if (error) return renderPersonForm(res, person, error, 400);
    if (existing.id === req.user.id && !person.active) {
      return renderPersonForm(res, person, 'You cannot turn off your own account.', 400);
    }
    if (person.role === 'participant' && !person.participant_code) person.participant_code = existing.participant_code;
    try {
      await db.query(
        `UPDATE users SET name = $2, email = $3, participant_code = $4, group_id = $5, active = $6 WHERE id = $1`,
        [existing.id, person.name, person.email, person.participant_code, person.group_id, person.active]
      );
    } catch (err) {
      const msg = duplicateMessage(err);
      if (msg) return renderPersonForm(res, person, msg, 400);
      throw err;
    }
    if (!person.active) await db.query('DELETE FROM sessions WHERE user_id = $1', [existing.id]);
    await audit.record(req.user, 'update_person', { subject: existing, groupId: person.group_id });
    res.redirect('/admin/people');
  } catch (err) {
    next(err);
  }
});

// Deletes a participant and everything they entered, on request. The audit
// log keeps a record that the deletion happened, under their code only.
router.post('/people/:id/delete', async (req, res, next) => {
  try {
    const person = await db.one(`SELECT * FROM users WHERE id = $1 AND role = 'participant'`, [Number(req.params.id) || 0]);
    if (!person) return notFound(res);
    if (String(req.body.confirm_code || '').trim().toUpperCase() !== person.participant_code) {
      return renderPersonForm(res, person, 'To delete, type the participant code exactly as shown.', 400);
    }
    await audit.record(req.user, 'delete_participant', { subject: person, groupId: person.group_id });
    await db.transaction(async (c) => {
      // Entries, weeks, sign-in links and sessions are removed with the person.
      await c.query('DELETE FROM users WHERE id = $1', [person.id]);
    });
    res.redirect(`/admin/people?deleted=${encodeURIComponent(person.participant_code)}`);
  } catch (err) {
    next(err);
  }
});

// ---------- Audit log ----------

router.get('/audit', async (req, res, next) => {
  try {
    const entries = await db.many(
      `SELECT a.*, g.name AS group_name FROM audit_log a LEFT JOIN groups g ON g.id = a.group_id
       ORDER BY a.at DESC LIMIT 300`
    );
    res.render('admin/audit', { title: 'Audit log', entries });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
