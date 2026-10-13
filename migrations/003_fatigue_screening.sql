-- Fatigue Screening, completed before Session 1 and before Session 6.
-- Fields follow the LMS screenshot: tiredness 1 to 10, severity level
-- (five options) and one free-text box for the fatigue pattern.

CREATE TABLE fatigue_screenings (
  id             SERIAL PRIMARY KEY,
  participant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_number SMALLINT NOT NULL CHECK (session_number IN (1, 6)),
  tired_score    SMALLINT CHECK (tired_score BETWEEN 1 AND 10),
  severity       TEXT CHECK (severity IN ('severe', 'moderate', 'mild', 'very_mild', 'none')),
  pattern        TEXT NOT NULL DEFAULT '',
  submitted_at   TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_id, session_number)
);
