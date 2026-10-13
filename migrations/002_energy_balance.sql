-- Energy Balance Blueprint Worksheet (day at a glance).
-- Filled in on any days of the week after Session 2, submitted once.
-- Each line is one activity with 1 to 4 points (spoons used), or one
-- replenishing activity with 1 to 4 points (spoons given back).

CREATE TABLE energy_sheets (
  id             SERIAL PRIMARY KEY,
  participant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_number    SMALLINT NOT NULL CHECK (week_number BETWEEN 1 AND 6),
  submitted_at   TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_id, week_number)
);

CREATE TABLE energy_lines (
  id         SERIAL PRIMARY KEY,
  sheet_id   INTEGER NOT NULL REFERENCES energy_sheets(id) ON DELETE CASCADE,
  day_index  SMALLINT NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  kind       TEXT NOT NULL CHECK (kind IN ('activity', 'replenish')),
  activity   TEXT NOT NULL CHECK (activity <> ''),
  points     SMALLINT NOT NULL CHECK (points BETWEEN 1 AND 4),
  comment    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX energy_lines_sheet ON energy_lines (sheet_id, day_index, kind, id);
