'use strict';

// Spoon Tracker: "Today's Spoons" from the My Spoons handout. 12 spoons a
// day; participants tap a spoon to cross it off (tap again to undo). It is
// open for the week that starts on the day of Session 2. There is nothing
// to submit; staff see the days as they are filled in.

const db = require('./db');
const content = require('./content');
const time = require('./time');

const SP = content.spoons;
const ALL = (1 << SP.perDay) - 1;

function countCrossed(mask) {
  let n = 0;
  for (let i = 0; i < SP.perDay; i++) if (mask & (1 << i)) n++;
  return n;
}

function isCrossed(mask, i) {
  return Boolean(mask & (1 << i));
}

function state(group, now) {
  return time.weekState(group.session1_date, SP.week, now);
}

function dates(group) {
  return time.weekDays(group.session1_date, SP.week);
}

// Which day of the spoon week a 'YYYY-MM-DD' date is, or null.
function dayIndexFor(group, isoDate) {
  const i = dates(group).findIndex((d) => d.toISODate() === isoDate);
  return i === -1 ? null : i;
}

// Today in Eastern Time, as a day of the spoon week (or null).
function todayIndex(group, now = require('luxon').DateTime.now()) {
  return dayIndexFor(group, now.setZone(content.timeZone || 'America/Toronto').toISODate());
}

// days[d] is the crossed-off mask for that day, or null if never opened.
async function getDays(participantId) {
  const sheet = await db.one('SELECT * FROM spoon_sheets WHERE participant_id = $1 AND week_number = $2', [participantId, SP.week]);
  const rows = sheet ? await db.many('SELECT * FROM spoon_days WHERE sheet_id = $1', [sheet.id]) : [];
  return Array.from({ length: 7 }, (_, d) => {
    const r = rows.find((x) => x.day_index === d);
    return r ? r.crossed : null;
  });
}

// Crosses off spoon i on day d, or puts it back if it was crossed off.
// Returns { error } or { crossed }.
async function toggle(participantId, day, spoon) {
  if (!(Number.isInteger(day) && day >= 0 && day <= 6)) return { error: 'Unknown day.' };
  if (!(Number.isInteger(spoon) && spoon >= 0 && spoon < SP.perDay)) return { error: 'Unknown spoon.' };
  await db.query(
    `INSERT INTO spoon_sheets (participant_id, week_number) VALUES ($1, $2)
     ON CONFLICT (participant_id, week_number) DO NOTHING`,
    [participantId, SP.week]
  );
  const sheet = await db.one('SELECT id FROM spoon_sheets WHERE participant_id = $1 AND week_number = $2', [participantId, SP.week]);
  const row = await db.one(
    `INSERT INTO spoon_days (sheet_id, day_index, crossed) VALUES ($1, $2, $3)
     ON CONFLICT (sheet_id, day_index)
     DO UPDATE SET crossed = (spoon_days.crossed # $3) & ${ALL}, updated_at = now()
     RETURNING crossed`,
    [sheet.id, day, 1 << spoon]
  );
  await db.query('UPDATE spoon_sheets SET updated_at = now() WHERE id = $1', [sheet.id]);
  return { crossed: row.crossed };
}

// Number of days with spoons recorded, per participant in a group.
async function groupDayCounts(group) {
  const rows = await db.many(
    `SELECT s.participant_id, count(d.*)::int AS days
     FROM spoon_sheets s JOIN users u ON u.id = s.participant_id
     LEFT JOIN spoon_days d ON d.sheet_id = s.id
     WHERE u.group_id = $1 AND s.week_number = $2
     GROUP BY s.participant_id`,
    [group.id, SP.week]
  );
  const byId = new Map(rows.map((r) => [r.participant_id, r.days]));
  return (participantId) => byId.get(participantId) || 0;
}

module.exports = { countCrossed, isCrossed, state, dates, dayIndexFor, todayIndex, getDays, toggle, groupDayCounts };
