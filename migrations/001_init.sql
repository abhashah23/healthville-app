-- Phase 1 schema: people, groups, sign-in, weekly tracker, audit log.
-- Only the fields listed in the program brief are stored. No diagnosis,
-- treatment or other health fields.

CREATE TABLE groups (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  -- Date of Session 1 (a Thursday). Week N opens on the date of Session N.
  session1_date DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id               SERIAL PRIMARY KEY,
  email            TEXT NOT NULL,
  name             TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('participant', 'facilitator', 'admin')),
  -- Participants only.
  participant_code TEXT,
  group_id         INTEGER REFERENCES groups(id) ON DELETE RESTRICT,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (role <> 'participant' OR (participant_code IS NOT NULL AND group_id IS NOT NULL))
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));
CREATE UNIQUE INDEX users_code_unique ON users (participant_code) WHERE participant_code IS NOT NULL;

-- Which facilitators run which group. A group can have more than one.
CREATE TABLE group_facilitators (
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

-- Single-use sign-in links. Only a hash of the token is stored.
CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);

-- Signed-in sessions. Only a hash of the cookie value is stored.
CREATE TABLE sessions (
  id_hash    TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- One row per participant per week (weeks 1 to 6).
CREATE TABLE tracker_weeks (
  id                   SERIAL PRIMARY KEY,
  participant_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_number          SMALLINT NOT NULL CHECK (week_number BETWEEN 1 AND 6),
  reflection_most_fatigued TEXT NOT NULL DEFAULT '',
  reflection_biggest_impact TEXT NOT NULL DEFAULT '',
  reflection_one_change    TEXT NOT NULL DEFAULT '',
  submitted_at         TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_id, week_number)
);

-- One row per day (0 = first Thursday ... 6 = Wednesday) and time of day.
CREATE TABLE tracker_entries (
  week_id     INTEGER NOT NULL REFERENCES tracker_weeks(id) ON DELETE CASCADE,
  day_index   SMALLINT NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  time_of_day TEXT NOT NULL CHECK (time_of_day IN ('morning', 'afternoon', 'evening')),
  score       SMALLINT CHECK (score BETWEEN 0 AND 10),
  activity    TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (week_id, day_index, time_of_day)
);

-- Who did what. Kept when a participant is deleted, but the link to the
-- person is removed and only their participant code is kept.
CREATE TABLE audit_log (
  id               BIGSERIAL PRIMARY KEY,
  at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_label      TEXT NOT NULL,
  action           TEXT NOT NULL,
  subject_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  subject_label    TEXT,
  group_id         INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  details          TEXT
);
CREATE INDEX audit_log_at ON audit_log (at DESC);
