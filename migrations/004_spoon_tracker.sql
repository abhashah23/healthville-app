-- Daily Spoon Tracker ("Today's Spoons" on the My Spoons handout).
-- 12 spoons a day. Participants cross one off for each thing they do.
-- Filled in on any days of the week after Session 2, submitted once.

CREATE TABLE spoon_sheets (
  id             SERIAL PRIMARY KEY,
  participant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_number    SMALLINT NOT NULL CHECK (week_number BETWEEN 1 AND 6),
  submitted_at   TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_id, week_number)
);

CREATE TABLE spoon_days (
  sheet_id   INTEGER NOT NULL REFERENCES spoon_sheets(id) ON DELETE CASCADE,
  day_index  SMALLINT NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  used       SMALLINT NOT NULL CHECK (used BETWEEN 0 AND 12),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (sheet_id, day_index)
);
