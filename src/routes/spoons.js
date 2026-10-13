'use strict';

// Participant pages for the Daily Spoon Tracker. Mounted inside the
// participant router (req.user and req.group are set).

const express = require('express');
const content = require('../content');
const spoons = require('../spoons');
const time = require('../time');

const router = express.Router();
const SP = content.spoons;

router.use(async (req, res, next) => {
  try {
    req.sp = await spoons.getSheet(req.user.id);
    req.spState = spoons.state(req.group);
    req.spEditable = req.spState === 'open' && !(req.sp.sheet && req.sp.sheet.submitted_at);
    res.locals.sp = req.sp;
    res.locals.spEditable = req.spEditable;
    res.locals.spDays = time.weekDays(req.group.session1_date, SP.week);
    res.locals.spCloses = time.weekCloses(req.group.session1_date, SP.week);
    next();
  } catch (err) {
    next(err);
  }
});

function parseDay(req) {
  const d = Number(req.params.day) - 1;
  return Number.isInteger(d) && d >= 0 && d <= 6 ? d : null;
}

router.get('/', (req, res) => {
  if (req.spState === 'upcoming') {
    return res.render('participant/not-open', {
      title: SP.name,
      n: SP.week,
      heading: `The ${SP.name} is not open yet`,
      opens: time.weekOpens(req.group.session1_date, SP.week),
    });
  }
  res.render('participant/spoons', { title: SP.name });
});

router.get('/day/:day', (req, res) => {
  const day = parseDay(req);
  if (day === null) return res.status(404).render('error', { title: 'Page not found', message: 'We could not find that page.' });
  if (!req.spEditable) return res.redirect('/tracker/spoons');
  res.render('participant/spoons-day', { title: `${SP.name}, ${time.formatDay(res.locals.spDays[day])}`, day });
});

// Body: { used: n } to set a number, or { change: 'add' | 'remove' }.
router.post('/day/:day', async (req, res, next) => {
  try {
    const day = parseDay(req);
    const wantsJson = req.is('application/json');
    let error = null;
    let used = null;
    if (day === null) error = 'Unknown day.';
    else if (!req.spEditable) error = 'This can no longer be changed.';
    else {
      const current = req.sp.days[day] || 0;
      if (req.body.change === 'add') used = Math.min(SP.perDay, current + 1);
      else if (req.body.change === 'remove') used = Math.max(0, current - 1);
      else used = Number(req.body.used);
      error = await spoons.setUsed(req.user.id, day, used);
    }
    if (wantsJson) return res.status(error ? 400 : 200).json({ ok: !error, error, used });
    if (error || day === null) return res.redirect('/tracker/spoons');
    res.redirect(`/tracker/spoons/day/${day + 1}`);
  } catch (err) {
    next(err);
  }
});

router.get('/review', (req, res) => {
  if (!req.spEditable) return res.redirect('/tracker/spoons');
  res.render('participant/spoons-review', { title: `Submit your ${SP.name}`, ready: spoons.readyToSubmit(req.sp) });
});

router.post('/submit', async (req, res, next) => {
  try {
    if (!req.spEditable) return res.redirect('/tracker/spoons');
    if (!(await spoons.submit(req.user.id))) return res.redirect('/tracker/spoons/review');
    res.render('participant/spoons-submitted', { title: `${SP.name} submitted` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
