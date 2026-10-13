'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const config = require('./config');
const auth = require('./auth');
const content = require('./content');
const time = require('./time');
const { bandFor } = require('./bands');
const tracker = require('./tracker');

function createApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  // Azure App Service sits in front of the app and handles HTTPS.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          fontSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.isProduction ? [] : null,
        },
      },
      strictTransportSecurity: config.isProduction,
      referrerPolicy: { policy: 'no-referrer' },
    })
  );

  // Fonts are served from this app, not Google, so no visitor data goes to a
  // third party when a page loads.
  app.use('/fonts', express.static(path.join(__dirname, '..', 'node_modules', '@fontsource', 'poppins', 'files'), { maxAge: '30d' }));
  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: config.isProduction ? '1h' : 0 }));

  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());

  // Pages with personal information must never be cached by the browser.
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.use(auth.loadSession);
  app.use(auth.checkCsrf);

  app.locals.user = null;
  app.locals.csrfToken = '';
  app.locals.content = content;
  app.locals.time = time;
  app.locals.bandFor = bandFor;
  app.locals.statusLabels = tracker.STATUS_LABELS;
  app.locals.timeLabel = Object.fromEntries(content.tracker.timesOfDay.map((t) => [t.key, t.label]));

  app.get('/', (req, res) => {
    if (!req.user) return res.redirect('/sign-in');
    res.redirect(req.user.role === 'participant' ? '/tracker' : '/staff');
  });

  app.get('/health', (req, res) => res.type('text').send('ok'));

  app.use(require('./routes/auth'));
  app.use('/tracker', require('./routes/participant'));
  app.use('/staff', require('./routes/staff'));
  app.use('/admin', require('./routes/admin'));

  app.use((req, res) => {
    res.status(404).render('error', { title: 'Page not found', message: 'We could not find that page.' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    if (req.accepts(['html', 'json']) === 'json') return res.status(500).json({ ok: false });
    res.status(500).render('error', { title: 'Something went wrong', message: 'Please try again in a moment. If it keeps happening, let your facilitator know.' });
  });

  return app;
}

module.exports = createApp;
