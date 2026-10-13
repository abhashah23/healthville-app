# Healthville Fatigue Tracker

A simple app where participants in Healthville's six-session group coaching
program, "Managing and Coping with Cancer-Related Fatigue", fill in their
weekly tracker, and where Healthville staff can see what has been filled in.

**Status: the Weekly Fatigue Tracker (with the Fatigue Screening), the Daily Spoon Tracker and the Energy Balance Blueprint built and working with made-up data. Not yet approved for
real participants.** See "Needs approval" below.

## What it does (Phase 1)

**Participants**
- Sign in with a link sent to their email. No password.
- Fill in the Weekly Fatigue Tracker one time of day at a time:
  a score from 0 to 10, what they were doing, and optional notes.
- Every answer saves as they go. If the connection drops, the answer is kept
  on their device and saved again later.
- Answer three weekly reflection questions, then submit the week once.
- See their past weeks and a chart of their own averages.

**Energy Balance Blueprint** (Session 2 home practice, from the worksheet):
- Open during the week after Session 2. Participants fill in any days they like.
- For each day, they add activities that used energy and replenishing
  activities that gave energy back, each with points (spoons) from 1 to 4
  and an optional comment.
- The app shows a daily total: points used, minus points given back.
- Same rules as the weekly tracker: submit once, no changes after, closes when
  Session 3 starts, and staff see it once it is submitted or closed.

**Fatigue Screening**, part of the Weekly Fatigue Tracker (page 1 of the
handout), following the LMS screenshot:
- How tired have you felt over the last week? (1 to 10), Your severity level
  (Severe, Moderate, Mild, Very mild, None), Your Fatigue Pattern (one box).
- Before Session 1: the first step of the tracker, open the week before
  Session 1 and submitted on its own.
- Before Session 6: part of Week 5. It comes first in that week and is
  submitted together with the week.

**Daily Spoon Tracker** (Session 2 home practice, "Today's Spoons" on the My
Spoons handout):
- Open during the week after Session 2. Participants fill in any days.
- Each day starts with 12 spoons. "Cross off a spoon" for each thing done,
  "Put one back" to undo.
- Submit once, no changes after, closes when Session 3 starts.

**Facilitators** see only the groups they are assigned to:
- A grid of who has submitted which week.
- A participant page with their entries, severity bands, and a chart across
  the six weeks (whole day and by time of day).
- A group summary: how many submitted each week and the group average.
- Each participant's Energy Balance Blueprint, day by day, with daily totals.

**Admins** (Abha, Rohit, Dr. Howell) see every group and can:
- Add groups, participants, facilitators and admins.
- Turn accounts off, and delete a participant's data on request.
- Read the audit log of who signed in and who viewed which participant.

The app is educational. It gives no medical advice and sends no alerts about
high scores. It shows a "not monitored in real time" message on every page.

## Rules built in (decided by Abha)

- Week 1 opens on the Thursday of Session 1. Each week runs Thursday to
  Wednesday.
- A week closes when the next session starts: Thursday 1:00 PM Eastern Time.
- A week cannot be submitted late or changed after it is submitted.
- All 21 times of day need a score and "what I was doing". All three
  reflection questions are required. Notes are optional.
- Facilitators see a week's entries once it is submitted, or once it closes
  (marked "Not submitted"). They do not see a week while it is in progress.
- Averages and charts use submitted weeks only.

## Needs approval before real participants use it

These are placeholders in the app or decisions outside it. See
[docs/decisions.md](docs/decisions.md) for details.

1. Hosting provider and region (recommended: Microsoft Azure, Canada Central).
2. Privacy Notice updated to describe this app, and consent wording.
3. "Not monitored in real time" message and crisis contacts
   (pending Dr. Howell sign-off).
4. Retention period for tracker data (pending Abha).
5. Data agreements with the hosting and email providers.
6. All participant-facing wording, approved by Dr. Howell. It is all in one
   file: `src/content.js`.

## Who to contact

