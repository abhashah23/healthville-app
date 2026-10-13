'use strict';

const fs = require('fs');
const path = require('path');

// Load a local .env file if there is one. Production sets real environment
// variables, which always win.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

const env = process.env;
const isProduction = env.NODE_ENV === 'production';

const config = {
  isProduction,
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT || 3000),
  appUrl: (env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  databaseUrl: env.DATABASE_URL || 'postgres://hv:hv@localhost:5432/healthville_dev',
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT || 587),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
  },
  emailFrom: env.EMAIL_FROM || 'Healthville <no-reply@example.org>',
  loginLinkMinutes: Number(env.LOGIN_LINK_MINUTES || 60),
  participantSessionDays: Number(env.PARTICIPANT_SESSION_DAYS || 30),
  staffSessionHours: Number(env.STAFF_SESSION_HOURS || 12),

  // Program schedule. Sessions are Thursdays, 1:00 to 2:30 PM Eastern Time.
  sessionTimeZone: 'America/Toronto',
  sessionStartHour: 13,
  sessionStartMinute: 0,
  weeks: 6,
};

if (isProduction && !config.smtp.host) {
  throw new Error('SMTP_HOST must be set in production so sign-in links can be emailed.');
}
if (isProduction && !config.appUrl.startsWith('https://')) {
  throw new Error('APP_URL must start with https:// in production.');
}

module.exports = config;
