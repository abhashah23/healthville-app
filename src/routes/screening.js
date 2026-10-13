'use strict';

// Participant pages for the Fatigue Screening (before Session 1 and 6).
// Mounted inside the participant router (req.user and req.group are set).

const express = require('express');
const content = require('../content');
const screening = require('../screening');

const router = express.Router();

router.param('s', (req, res, next, value) => {
  const s = Number(value);
  if (!screening.SESSIONS.includes(s)) {
    return res.status(404).render('error', { title: 'Page not found', message: 'We could not find that page.' });
  }
  req.scSession = s;
  req.scState = screening.state(req.group, s);
  next();
});

async function renderForm(req, res, { error = null, missing = [], status = 200, values = null } = {}) {
  const row = await screening.get(req.user.id, req.scSession);
  const editable = req.scState === 'open' && !(row && row.submitted_at);
  res.status(status).render('participant/screening', {
    title: `${content.screening.name} before Session ${req.scSession}`,
    s: req.scSession,
    row: values || row,
    submittedAt: row ? row.submitted_at : null,
    editable,
    scState: req.scState,
    opens: screening.opens(req.group, req.scSession),
    closes: screening.closes(req.group, req.scSession),
    error,
    missing,
    limits: screening.LIMITS,
  });
}

router.get('/:s', async (req, res, next) => {
  try {
    await renderForm(req, res);
  } catch (err) {
    next(err);
  }
});

router.post('/:s', async (req, res, next) => {
  try {
    const wantsJson = req.is('application/json');
    const row = await screening.get(req.user.id, req.scSession);
    if (req.scState !== 'open' || (row && row.submitted_at)) {
      if (wantsJson) return res.status(400).json({ ok: false, error: 'This can no longer be changed.' });
      return res.redirect(`/tracker/screening/${req.scSession}`);
    }
    const error = await screening.save(req.user.id, req.scSession, req.body);
    if (wantsJson) return res.status(error ? 400 : 200).json({ ok: !error, error });
    if (error) return renderForm(req, res, { error, status: 400 });
    if (req.body.go !== 'submit') return res.redirect('/tracker');
    const missing = await screening.submit(req.user.id, req.scSession);
    if (missing.length) {
      return renderForm(req, res, { error: 'A few answers are still needed. Your answers so far are saved.', missing, status: 400 });
    }
    res.render('participant/screening-submitted', { title: `${content.screening.name} submitted`, s: req.scSession });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
