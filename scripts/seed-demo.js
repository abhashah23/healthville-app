'use strict';

// Fills a development database with made-up people and entries so the app
// can be tried out. Never run this against the real database: it refuses
// when NODE_ENV is "production".
//
// Creates one group whose Week 3 is open today, so every status shows up.

const { DateTime } = require('luxon');
const config = require('../src/config');
const db = require('../src/db');
const migrate = require('./migrate');

const ACTIVITIES = ['Short walk', 'Groceries', 'Resting on the couch', 'Video call with family', 'Cooking dinner', 'Appointment', 'Reading', 'Laundry', 'Gardening', 'Nap'];

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

async function main() {
  if (config.isProduction) throw new Error('Refusing to add demo data in production.');
  await migrate();

  // Session 1 was the Thursday two weeks before the most recent Thursday.
  const today = DateTime.now().setZone(config.sessionTimeZone);
  const lastThursday = today.minus({ days: (today.weekday - 4 + 7) % 7 }).startOf('day');
  const session1 = lastThursday.minus({ weeks: 2 }).toISODate();

  await db.query(`DELETE FROM users WHERE email LIKE '%@demo.healthville.test'`);
  await db.query(`DELETE FROM groups WHERE name LIKE 'Demo group%'`);

  const group = await db.one(`INSERT INTO groups (name, session1_date) VALUES ('Demo group A', $1) RETURNING *`, [session1]);
  const other = await db.one(`INSERT INTO groups (name, session1_date) VALUES ('Demo group B', $1) RETURNING *`, [session1]);

  const admin = await db.one(`INSERT INTO users (name, email, role) VALUES ('Demo Admin', 'admin@demo.healthville.test', 'admin') RETURNING *`);
  const fac = await db.one(`INSERT INTO users (name, email, role) VALUES ('Demo Facilitator', 'facilitator@demo.healthville.test', 'facilitator') RETURNING *`);
  const facB = await db.one(`INSERT INTO users (name, email, role) VALUES ('Other Facilitator', 'facilitator2@demo.healthville.test', 'facilitator') RETURNING *`);
  await db.query('INSERT INTO group_facilitators (group_id, user_id) VALUES ($1, $2), ($3, $4)', [group.id, fac.id, other.id, facB.id]);

  const names = ['Alex Morgan', 'Sam Lee', 'Priya Patel', 'Jordan Smith', 'Maria Santos'];
  const rand = seededRandom(7);
  for (let i = 0; i < names.length; i++) {
    const email = i === 0 ? 'participant@demo.healthville.test' : `p${i}@demo.healthville.test`;
    const p = await db.one(
      `INSERT INTO users (name, email, role, participant_code, group_id) VALUES ($1, $2, 'participant', $3, $4) RETURNING *`,
      [names[i], email, `HV-DEMO${i + 1}`, group.id]
    );
    // Weeks 1 and 2 are closed. Week 3 is open. Participant 0 has only part of week 3.
    for (let n = 1; n <= 3; n++) {
      if (n === 3 && i > 1) continue;
      const submit = n < 3 && !(i === 4 && n === 2);
      const week = await db.one(
        `INSERT INTO tracker_weeks (participant_id, week_number, reflection_most_fatigued, reflection_biggest_impact, reflection_one_change, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [p.id, n, submit ? 'Afternoons after errands' : '', submit ? 'Walking in the morning' : '', submit ? 'Rest before I go out' : '', submit ? new Date() : null]
      );
      const slots = n === 3 ? 8 : 21;
      let k = 0;
      for (let d = 0; d < 7; d++) {
        for (const t of ['morning', 'afternoon', 'evening']) {
          if (k++ >= slots) break;
          const base = t === 'afternoon' ? 6 : t === 'evening' ? 5 : 3;
          const score = Math.max(0, Math.min(10, Math.round(base - (n - 1) * 0.6 + (rand() * 4 - 2))));
          await db.query(
            `INSERT INTO tracker_entries (week_id, day_index, time_of_day, score, activity, notes) VALUES ($1, $2, $3, $4, $5, $6)`,
            [week.id, d, t, score, ACTIVITIES[Math.floor(rand() * ACTIVITIES.length)], rand() > 0.8 ? 'Slept badly the night before' : '']
          );
        }
      }
    }
  }
  const all = await db.many(`SELECT id FROM users WHERE group_id = $1 AND role = 'participant' ORDER BY id`, [group.id]);
  // Weekly questions for the submitted weeks.
  await db.query(
    `UPDATE tracker_weeks w SET tired_score = 5 + (w.participant_id % 3), severity = (ARRAY['moderate','severe','mild'])[1 + w.participant_id % 3],
       pattern = 'Worst in the late afternoon. Better after a short rest. Busy days make it worse. It stops me gardening, seeing friends and cooking.'
     FROM users u WHERE u.id = w.participant_id AND u.group_id = $1 AND w.submitted_at IS NOT NULL`,
    [group.id]
  );

  // Spoon Tracker (opens on the day of Session 2) for the first four people.
  for (const person of all.slice(0, 4)) {
    const sheet = await db.one(`INSERT INTO spoon_sheets (participant_id, week_number) VALUES ($1, 2) RETURNING *`, [person.id]);
    for (const [d, crossed] of [[0, 511], [1, 2047], [3, 127], [5, 4095]]) {
      await db.query('INSERT INTO spoon_days (sheet_id, day_index, crossed) VALUES ($1, $2, $3)', [sheet.id, d, crossed]);
    }
  }

  // Energy Balance Blueprint (opens on the day of Session 3) for the first three people.
  for (const person of all.slice(0, 3)) {
    const sheet = await db.one(
      `INSERT INTO energy_sheets (participant_id, week_number, submitted_at) VALUES ($1, 3, $2) RETURNING *`,
      [person.id, null]
    );
    for (const d of [0, 2, 5]) {
      for (const [kind, activity, points, comment] of [
        ['activity', 'Shower and get dressed', 2, ''],
        ['activity', 'Groceries', 3, 'Busy store'],
        ['activity', 'Cooking dinner', 2, ''],
        ['replenish', 'Nap', 3, ''],
        ['replenish', 'Sat in the garden', 1, 'Felt calmer'],
      ]) {
        await db.query(
          'INSERT INTO energy_lines (sheet_id, day_index, kind, activity, points, comment) VALUES ($1, $2, $3, $4, $5, $6)',
          [sheet.id, d, kind, activity, points, comment]
        );
      }
    }
  }

  console.log(`Demo data ready. Session 1 for the demo groups: ${session1}.`);
  console.log('Sign in with any of these (the link prints in the server log):');
  console.log(`  participant@demo.healthville.test  (participant)`);
  console.log(`  ${fac.email}  (facilitator, Demo group A only)`);
  console.log(`  ${admin.email}  (admin)`);
  await db.pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
