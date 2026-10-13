-- Severity level is asked every day (Abha), not once a week.
CREATE TABLE tracker_days (
  week_id    INTEGER NOT NULL REFERENCES tracker_weeks(id) ON DELETE CASCADE,
  day_index  SMALLINT NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  severity   TEXT NOT NULL CHECK (severity IN ('severe', 'moderate', 'mild', 'very_mild', 'none')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (week_id, day_index)
);

ALTER TABLE tracker_weeks DROP COLUMN severity;
