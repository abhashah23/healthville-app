'use strict';

// Weekly Fatigue and Energy Tracker: reading, saving and summarising entries.

const db = require('./db');
const config = require('./config');
const content = require('./content');
const time = require('./time');

const TIMES = content.tracker.timesOfDay.map((t) => t.key);
const REFLECTIONS = content.tracker.reflections.map((r) => r.key);
const LIMITS = { activity: 200, notes: 500, reflection: 1000 };
const SLOTS_PER_WEEK = 7 * TIMES.length;

function clean(value, max) {
  return String(value == null ? '' : value).replace(/\r\n/g, '\n').trim().slice(0, max);
}

function parseScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : undefined;
}

async function getWeekRow(participantId, n) {
  return db.one('SELECT * FROM tracker_weeks WHERE participant_id = $1 AND week_number = $2', [participantId, n]);
}

async function getOrCreateWeekRow(participantId, n) {
  await db.query(
    `INSERT INTO tracker_weeks (participant_id, week_number) VALUES ($1, $2)
     ON CONFLICT (participant_id, week_number) DO NOTHING`,
    [participantId, n]
  );
  return getWeekRow(participantId, n);
}

// The full week: { row, entries: { 'day-time': entry } }. row may be null.
async function getWeek(participantId, n) {
  const row = await getWeekRow(participantId, n);
  const entries = {};
  if (row) {
    const list = await db.many('SELECT * FROM tracker_entries WHERE week_id = $1', [row.id]);
    for (const e of list) entries[`${e.day_index}-${e.time_of_day}`] = e;
  }
  return { row, entries };
}

function slotComplete(entry) {
  return Boolean(entry) && entry.score !== null && entry.activity.trim() !== '';
}

function slotStarted(entry) {
  return Boolean(entry) && (entry.score !== null || entry.activity !== '' || entry.notes !== '');
}

// What still needs filling in before the week can be submitted.
function missingItems(week) {
  const missing = [];
  for (let d = 0; d < 7; d++) {
    for (const t of TIMES) {
      const e = week.entries[`${d}-${t}`];
      const parts = [];
      if (!e || e.score === null) parts.push('score');
      if (!e || e.activity.trim() === '') parts.push('activity');
      if (parts.length) missing.push({ kind: 'slot', day: d, time: t, parts });
    }
  }
  for (const key of REFLECTIONS) {
    if (!week.row || week.row[key].trim() === '') missing.push({ kind: 'reflection', key });
  }
  return missing;
}

function completedSlots(week) {
  return Object.values(week.entries).filter(slotComplete).length;
}

// Saves one time slot. Returns an error message, or null when saved.
async function saveSlot(participantId, n, day, timeOfDay, input) {
  if (!(day >= 0 && day <= 6) || !TIMES.includes(timeOfDay)) return 'Unknown day or time.';
  const score = parseScore(input.score);
  if (score === undefined) return 'Please choose a score from 0 to 10.';
  const row = await getOrCreateWeekRow(participantId, n);
  if (row.submitted_at) return 'This week has already been submitted.';
  await db.query(
    `INSERT INTO tracker_entries (week_id, day_index, time_of_day, score, activity, notes, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (week_id, day_index, time_of_day)
     DO UPDATE SET score = EXCLUDED.score, activity = EXCLUDED.activity,
                   notes = EXCLUDED.notes, updated_at = now()`,
    [row.id, day, timeOfDay, score, clean(input.activity, LIMITS.activity), clean(input.notes, LIMITS.notes)]
  );
  await db.query('UPDATE tracker_weeks SET updated_at = now() WHERE id = $1', [row.id]);
  return null;
}

async function saveReflections(participantId, n, input) {
  const row = await getOrCreateWeekRow(participantId, n);
  if (row.submitted_at) return 'This week has already been submitted.';
  await db.query(
    `UPDATE tracker_weeks SET reflection_most_fatigued = $2, reflection_biggest_impact = $3,
       reflection_one_change = $4, updated_at = now() WHERE id = $1`,
    [row.id, ...REFLECTIONS.map((k) => clean(input[k], LIMITS.reflection))]
  );
  return null;
}

// The Fatigue Screening session that is part of week n, if any.
function screeningSession(n) {
  const entry = Object.entries(content.screening.inWeek).find(([, week]) => week === n);
  return entry ? Number(entry[0]) : null;
}

// Everything still needed before week n can be submitted, including the
// Fatigue Screening when it is part of that week.
async function missingForSubmit(participantId, n, week) {
  const missing = missingItems(week);
  const s = screeningSession(n);
  if (s) {
    const screening = require('./screening');
    const row = await screening.get(participantId, s);
    for (const key of screening.missing(row)) missing.unshift({ kind: 'screening', session: s, key });
  }
  return missing;
}

