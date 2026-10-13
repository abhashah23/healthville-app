'use strict';

// Fatigue Screening: one short form before Session 1 and one before Session 6.
//
// Each opens at the start of the day one week before its session and closes
// when the session starts (Thursday 1:00 PM ET). Same rules as the trackers:
// submit once, no changes after, staff see it once submitted or closed.

const db = require('./db');
const content = require('./content');
const time = require('./time');
const tracker = require('./tracker');

const S = content.screening;
const SEVERITIES = S.severityOptions.map((o) => o.key);
const LIMITS = { pattern: 2000 };

function opens(group, session) {
  return time.sessionDay(group.session1_date, session - 1);
}

function closes(group, session) {
  return time.sessionStart(group.session1_date, session);
}

function state(group, session, now = require('luxon').DateTime.now()) {
  if (now < opens(group, session)) return 'upcoming';
  if (now < closes(group, session)) return 'open';
  return 'closed';
}

async function get(participantId, session) {
  return db.one('SELECT * FROM fatigue_screenings WHERE participant_id = $1 AND session_number = $2', [participantId, session]);
}

function started(row) {
  return Boolean(row) && (row.tired_score !== null || row.severity !== null || row.pattern !== '');
}

function status(group, session, row, now) {
  return tracker.weekStatus(state(group, session, now), row, started(row) ? 1 : 0);
}

function missing(row) {
  const list = [];
  if (!row || row.tired_score === null) list.push('tired');
  if (!row || row.severity === null) list.push('severity');
  if (!row || row.pattern.trim() === '') list.push('pattern');
  return list;
}

// Saves whatever has been filled in so far. Returns an error, or null.
async function save(participantId, session, input) {
  if (!S.sessions.includes(session)) return 'Unknown screening.';
  let tired = null;
  if (input.tired_score !== undefined && input.tired_score !== null && input.tired_score !== '') {
    tired = Number(input.tired_score);
    if (!Number.isInteger(tired) || tired < 1 || tired > 10) return 'Please choose a number from 1 to 10.';
  }
  let severity = null;
  if (input.severity) {
    if (!SEVERITIES.includes(input.severity)) return 'Please choose a severity level.';
    severity = input.severity;
  }
  const pattern = String(input.pattern || '').replace(/\r\n/g, '\n').trim().slice(0, LIMITS.pattern);
  const existing = await get(participantId, session);
  if (existing && existing.submitted_at) return 'This has already been submitted.';
  await db.query(
    `INSERT INTO fatigue_screenings (participant_id, session_number, tired_score, severity, pattern)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (participant_id, session_number)
     DO UPDATE SET tired_score = EXCLUDED.tired_score, severity = EXCLUDED.severity,
                   pattern = EXCLUDED.pattern, updated_at = now()`,
    [participantId, session, tired, severity, pattern]
  );
  return null;
}

// Submits if complete. Returns the list of missing fields ([] when submitted).
async function submit(participantId, session) {
  const row = await get(participantId, session);
  const gaps = missing(row);
  if (gaps.length) return gaps;
  await db.query('UPDATE fatigue_screenings SET submitted_at = now() WHERE id = $1 AND submitted_at IS NULL', [row.id]);
  return [];
}

// Status for each participant in a group: (participantId, session) => status.
async function groupStatuses(group, now) {
  const rows = await db.many(
    `SELECT f.* FROM fatigue_screenings f JOIN users u ON u.id = f.participant_id WHERE u.group_id = $1`,
    [group.id]
  );
  const byKey = new Map(rows.map((r) => [`${r.participant_id}-${r.session_number}`, r]));
  return (participantId, session) => status(group, session, byKey.get(`${participantId}-${session}`) || null, now);
}

function severityLabel(key) {
  const o = S.severityOptions.find((x) => x.key === key);
  return o ? o.label : '';
}

module.exports = { SESSIONS: S.sessions, LIMITS, opens, closes, state, get, status, missing, save, submit, groupStatuses, severityLabel };
