'use strict';

// Views for facilitators (their own groups) and admins (all groups).

const express = require('express');
const db = require('../db');
const auth = require('../auth');
const audit = require('../audit');
const access = require('../access');
const config = require('../config');
const time = require('../time');
const tracker = require('../tracker');
const { lineChart } = require('../chart');
const energy = require('../energy');

const router = express.Router();
router.use(auth.requireRole('facilitator', 'admin'));

function notFound(res) {
  // Same answer for "does not exist" and "not yours", so staff cannot probe
  // for other groups' participants.
  return res.status(404).render('error', { title: 'Page not found', message: 'We could not find that page, or it is not part of your groups.' });
}

router.get('/', async (req, res, next) => {
  try {
    const groups = await access.visibleGroups(req.user);
    const counts = await db.many(
      `SELECT group_id, count(*)::int AS n FROM users WHERE role = 'participant' AND active GROUP BY group_id`
    );
    res.render('staff/groups', {
      title: req.user.role === 'admin' ? 'All groups' : 'My groups',
      groups: groups.map((g) => ({ ...g, participants: (counts.find((c) => c.group_id === g.id) || { n: 0 }).n })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/groups/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return notFound(res);
    const group = await db.one('SELECT * FROM groups WHERE id = $1', [id]);
    if (!group || !(await access.canSeeGroup(req.user, id))) return notFound(res);
    const ebStatusFor = await energy.groupStatuses(group);
    const grid = (await tracker.groupGrid(group)).map((p) => ({ ...p, eb: ebStatusFor(p.id) }));
    const summary = await tracker.groupSummary(group);
    const ebSubmitted = grid.filter((p) => p.eb === 'submitted').length;
    await audit.record(req.user, 'view_group', { groupId: group.id });
    res.render('staff/group', {
      title: group.name,
      group,
      grid,
      summary,
      ebSubmitted,
      chart: summary.some((s) => s.average !== null)
        ? lineChart(summary.map((s) => ({ week: s.week, overall: s.average })), { title: 'Group average fatigue score by week (submitted weeks only)', series: ['overall'] })
        : null,
      weekNumbers: Array.from({ length: config.weeks }, (_, i) => i + 1),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/participants/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return notFound(res);
    const participant = await db.one(
      `SELECT * FROM users WHERE id = $1 AND role = 'participant'`,
      [id]
    );
    if (!participant || !(await access.canSeeGroup(req.user, participant.group_id))) return notFound(res);
    const group = await db.one('SELECT * FROM groups WHERE id = $1', [participant.group_id]);

    const weeks = [];
    for (let n = 1; n <= config.weeks; n++) {
      const state = time.weekState(group.session1_date, n);
      const week = await tracker.getWeek(participant.id, n);
      const started = Object.values(week.entries).filter(tracker.slotStarted).length;
      weeks.push({
        n,
        state,
        status: tracker.weekStatus(state, week.row, started),
        week,
        days: time.weekDays(group.session1_date, n),
        hasData: started > 0 || Boolean(week.row && tracker.REFLECTIONS.some((k) => week.row[k] !== '')),
      });
    }
    const ebData = await energy.getSheet(participant.id);
    const eb = {
      ...ebData,
      status: energy.status(group, ebData),
      days: ebData.days,
      dates: time.weekDays(group.session1_date, require('../content').energyBalance.week),
    };
    const averages = await tracker.participantAverages(participant.id);
    await audit.record(req.user, 'view_participant', { subject: participant, groupId: group.id });
    res.render('staff/participant', {
      title: participant.name,
      participant,
      group,
      weeks,
      eb,
      averages,
      chart: averages.some((a) => a.overall !== null)
        ? lineChart(averages, { title: 'Average fatigue score by week and time of day (submitted weeks only)' })
        : null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
