'use strict';

// Participant page for the Spoon Tracker: today's 12 spoons to cross off.
// Mounted inside the participant router (req.user and req.group are set).

const express = require('express');
const content = require('../content');
const spoons = require('../spoons');
const time = require('../time');

const router = express.Router();
const SP = content.spoons;

// The day to show: the participant's own date if the page sent it (so people
// outside Eastern Time see their own "today"), otherwise today in Eastern Time.
function pickDay(req, value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const i = spoons.dayIndexFor(req.group, value);
    if (i !== null) return i;
  }
  return spoons.todayIndex(req.group);
}

function closedPage(res) {
  return res.render('participant/spoons-closed', { title: SP.name });
}

router.get('/', async (req, res, next) => {
  try {
    const day = spoons.state(req.group) === 'open' ? pickDay(req, req.query.date) : null;
    if (day === null) return closedPage(res);
    const days = await spoons.getDays(req.user.id);
    const date = spoons.dates(req.group)[day];
    res.render('participant/spoons', {
      title: SP.name,
      day,
      date,
      crossed: days[day] || 0,
      allowedDates: spoons.dates(req.group).map((d) => d.toISODate()),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const wantsJson = req.is('application/json');
    const day = spoons.state(req.group) === 'open' ? pickDay(req, req.body.date) : null;
    const result = day === null ? { error: 'The Spoon Tracker is closed.' } : await spoons.toggle(req.user.id, day, Number(req.body.spoon));
    if (wantsJson) return res.status(result.error ? 400 : 200).json({ ok: !result.error, ...result });
    const date = day === null ? '' : spoons.dates(req.group)[day].toISODate();
    res.redirect(`/tracker/spoons${date ? `?date=${date}` : ''}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
