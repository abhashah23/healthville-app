'use strict';

const express = require('express');
const db = require('../db');
const auth = require('../auth');
const config = require('../config');
const time = require('../time');
const tracker = require('../tracker');
const { lineChart } = require('../chart');
const content = require('../content');
const energy = require('../energy');
const spoons = require('../spoons');


const router = express.Router();
router.use(auth.requireRole('participant'));

// Loads the participant's group and checks the week number in the address.
router.use(async (req, res, next) => {
  try {
    req.group = await db.one('SELECT * FROM groups WHERE id = $1', [req.user.group_id]);
    res.locals.group = req.group;
    next();
  } catch (err) {
    next(err);
  }
});

router.use('/energy', require('./energy'));
router.use('/spoons', require('./spoons'));

router.param('n', (req, res, next, value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > config.weeks) {
    return res.status(404).render('error', { title: 'Page not found', message: 'We could not find that week.' });
  }
  req.weekNumber = n;
  req.weekState = time.weekState(req.group.session1_date, n);
  next();
});

// The daily steps in order: for each day, morning, afternoon, evening, then
// the severity level for that day.
function stepOrder() {
  const order = [];
  for (let d = 0; d < 7; d++) {
    for (const t of tracker.TIMES) order.push({ day: d, time: t });
    order.push({ day: d, time: 'severity' });
  }
  return order;
}

function stepDone(week, s) {
  return s.time === 'severity' ? Boolean(week.severity[s.day]) : tracker.slotComplete(week.entries[`${s.day}-${s.time}`]);
}

function firstIncompleteSlot(week) {
  return stepOrder().find((s) => !stepDone(week, s)) || null;
}

function slotUrl(n, s) {
  return s.time === 'severity' ? `/tracker/week/${n}/day/${s.day + 1}/severity` : `/tracker/week/${n}/day/${s.day + 1}/${s.time}`;
}

function nextUrl(n, day, step) {
  const order = stepOrder();
  const i = order.findIndex((s) => s.day === day && s.time === step);
  return i + 1 < order.length ? slotUrl(n, order[i + 1]) : `/tracker/week/${n}/reflections`;
}

function weeklyMissing(week) {
  return !week.row || week.row.tired_score === null || week.row.pattern.trim() === '';
}

function canEdit(req, week) {
  return req.weekState === 'open' && !(week.row && week.row.submitted_at);
}

async function weekSummaries(req) {
  const list = [];
  for (let n = 1; n <= config.weeks; n++) {
    const state = time.weekState(req.group.session1_date, n);
    const week = await tracker.getWeek(req.user.id, n);
    const started = Object.values(week.entries).filter(tracker.slotStarted).length;
    list.push({
      n,
      state,
      status: tracker.weekStatus(state, week.row, started),
      completed: tracker.completedSlots(week),
      opens: time.weekOpens(req.group.session1_date, n),
      closes: time.weekCloses(req.group.session1_date, n),
    });
  }
  return list;
}

