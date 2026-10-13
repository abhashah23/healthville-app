'use strict';

const express = require('express');
const auth = require('../auth');
const audit = require('../audit');
const email = require('../email');
const config = require('../config');
const content = require('../content');

const router = express.Router();

router.get('/sign-in', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('auth/sign-in', { title: 'Sign in', error: null, email: '' });
});

router.post('/sign-in', async (req, res, next) => {
  try {
    const address = String(req.body.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 254) {
      return res.status(400).render('auth/sign-in', {
        title: 'Sign in',
        error: 'Please enter your email address, for example name@example.com.',
        email: address,
      });
    }
    // Same answer whether or not the email is registered, so the page cannot
    // be used to find out who is in the program.
    const allowed =
      auth.allowSignInRequest(`email:${address.toLowerCase()}`) && auth.allowSignInRequest(`ip:${req.ip}`, 20);
    if (allowed) {
      const user = await auth.findActiveUserByEmail(address);
      if (user) {
        const token = await auth.createLoginToken(user.id);
        const link = `${config.appUrl}/sign-in/confirm?token=${encodeURIComponent(token)}`;
        await email.send({
          to: user.email,
          subject: content.signInEmail.subject,
          text: content.signInEmail.text(link, config.loginLinkMinutes),
        });
      }
    }
    res.render('auth/check-email', { title: 'Check your email', email: address });
  } catch (err) {
    next(err);
  }
});

// Opening the link shows a button rather than signing in straight away.
// Some email systems (including Microsoft 365) open links to scan them, which
// would otherwise use up the single-use link before the person clicks it.
router.get('/sign-in/confirm', async (req, res, next) => {
  try {
    const token = String(req.query.token || '');
    if (!(await auth.checkLoginToken(token))) {
      return res.status(400).render('auth/link-invalid', { title: 'Link not working' });
    }
    res.render('auth/confirm', { title: 'Sign in', token });
  } catch (err) {
    next(err);
  }
});

router.post('/sign-in/confirm', async (req, res, next) => {
  try {
    const user = await auth.useLoginToken(String(req.body.token || ''));
    if (!user) return res.status(400).render('auth/link-invalid', { title: 'Link not working' });
    await auth.startSession(res, user);
    await audit.record(user, 'sign_in');
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

router.post('/sign-out', async (req, res, next) => {
  try {
    await auth.endSession(req, res);
    res.locals.user = null;
    res.render('auth/signed-out', { title: 'Signed out' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
