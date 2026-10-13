'use strict';

// Daily Spoon Tracker: 12 spoons a day, crossed off one at a time, on any
// days of the week after Session 2. Same rules as the other trackers: submit
// once, no changes after, closes at the next session, staff see it once
// submitted or closed.

const db = require('./db');
const content = require('./content');
const time = require('./time');
const tracker = require('./tracker');

const SP = content.spoons;

async function getSheet(participantId) {
  const sheet = await db.one('SELECT * FROM spoon_sheets WHERE participant_id = $1 AND week_number = $2', [participantId, SP.week]);
  const rows = sheet ? await db.many('SELECT * FROM spoon_days WHERE sheet_id = $1', [sheet.id]) : [];
  // days[d] is the number of spoons crossed off, or null if the day was not used.
  const days = Array.from({ length: 7 }, (_, d) => {
    const r = rows.find((x) => x.day_index === d);
    return r ? r.used : null;
  });
  return { sheet, days, daysUsed: days.filter((d) => d !== null).length };
}

// Sets the number of spoons crossed off for a day. Returns an error, or null.
async function setUsed(participantId, day, used) {
  if (!(Number.isInteger(day) && day >= 0 && day <= 6)) return 'Unknown day.';
  if (!(Number.isInteger(used) && used >= 0 && used <= SP.perDay)) return `Please choose from 0 to ${SP.perDay} spoons.`;
  await db.query(
    `INSERT INTO spoon_sheets (participant_id, week_number) VALUES ($1, $2)
     ON CONFLICT (participant_id, week_number) DO NOTHING`,
    [participantId, SP.week]
  );
  const sheet = await db.one('SELECT * FROM spoon_sheets WHERE participant_id = $1 AND week_number = $2', [participantId, SP.week]);
  if (sheet.submitted_at) return 'This has already been submitted.';
  await db.query(
    `INSERT INTO spoon_days (sheet_id, day_index, used) VALUES ($1, $2, $3)
     ON CONFLICT (sheet_id, day_index) DO UPDATE SET used = EXCLUDED.used, updated_at = now()`,
    [sheet.id, day, used]
  );
  await db.query('UPDATE spoon_sheets SET updated_at = now() WHERE id = $1', [sheet.id]);
  return null;
}

function readyToSubmit(data) {
  return data.daysUsed > 0;
}

async function submit(participantId) {
  const data = await getSheet(participantId);
  if (!data.sheet || !readyToSubmit(data)) return false;
  await db.query('UPDATE spoon_sheets SET submitted_at = now() WHERE id = $1 AND submitted_at IS NULL', [data.sheet.id]);
  return true;
}

function state(group, now) {
  return time.weekState(group.session1_date, SP.week, now);
}

function status(group, data, now) {
  return tracker.weekStatus(state(group, now), data.sheet, data.daysUsed);
}

async function groupStatuses(group, now) {
  const rows = await db.many(
    `SELECT s.*, (SELECT count(*) FROM spoon_days d WHERE d.sheet_id = s.id)::int AS day_count
     FROM spoon_sheets s JOIN users u ON u.id = s.participant_id
     WHERE u.group_id = $1 AND s.week_number = $2`,
    [group.id, SP.week]
  );
  const st = state(group, now);
  const byId = new Map(rows.map((r) => [r.participant_id, r]));
  return (participantId) => {
    const r = byId.get(participantId) || null;
    return tracker.weekStatus(st, r, r ? r.day_count : 0);
  };
}

module.exports = { getSheet, setUsed, readyToSubmit, submit, state, status, groupStatuses };
