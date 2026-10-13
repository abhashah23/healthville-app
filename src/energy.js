'use strict';

// Energy Balance Blueprint Worksheet: one sheet per participant for the week
// after Session 2. Lines are added on any of that week's 7 days.
// Daily total = activity points minus replenishing points.

const db = require('./db');
const content = require('./content');
const time = require('./time');
const tracker = require('./tracker');

const EB = content.energyBalance;
const KINDS = Object.keys(EB.kinds);
const LIMITS = { activity: 200, comment: 300 };

function clean(value, max) {
  return String(value == null ? '' : value).replace(/\r\n/g, '\n').trim().slice(0, max);
}

async function getSheet(participantId) {
  const sheet = await db.one('SELECT * FROM energy_sheets WHERE participant_id = $1 AND week_number = $2', [participantId, EB.week]);
  const lines = sheet ? await db.many('SELECT * FROM energy_lines WHERE sheet_id = $1 ORDER BY day_index, kind, id', [sheet.id]) : [];
  return { sheet, lines, days: summariseDays(lines) };
}

async function getOrCreateSheet(participantId) {
  await db.query(
    `INSERT INTO energy_sheets (participant_id, week_number) VALUES ($1, $2)
     ON CONFLICT (participant_id, week_number) DO NOTHING`,
    [participantId, EB.week]
  );
  return db.one('SELECT * FROM energy_sheets WHERE participant_id = $1 AND week_number = $2', [participantId, EB.week]);
}

// Per day: { activity: [lines], replenish: [lines], used, given, total }.
function summariseDays(lines) {
  return Array.from({ length: 7 }, (_, d) => {
    const day = { activity: [], replenish: [], used: 0, given: 0, total: 0 };
    for (const l of lines) {
      if (l.day_index !== d) continue;
      day[l.kind].push(l);
      if (l.kind === 'activity') day.used += l.points;
      else day.given += l.points;
    }
    day.total = day.used - day.given;
    day.count = day.activity.length + day.replenish.length;
    return day;
  });
}

function parseLine(input) {
  const activity = clean(input.activity, LIMITS.activity);
  const points = Number(input.points);
  if (!activity) return { error: 'Please write what the activity was.' };
  if (!Number.isInteger(points) || points < 1 || points > 4) return { error: 'Please choose points from 1 to 4.' };
  return { activity, points, comment: clean(input.comment, LIMITS.comment) };
}

// Returns an error message, or null when saved.
async function addLine(participantId, day, kind, input) {
  if (!(day >= 0 && day <= 6) || !KINDS.includes(kind)) return 'Unknown day or type of activity.';
  const line = parseLine(input);
  if (line.error) return line.error;
  const sheet = await getOrCreateSheet(participantId);
  if (sheet.submitted_at) return 'This worksheet has already been submitted.';
  const count = (await db.one(
    'SELECT count(*)::int AS n FROM energy_lines WHERE sheet_id = $1 AND day_index = $2 AND kind = $3',
    [sheet.id, day, kind]
  )).n;
  if (count >= EB.maxLines[kind]) return 'This day is full. Please remove a line before adding another.';
  await db.query(
    'INSERT INTO energy_lines (sheet_id, day_index, kind, activity, points, comment) VALUES ($1, $2, $3, $4, $5, $6)',
    [sheet.id, day, kind, line.activity, line.points, line.comment]
  );
  await db.query('UPDATE energy_sheets SET updated_at = now() WHERE id = $1', [sheet.id]);
  return null;
}

async function getLine(participantId, lineId) {
  return db.one(
    `SELECT l.*, s.submitted_at FROM energy_lines l JOIN energy_sheets s ON s.id = l.sheet_id
     WHERE l.id = $1 AND s.participant_id = $2`,
    [lineId, participantId]
  );
}

async function updateLine(participantId, lineId, input) {
  const existing = await getLine(participantId, lineId);
  if (!existing) return 'We could not find that line.';
  if (existing.submitted_at) return 'This worksheet has already been submitted.';
  const line = parseLine(input);
  if (line.error) return line.error;
  await db.query('UPDATE energy_lines SET activity = $2, points = $3, comment = $4 WHERE id = $1', [lineId, line.activity, line.points, line.comment]);
  return null;
}

async function deleteLine(participantId, lineId) {
  const existing = await getLine(participantId, lineId);
  if (!existing) return 'We could not find that line.';
  if (existing.submitted_at) return 'This worksheet has already been submitted.';
  await db.query('DELETE FROM energy_lines WHERE id = $1', [lineId]);
  return null;
}

// What is needed before submitting: at least one activity on at least one day.
function readyToSubmit(data) {
  return data.days.some((d) => d.activity.length > 0);
}

async function submit(participantId) {
  const data = await getSheet(participantId);
  if (!data.sheet || !readyToSubmit(data)) return false;
  await db.query('UPDATE energy_sheets SET submitted_at = now() WHERE id = $1 AND submitted_at IS NULL', [data.sheet.id]);
  return true;
}

function state(group, now) {
  return time.weekState(group.session1_date, EB.week, now);
}

function status(group, data, now) {
  return tracker.weekStatus(state(group, now), data.sheet, data.lines.length);
}

// Status for each participant in a group, keyed by participant id.
async function groupStatuses(group, now) {
  const rows = await db.many(
    `SELECT s.*, (SELECT count(*) FROM energy_lines l WHERE l.sheet_id = s.id)::int AS line_count
     FROM energy_sheets s JOIN users u ON u.id = s.participant_id
     WHERE u.group_id = $1 AND s.week_number = $2`,
    [group.id, EB.week]
  );
  const st = state(group, now);
  const byId = new Map(rows.map((r) => [r.participant_id, r]));
  return (participantId) => {
    const r = byId.get(participantId) || null;
    return tracker.weekStatus(st, r, r ? r.line_count : 0);
  };
}

module.exports = {
  KINDS,
  LIMITS,
  getSheet,
  addLine,
  getLine,
  updateLine,
  deleteLine,
  readyToSubmit,
  submit,
  state,
  status,
  groupStatuses,
};
