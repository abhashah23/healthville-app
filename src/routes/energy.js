'use strict';

// Participant pages for the Energy Balance Blueprint Worksheet.
// Mounted inside the participant router, so req.user is a participant and
// req.group is their group.

const express = require('express');
const content = require('../content');
const energy = require('../energy');
const time = require('../time');

const router = express.Router();
const EB = content.energyBalance;

function notFound(res) {
  return res.status(404).render('error', { title: 'Page not found', message: 'We could not find that page.' });
}

// Loads the sheet and works out whether it can still be changed.
router.use(async (req, res, next) => {
  try {
    req.eb = await energy.getSheet(req.user.id);
    req.ebState = energy.state(req.group);
    req.ebEditable = req.ebState === 'open' && !(req.eb.sheet && req.eb.sheet.submitted_at);
    res.locals.eb = req.eb;
    res.locals.ebEditable = req.ebEditable;
    res.locals.ebDays = time.weekDays(req.group.session1_date, EB.week);
    res.locals.ebCloses = time.weekCloses(req.group.session1_date, EB.week);
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
  if (req.ebState === 'upcoming') {
    return res.render('participant/not-open', {
      title: EB.name,
      n: EB.week,
      heading: `The ${EB.name} is not open yet`,
      opens: time.weekOpens(req.group.session1_date, EB.week),
    });
  }
  res.render('participant/energy', { title: EB.name, ready: energy.readyToSubmit(req.eb) });
});

router.get('/day/:day', (req, res) => {
  const day = parseDay(req);
  if (day === null) return notFound(res);
  if (!req.ebEditable) return res.redirect('/tracker/energy');
  res.render('participant/energy-day', { title: `${EB.name}, ${time.formatDay(res.locals.ebDays[day])}`, day, added: req.query.added || null });
});

function renderLineForm(req, res, { day, kind, line, error, status = 200 }) {
  res.status(status).render('participant/energy-line', {
    title: line && line.id ? 'Change a line' : EB.kinds[kind].addLabel,
    day,
    kind,
    line: line || { activity: '', points: null, comment: '' },
    error,
    limits: energy.LIMITS,
  });
}

router.get('/day/:day/add/:kind', (req, res) => {
  const day = parseDay(req);
  if (day === null || !energy.KINDS.includes(req.params.kind)) return notFound(res);
  if (!req.ebEditable) return res.redirect('/tracker/energy');
  renderLineForm(req, res, { day, kind: req.params.kind, error: null });
});

router.post('/day/:day/add/:kind', async (req, res, next) => {
  try {
    const day = parseDay(req);
    const kind = req.params.kind;
    if (day === null || !energy.KINDS.includes(kind)) return notFound(res);
    if (!req.ebEditable) return res.redirect('/tracker/energy');
    const error = await energy.addLine(req.user.id, day, kind, req.body);
    if (error) {
      return renderLineForm(req, res, {
        day,
        kind,
        line: { activity: req.body.activity || '', points: Number(req.body.points) || null, comment: req.body.comment || '' },
        error,
        status: 400,
      });
    }
    if (req.body.go === 'another') return res.redirect(`/tracker/energy/day/${day + 1}/add/${kind}?added=1`);
    res.redirect(`/tracker/energy/day/${day + 1}?added=${kind}`);
  } catch (err) {
    next(err);
  }
});

router.get('/line/:id', async (req, res, next) => {
  try {
    const line = await energy.getLine(req.user.id, Number(req.params.id) || 0);
    if (!line) return notFound(res);
    if (!req.ebEditable) return res.redirect('/tracker/energy');
    renderLineForm(req, res, { day: line.day_index, kind: line.kind, line, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/line/:id', async (req, res, next) => {
  try {
    const line = await energy.getLine(req.user.id, Number(req.params.id) || 0);
    if (!line) return notFound(res);
    if (!req.ebEditable) return res.redirect('/tracker/energy');
    const error = await energy.updateLine(req.user.id, line.id, req.body);
    if (error) {
      return renderLineForm(req, res, {
        day: line.day_index,
        kind: line.kind,
        line: { ...line, activity: req.body.activity || '', points: Number(req.body.points) || null, comment: req.body.comment || '' },
        error,
        status: 400,
      });
    }
    res.redirect(`/tracker/energy/day/${line.day_index + 1}`);
  } catch (err) {
    next(err);
  }
});

router.post('/line/:id/delete', async (req, res, next) => {
  try {
    const line = await energy.getLine(req.user.id, Number(req.params.id) || 0);
    if (!line) return notFound(res);
    await energy.deleteLine(req.user.id, line.id);
    res.redirect(req.ebEditable ? `/tracker/energy/day/${line.day_index + 1}` : '/tracker/energy');
  } catch (err) {
    next(err);
  }
});

router.get('/review', (req, res) => {
  if (!req.ebEditable) return res.redirect('/tracker/energy');
  res.render('participant/energy-review', { title: `Submit your ${EB.name}`, ready: energy.readyToSubmit(req.eb) });
});

router.post('/submit', async (req, res, next) => {
  try {
    if (!req.ebEditable) return res.redirect('/tracker/energy');
    const ok = await energy.submit(req.user.id);
    if (!ok) return res.redirect('/tracker/energy/review');
    res.render('participant/energy-submitted', { title: `${EB.name} submitted` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
