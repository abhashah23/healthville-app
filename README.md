# Healthville Fatigue Tracker

A simple app where participants in Healthville's six-session group coaching
program, "Managing and Coping with Cancer-Related Fatigue", fill in their
trackers, and where Healthville staff can see what has been filled in.

**Status: planning. No app code has been written yet.**

## What the app will do (Phase 1)

- Participants sign in with a link sent to their email (no password).
- Participants fill in the Weekly Fatigue and Energy Tracker a little at a
  time across the week. Every entry saves automatically. They submit the
  week once.
- Facilitators see their own group only. Admins see all groups. The clinical
  director sees all groups, read-only.
- Staff see which weeks each participant has submitted, a participant page
  with a small chart, and a group summary.
- Every time staff view a participant's data, it is recorded in an audit log.

The app is educational. It does not give medical advice and it is not
monitored in real time. It does not send alerts about high scores.

## Phases

1. Weekly tracker for participants, plus staff views.
2. Fatigue Profile, spoon tracker, Action Plan, 6-Week Summary.
3. Weekly email reminders, CSV exports, the Pre/Post Evaluation Survey.

## Who to contact

- Program Lead: Abha Shah
- Program Director (clinical sign-off): Dr. Doris Howell RN PhD
- Technical contractor (integrations and deployment): Umair

## Needs approval before real participants use it

See [docs/decisions.md](docs/decisions.md) for the full list. In short:
hosting provider and region, privacy notice and consent wording, retention
period, the "not monitored" message and crisis contacts, and agreements with
the hosting and email providers.

## How to run it

To be added when Phase 1 is built.