router.get('/', async (req, res, next) => {
  try {
    const weeks = await weekSummaries(req);
    const current = weeks.find((w) => w.state === 'open') || null;
    let continueUrl = null;
    if (current && current.status !== 'submitted') {
      const week = await tracker.getWeek(req.user.id, current.n);
      const slot = firstIncompleteSlot(week);
      continueUrl = slot ? slotUrl(current.n, slot) : `/tracker/week/${current.n}/reflections`;
      if (slot === null && tracker.missingItems(week).length === 0) continueUrl = `/tracker/week/${current.n}/review`;
      // The two weekly questions come first, at the top of the week.
      if (weeklyMissing(week)) continueUrl = `/tracker/week/${current.n}#weekly-questions`;
    }
    const sp = { state: spoons.state(req.group) };
    const ebData = await energy.getSheet(req.user.id);
    const eb = {
      state: energy.state(req.group),
      status: energy.status(req.group, ebData),
      daysUsed: ebData.days.filter((d) => d.count > 0).length,
      opens: time.weekOpens(req.group.session1_date, content.energyBalance.week),
      closes: time.weekCloses(req.group.session1_date, content.energyBalance.week),
    };
    const averages = await tracker.participantAverages(req.user.id);
    const hasChart = averages.some((a) => a.overall !== null);
    res.render('participant/home', {
      title: 'My tracker',
      weeks,
      current,
      continueUrl,
      averages,
      chart: hasChart ? lineChart(averages, { title: 'My average fatigue score by week' }) : null,
      nextOpens: weeks.find((w) => w.state === 'upcoming') || null,
      eb,
      sp,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/week/:n', async (req, res, next) => {
  try {
    const n = req.weekNumber;
    if (req.weekState === 'upcoming') {
      return res.render('participant/not-open', {
        title: `Week ${n}`,
        n,
        opens: time.weekOpens(req.group.session1_date, n),
      });
    }
    const week = await tracker.getWeek(req.user.id, n);
    res.render('participant/week', {
      title: `Week ${n}`,
      n,
      week,
      editable: canEdit(req, week),
      days: time.weekDays(req.group.session1_date, n),
      closes: time.weekCloses(req.group.session1_date, n),
      completed: tracker.completedSlots(week),
      missing: tracker.missingItems(week),
    });
  } catch (err) {
    next(err);
  }
});

function parseDayParam(req) {
  const day = Number(req.params.day) - 1;
  return Number.isInteger(day) && day >= 0 && day <= 6 ? day : null;
}

router.get('/week/:n/day/:day/severity', async (req, res, next) => {
  try {
    const n = req.weekNumber;
    const day = parseDayParam(req);
    if (day === null) return res.status(404).render('error', { title: 'Page not found', message: 'We could not find that page.' });
    const week = await tracker.getWeek(req.user.id, n);
    if (!canEdit(req, week)) return res.redirect(`/tracker/week/${n}`);
    const days = time.weekDays(req.group.session1_date, n);
    res.render('participant/severity', {
      title: `Week ${n}, ${time.formatDay(days[day])}, severity level`,
      n,
      day,
      dayDate: days[day],
      severity: week.severity[day] || null,
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/week/:n/day/:day/severity', async (req, res, next) => {
  try {
    const n = req.weekNumber;
    const day = parseDayParam(req);
    const wantsJson = req.is('application/json');
    const week = await tracker.getWeek(req.user.id, n);
    let error = null;
    if (day === null) error = 'Unknown day.';
    else if (!canEdit(req, week)) error = 'This week can no longer be changed.';
    else error = await tracker.saveSeverity(req.user.id, n, day, req.body.severity);
    if (wantsJson) return res.status(error ? 400 : 200).json({ ok: !error, error });
    if (day === null || !canEdit(req, week)) return res.redirect(`/tracker/week/${n}`);
    if (error) {
      const days = time.weekDays(req.group.session1_date, n);
      return res.status(400).render('participant/severity', {
        title: `Week ${n}, severity level`, n, day, dayDate: days[day], severity: null, error,
      });
    }
    res.redirect(req.body.go === 'week' ? `/tracker/week/${n}` : nextUrl(n, day, 'severity'));
  } catch (err) {
    next(err);
  }
});

function parseSlot(req) {
  const day = Number(req.params.day) - 1;
  const timeOfDay = req.params.time;
  if (!Number.isInteger(day) || day < 0 || day > 6 || !tracker.TIMES.includes(timeOfDay)) return null;
  return { day, timeOfDay };
}

router.get('/week/:n/day/:day/:time', async (req, res, next) => {
  try {
    const n = req.weekNumber;
    const slot = parseSlot(req);
    if (!slot) return res.status(404).render('error', { title: 'Page not found', message: 'We could not find that page.' });
    const week = await tracker.getWeek(req.user.id, n);
    if (!canEdit(req, week)) return res.redirect(`/tracker/week/${n}`);
    const days = time.weekDays(req.group.session1_date, n);
    res.render('participant/slot', {
      title: `Week ${n}, ${time.formatDay(days[slot.day])}, ${req.app.locals.timeLabel[slot.timeOfDay]}`,
      n,
      day: slot.day,
      timeOfDay: slot.timeOfDay,
      dayDate: days[slot.day],
      entry: week.entries[`${slot.day}-${slot.timeOfDay}`] || null,
      nextUrl: nextUrl(n, slot.day, slot.timeOfDay),
      completed: tracker.completedSlots(week),
      error: null,
      limits: tracker.LIMITS,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/week/:n/day/:day/:time', async (req, res, next) => {
  try {
    const n = req.weekNumber;
    const slot = parseSlot(req);
    const wantsJson = req.is('application/json');
    const week = await tracker.getWeek(req.user.id, n);
    let error = null;
    if (!slot) error = 'Unknown day or time.';
    else if (!canEdit(req, week)) {
      error = week.row && week.row.submitted_at ? 'This week has already been submitted.' : 'This week is closed.';
    } else error = await tracker.saveSlot(req.user.id, n, slot.day, slot.timeOfDay, req.body);

    if (wantsJson) return res.status(error ? 400 : 200).json({ ok: !error, error });
    if (error) {
      if (!slot || !canEdit(req, week)) return res.redirect(`/tracker/week/${n}`);
      const days = time.weekDays(req.group.session1_date, n);
      return res.status(400).render('participant/slot', {
        title: `Week ${n}`,
        n,
        day: slot.day,
        timeOfDay: slot.timeOfDay,
        dayDate: days[slot.day],
        entry: { score: null, activity: req.body.activity || '', notes: req.body.notes || '' },
        nextUrl: nextUrl(n, slot.day, slot.timeOfDay),
        completed: tracker.completedSlots(week),
        error,
        limits: tracker.LIMITS,
      });
    }
    res.redirect(req.body.go === 'week' ? `/tracker/week/${n}` : nextUrl(n, slot.day, slot.timeOfDay));
  } catch (err) {
    next(err);
  }
});

router.post('/week/:n/weekly', async (req, res, next) => {
  try {
    const n = req.weekNumber;
    const wantsJson = req.is('application/json');
    const week = await tracker.getWeek(req.user.id, n);
    const error = canEdit(req, week) ? await tracker.saveWeekly(req.user.id, n, req.body) : 'This week can no longer be changed.';
    if (wantsJson) return res.status(error ? 400 : 200).json({ ok: !error, error });
    if (error || req.body.go !== 'next') return res.redirect(`/tracker/week/${n}`);
    const updated = await tracker.getWeek(req.user.id, n);
    const step = firstIncompleteSlot(updated);
    res.redirect(step ? slotUrl(n, step) : `/tracker/week/${n}/reflections`);
  } catch (err) {
    next(err);
  }
});

router.get('/week/:n/reflections', async (req, res, next) => {
  try {
    const n = req.weekNumber;
    const week = await tracker.getWeek(req.user.id, n);
    if (!canEdit(req, week)) return res.redirect(`/tracker/week/${n}`);
    res.render('participant/reflections', { title: `Week ${n}, reflection`, n, week, limits: tracker.LIMITS });
  } catch (err) {
    next(err);
  }
});

router.post('/week/:n/reflections', async (req, res, next) => {
  try {
    const n = req.weekNumber;
    const wantsJson = req.is('application/json');
    const week = await tracker.getWeek(req.user.id, n);
    const error = canEdit(req, week) ? await tracker.saveReflections(req.user.id, n, req.body) : 'This week can no longer be changed.';
    if (wantsJson) return res.status(error ? 400 : 200).json({ ok: !error, error });
    res.redirect(error || req.body.go === 'week' ? `/tracker/week/${n}` : `/tracker/week/${n}/review`);
  } catch (err) {
    next(err);
  }
});

router.get('/week/:n/review', async (req, res, next) => {
  try {
    const n = req.weekNumber;
    const week = await tracker.getWeek(req.user.id, n);
    if (!canEdit(req, week)) return res.redirect(`/tracker/week/${n}`);
    res.render('participant/review', {
      title: `Week ${n}, submit`,
      n,
      missing: tracker.missingItems(week),
      days: time.weekDays(req.group.session1_date, n),
      closes: time.weekCloses(req.group.session1_date, n),
      slotUrl,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/week/:n/submit', async (req, res, next) => {
  try {
    const n = req.weekNumber;
    const week = await tracker.getWeek(req.user.id, n);
    if (!canEdit(req, week)) return res.redirect(`/tracker/week/${n}`);
    const missing = await tracker.submitWeek(req.user.id, n);
    if (missing.length) return res.redirect(`/tracker/week/${n}/review`);
    res.render('participant/submitted', { title: `Week ${n} submitted`, n });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
