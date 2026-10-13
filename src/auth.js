'use strict';

// Passwordless sign-in: a single-use link is emailed to the person. Only
// hashes of tokens and session ids are stored in the database.

const crypto = require('crypto');
const config = require('./config');
const db = require('./db');

const SESSION_COOKIE = 'hv_session';

function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function findActiveUserByEmail(email) {
  return db.one('SELECT * FROM users WHERE lower(email) = lower($1) AND active', [email.trim()]);
}

async function createLoginToken(userId) {
  const token = randomToken();
  await db.query(
    `INSERT INTO login_tokens (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(mins => $3))`,
    [hash(token), userId, config.loginLinkMinutes]
  );
  return token;
}

// Returns the user if the token is valid, and marks it used. A token works once.
async function useLoginToken(token) {
  if (typeof token !== 'string' || token.length < 20) return null;
  const row = await db.one(
    `UPDATE login_tokens SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [hash(token)]
  );
  if (!row) return null;
  return db.one('SELECT * FROM users WHERE id = $1 AND active', [row.user_id]);
}

async function checkLoginToken(token) {
  if (typeof token !== 'string' || token.length < 20) return false;
  const row = await db.one(
    'SELECT 1 FROM login_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()',
    [hash(token)]
  );
  return Boolean(row);
}

function sessionLengthMs(user) {
  return user.role === 'participant'
    ? config.participantSessionDays * 24 * 3600 * 1000
    : config.staffSessionHours * 3600 * 1000;
}

function setSessionCookie(res, value, maxAgeMs) {
  res.cookie(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: maxAgeMs,
    path: '/',
  });
}

async function startSession(res, user) {
  const id = randomToken();
  const ms = sessionLengthMs(user);
  await db.query(
    `INSERT INTO sessions (id_hash, user_id, csrf_token, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
    [hash(id), user.id, randomToken(), ms / 1000]
  );
  setSessionCookie(res, id, ms);
}

async function endSession(req, res) {
  const id = req.cookies[SESSION_COOKIE];
  if (id) await db.query('DELETE FROM sessions WHERE id_hash = $1', [hash(id)]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

// Loads the signed-in user into req.user. Each visit pushes the expiry
// forward, so nobody is signed out while they are using the app.
async function loadSession(req, res, next) {
  try {
    const id = req.cookies[SESSION_COOKIE];
    if (id) {
      const row = await db.one(
        `SELECT s.csrf_token, u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id_hash = $1 AND s.expires_at > now() AND u.active`,
        [hash(id)]
      );
      if (row) {
        const { csrf_token: csrfToken, ...user } = row;
        req.user = user;
        req.csrfToken = csrfToken;
        const ms = sessionLengthMs(user);
        await db.query(
          'UPDATE sessions SET expires_at = now() + make_interval(secs => $2) WHERE id_hash = $1',
          [hash(id), ms / 1000]
        );
        setSessionCookie(res, id, ms);
      }
    }
    res.locals.user = req.user || null;
    res.locals.csrfToken = req.csrfToken || '';
    next();
  } catch (err) {
    next(err);
  }
}

// Every form and save request from a signed-in person must carry the CSRF
// token for their session.
function checkCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.user) return next();
  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
  const expected = req.csrfToken || '';
  const ok =
    sent.length === expected.length &&
    expected.length > 0 &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) return res.status(403).render('error', { title: 'Please try again', message: 'This page was open too long or came from somewhere else. Go back, refresh the page and try again. Nothing you saved earlier has been lost.' });
  next();
}

function requireUser(req, res, next) {
  if (!req.user) return res.redirect('/sign-in');
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/sign-in');
    if (!roles.includes(req.user.role)) {
      return res.status(403).render('error', { title: 'Not available', message: 'This page is not available to your account.' });
    }
    next();
  };
}

// Simple in-memory limit on sign-in link requests, per email and per address.
const recent = new Map();
function allowSignInRequest(key, limit = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const list = (recent.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    recent.set(key, list);
    return false;
  }
  list.push(now);
  recent.set(key, list);
  return true;
}
function resetRateLimits() {
  recent.clear();
}

module.exports = {
  findActiveUserByEmail,
  createLoginToken,
  useLoginToken,
  checkLoginToken,
  startSession,
  endSession,
  loadSession,
  checkCsrf,
  requireUser,
  requireRole,
  allowSignInRequest,
  resetRateLimits,
};
