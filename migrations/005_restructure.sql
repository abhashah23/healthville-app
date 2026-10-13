-- Restructure (Abha):
-- 1. The questions from the screening sheet are part of every week of the
--    Weekly Fatigue Tracker: how tired over the last week (1 to 10),
--    severity level (five options) and fatigue pattern (one box).
-- 2. The Daily Spoon Tracker is just 12 spoons a day to cross off.

ALTER TABLE tracker_weeks
  ADD COLUMN tired_score SMALLINT CHECK (tired_score BETWEEN 1 AND 10),
  ADD COLUMN severity    TEXT CHECK (severity IN ('severe', 'moderate', 'mild', 'very_mild', 'none')),
  ADD COLUMN pattern     TEXT NOT NULL DEFAULT '';

DROP TABLE fatigue_screenings;

-- Which of the 12 spoons are crossed off, one bit per spoon.
ALTER TABLE spoon_days DROP COLUMN used;
ALTER TABLE spoon_days ADD COLUMN crossed SMALLINT NOT NULL DEFAULT 0 CHECK (crossed BETWEEN 0 AND 4095);
ALTER TABLE spoon_sheets DROP COLUMN submitted_at;