- Program Lead: Abha Shah
- Program Director (clinical sign-off): Dr. Doris Howell RN PhD
- Technical contractor (integrations and deployment): Umair

## How to run it on a computer (for Umair or a developer)

Needs Node.js 20 or newer and PostgreSQL 14 or newer.

```bash
npm install
cp .env.example .env          # then set DATABASE_URL
npm run seed-demo             # optional: made-up people and entries
npm start                     # http://localhost:3000
npm test                      # automated checks (uses a separate test database)
```

With no email settings, sign-in links are printed in the server log instead
of being emailed. Demo accounts after `npm run seed-demo`:
`participant@demo.healthville.test`, `facilitator@demo.healthville.test`,
`admin@demo.healthville.test`.

Tests expect a database at
`postgres://hv:hv@localhost:5432/healthville_test` (or set
`TEST_DATABASE_URL`). **The tests wipe that database.**

To deploy, see [docs/DEPLOY.md](docs/DEPLOY.md).

## How it is built (short version for reviewers)

- Node.js and Express, pages built on the server (EJS templates). Pages work
  without JavaScript. Small scripts add autosave and local times.
- PostgreSQL for data. Schema in `migrations/`. Applied automatically on start.
- Sign-in: single-use links that expire in 60 minutes. Only hashes of links
  and session ids are stored. Opening a link shows a "Sign in" button, so
  email security scanners cannot use it up.
- Access rules in `src/access.js` and `src/auth.js`. Every view of a group
  or participant is written to the audit log.
- Charts are drawn on the server as SVG with a data table next to them.
- Poppins font is served by the app itself, not from Google.

## Testing checklist for Phase 1

**As a participant (use a phone)**
1. Ask for a sign-in link with your email. Open the email and sign in.
2. Tap "Start this week". Choose a score, type what you were doing.
   Watch for "Saved" under the form.
3. Close the browser halfway through typing. Open it again. Is your answer there?
4. Turn on airplane mode, change an answer, then turn it off. Does it save?
5. Tap "Save and go to next" through a few times of day.
6. Open "See the whole week". Are filled times shaded? Is the date right?
7. Try "Review and submit". Does it list what is still missing?
8. Fill everything (the demo data helps) and submit. Can you still change it?
   (You should not be able to.)
9. Check "My weeks" and the chart on the home page.
10. Try it with your phone's text size turned up, and with a screen reader
    (VoiceOver or TalkBack) if you can.

**Energy Balance Blueprint (as a participant, in the week after Session 2)**
1. On the home page, tap "Start the Energy Balance Blueprint".
2. Choose a day. Add two activities and one replenishing activity.
3. Check the daily total: points used minus points given back.
4. Change one line and remove another.
5. Try to submit with nothing added. Then add an activity and submit.
6. Check that nothing can be changed after submitting.

**Fatigue Screening (as a participant)**
1. In the week before Session 1, the home page says "Before Session 1, start
   with the Fatigue Screening". Answer the three questions and submit.
2. In Week 5, the screening comes first. Try to submit Week 5 without it:
   the review page should list the screening questions.
3. Fill it in and submit Week 5. Both are submitted together.

**Daily Spoon Tracker (as a participant, in the week after Session 2)**
1. Tap "Start the Daily Spoon Tracker" and choose a day.
2. Tap "Cross off a spoon" a few times, then "Put one back".
3. Try to cross off more than 12. It should stop at 12.
4. Submit, and check it cannot be changed.

**As a facilitator**
1. Sign in as `facilitator@demo.healthville.test`.
2. You should see only "Demo group A", not "Demo group B".
3. Open the group. Check the grid and the group summary.
4. Open a participant. Check entries, bands and the chart. Week 3 entries
   should not show, because that week is still in progress.

**As an admin**
1. Sign in as `admin@demo.healthville.test`.
2. Add a group (Session 1 must be a Thursday). Assign a facilitator.
3. Add a participant to it. Sign in as that participant using the link.
4. Open the audit log. Do you see your sign-ins and views?
5. Delete a test participant. Are they gone, with only their code in the log?