// Submits the week if everything is filled in. Returns missing items, or [].
// When the week includes the Fatigue Screening, both are submitted together.
async function submitWeek(participantId, n) {
  const week = await getWeek(participantId, n);
  if (week.row && week.row.submitted_at) return [];
  const missing = await missingForSubmit(participantId, n, week);
  if (missing.length) return missing;
  const s = screeningSession(n);
  await db.transaction(async (c) => {
    await c.query('UPDATE tracker_weeks SET submitted_at = now() WHERE id = $1 AND submitted_at IS NULL', [week.row.id]);
    if (s) {
      await c.query(
        'UPDATE fatigue_screenings SET submitted_at = now() WHERE participant_id = $1 AND session_number = $2 AND submitted_at IS NULL',
        [participantId, s]
      );
    }
  });
  return [];
}

// Status of week N for one participant, as shown to staff and participants.
// 'upcoming', 'not_started', 'in_progress', 'submitted' or 'not_submitted'.
function weekStatus(state, row, startedCount) {
  if (row && row.submitted_at) return 'submitted';
  if (state === 'upcoming') return 'upcoming';
  if (state === 'closed') return 'not_submitted';
  return startedCount > 0 || (row && REFLECTIONS.some((k) => row[k] !== '')) ? 'in_progress' : 'not_started';
}

const STATUS_LABELS = {
  upcoming: 'Not open yet',
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
  not_submitted: 'Not submitted',
};

// Statuses for weeks 1 to 6 for every participant in a group.
async function groupGrid(group, now) {
  const participants = await db.many(
    `SELECT id, name, participant_code FROM users
     WHERE role = 'participant' AND group_id = $1 AND active ORDER BY name`,
    [group.id]
  );
  const rows = await db.many(
    `SELECT w.*, (SELECT count(*) FROM tracker_entries e WHERE e.week_id = w.id
       AND (e.score IS NOT NULL OR e.activity <> '' OR e.notes <> ''))::int AS started
     FROM tracker_weeks w JOIN users u ON u.id = w.participant_id
     WHERE u.group_id = $1`,
    [group.id]
  );
  const byKey = new Map(rows.map((r) => [`${r.participant_id}-${r.week_number}`, r]));
  return participants.map((p) => ({
    ...p,
    weeks: Array.from({ length: config.weeks }, (_, i) => {
      const n = i + 1;
      const row = byKey.get(`${p.id}-${n}`) || null;
      return weekStatus(time.weekState(group.session1_date, n, now), row, row ? row.started : 0);
    }),
  }));
}

// Per week: how many submitted, and the average score across submitted weeks.
async function groupSummary(group) {
  const rows = await db.many(
    `SELECT w.week_number,
            count(DISTINCT w.id)::int AS submitted,
            avg(e.score)::float AS average
     FROM tracker_weeks w
     JOIN users u ON u.id = w.participant_id AND u.active
     LEFT JOIN tracker_entries e ON e.week_id = w.id
     WHERE u.group_id = $1 AND w.submitted_at IS NOT NULL
     GROUP BY w.week_number`,
    [group.id]
  );
  const total = (await db.one(
    `SELECT count(*)::int AS n FROM users WHERE role = 'participant' AND group_id = $1 AND active`,
    [group.id]
  )).n;
  return Array.from({ length: config.weeks }, (_, i) => {
    const r = rows.find((x) => x.week_number === i + 1);
    return { week: i + 1, submitted: r ? r.submitted : 0, total, average: r ? r.average : null };
  });
}

// Weekly averages for one participant, overall and by time of day.
// Only submitted weeks are counted.
async function participantAverages(participantId) {
  const rows = await db.many(
    `SELECT w.week_number, e.time_of_day, avg(e.score)::float AS average
     FROM tracker_weeks w JOIN tracker_entries e ON e.week_id = w.id
     WHERE w.participant_id = $1 AND w.submitted_at IS NOT NULL
     GROUP BY GROUPING SETS ((w.week_number), (w.week_number, e.time_of_day))`,
    [participantId]
  );
  return Array.from({ length: config.weeks }, (_, i) => {
    const n = i + 1;
    const pick = (t) => {
      const r = rows.find((x) => x.week_number === n && x.time_of_day === t);
      return r ? r.average : null;
    };
    return {
      week: n,
      overall: pick(null),
      morning: pick('morning'),
      afternoon: pick('afternoon'),
      evening: pick('evening'),
    };
  });
}

module.exports = {
  TIMES,
  REFLECTIONS,
  LIMITS,
  SLOTS_PER_WEEK,
  STATUS_LABELS,
  getWeek,
  getOrCreateWeekRow,
  slotComplete,
  slotStarted,
  missingItems,
  completedSlots,
  saveSlot,
  saveReflections,
  submitWeek,
  missingForSubmit,
  screeningSession,
  weekStatus,
  groupGrid,
  groupSummary,
  participantAverages,
};
