'use strict';

// Week windows for the weekly tracker.
//
// Week N opens at the start of the day of Session N (Eastern Time) and closes
// when Session N+1 starts (Thursday 1:00 PM Eastern Time). Day 1 of the week
// is the Thursday of Session N, day 7 is the Wednesday after.
//
// Week 6 has no next session. PLACEHOLDER pending Abha: it closes one week
// after Session 6, at 1:00 PM Eastern Time, as if there were a Session 7.

const { DateTime } = require('luxon');
const config = require('./config');

const TZ = config.sessionTimeZone;

function sessionDay(session1Date, n) {
  return DateTime.fromISO(session1Date, { zone: TZ }).plus({ days: 7 * (n - 1) }).startOf('day');
}

function sessionStart(session1Date, n) {
  return sessionDay(session1Date, n).set({
    hour: config.sessionStartHour,
    minute: config.sessionStartMinute,
  });
}

function weekOpens(session1Date, n) {
  return sessionDay(session1Date, n);
}

function weekCloses(session1Date, n) {
  return sessionStart(session1Date, n + 1);
}

// 'upcoming', 'open' or 'closed'.
function weekState(session1Date, n, now = DateTime.now()) {
  if (now < weekOpens(session1Date, n)) return 'upcoming';
  if (now < weekCloses(session1Date, n)) return 'open';
  return 'closed';
}

// The week that is open right now, or null.
function openWeek(session1Date, now = DateTime.now()) {
  for (let n = 1; n <= config.weeks; n++) {
    if (weekState(session1Date, n, now) === 'open') return n;
  }
  return null;
}

// The 7 calendar dates of week N, as Luxon dates.
function weekDays(session1Date, n) {
  const first = sessionDay(session1Date, n);
  return Array.from({ length: 7 }, (_, i) => first.plus({ days: i }));
}

function formatDay(dt) {
  return dt.setLocale('en-CA').toFormat('cccc, LLLL d');
}

function formatShortDay(dt) {
  return dt.setLocale('en-CA').toFormat('ccc LLL d');
}

function formatDeadline(dt) {
  return `${dt.setLocale('en-CA').toFormat('cccc, LLLL d')} at ${dt.toFormat('h:mm a')} Eastern Time`;
}

function formatTimestamp(date) {
  if (!date) return '';
  return DateTime.fromJSDate(date, { zone: TZ }).setLocale('en-CA').toFormat("LLL d, yyyy 'at' h:mm a 'ET'");
}

module.exports = {
  sessionDay,
  sessionStart,
  weekOpens,
  weekCloses,
  weekState,
  openWeek,
  weekDays,
  formatDay,
  formatShortDay,
  formatDeadline,
  formatTimestamp,
};
