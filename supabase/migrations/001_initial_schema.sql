-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- VITAL Core Schema
-- ============================================
-- All timestamps stored in UTC
-- Single-user app: user_id always references auth.users

-- Daily aggregate metrics (one row per day per user)
CREATE TABLE IF NOT EXISTS daily_metrics (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  steps         INTEGER,
  active_cal    INTEGER,        -- active calories burned
  rest_hr       INTEGER,        -- resting heart rate bpm
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Sleep sessions (one row per sleep window)
CREATE TABLE IF NOT EXISTS sleep_sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hk_uuid          TEXT UNIQUE,              -- HealthKit sample UUID (for dedup)
  start_time        TIMESTAMPTZ NOT NULL,
  end_time          TIMESTAMPTZ NOT NULL,
  duration_min      INTEGER NOT NULL,         -- total sleep minutes
  deep_min          INTEGER DEFAULT 0,        -- deep sleep minutes
  rem_min           INTEGER DEFAULT 0,        -- REM minutes
  core_min          INTEGER DEFAULT 0,        -- core/light sleep minutes
  awake_min         INTEGER DEFAULT 0,
  sleep_score       INTEGER,                  -- computed 0-100 (or from Apple)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sleep_duration_positive CHECK (duration_min > 0)
);

-- Nutrition entries (one row per meal/day aggregate)
CREATE TABLE IF NOT EXISTS nutrition_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hk_uuid         TEXT UNIQUE,
  logged_at       TIMESTAMPTZ NOT NULL,
  date            DATE NOT NULL,
  meal_type       TEXT,                         -- breakfast/lunch/dinner/snack/daily
  calories        NUMERIC(8,2) NOT NULL DEFAULT 0,
  protein_g       NUMERIC(8,2) NOT NULL DEFAULT 0,
  carbs_g         NUMERIC(8,2) NOT NULL DEFAULT 0,
  fat_g           NUMERIC(8,2) NOT NULL DEFAULT 0,
  fiber_g         NUMERIC(8,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Body composition (from Xiaomi scale via Apple Health)
CREATE TABLE IF NOT EXISTS body_composition (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hk_uuid         TEXT UNIQUE,
  measured_at     TIMESTAMPTZ NOT NULL,
  date            DATE NOT NULL,
  weight_kg       NUMERIC(5,2) NOT NULL,
  body_fat_pct    NUMERIC(5,2),
  muscle_mass_kg  NUMERIC(5,2),
  water_pct       NUMERIC(5,2),
  bone_mass_kg    NUMERIC(5,2),
  bmi             NUMERIC(5,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Water intake
CREATE TABLE IF NOT EXISTS water_intake (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hk_uuid     TEXT UNIQUE,
  logged_at   TIMESTAMPTZ NOT NULL,
  date        DATE NOT NULL,
  amount_ml   NUMERIC(8,2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Supplement tracking
CREATE TABLE IF NOT EXISTS supplements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hk_uuid     TEXT UNIQUE,
  taken_at    TIMESTAMPTZ NOT NULL,
  date        DATE NOT NULL,
  name        TEXT NOT NULL,
  quantity    NUMERIC(8,2),
  unit        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exercise definitions (PPL split catalog)
CREATE TABLE IF NOT EXISTS exercises (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  name_he     TEXT,                             -- Hebrew name
  split_day   TEXT NOT NULL CHECK (split_day IN ('push','pull','legs')),
  muscle_groups TEXT[],
  is_compound BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Workout sessions
CREATE TABLE IF NOT EXISTS workout_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notion_page_id  TEXT,                         -- Notion page ID after sync
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  split_day       TEXT NOT NULL CHECK (split_day IN ('push','pull','legs')),
  notes           TEXT,                         -- Hebrew notes supported
  total_volume_kg NUMERIC(10,2),               -- computed: Σ(weight × reps)
  session_score   INTEGER,                      -- computed 0-100
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workout sets (individual sets within a session)
CREATE TABLE IF NOT EXISTS workout_sets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id     UUID NOT NULL REFERENCES exercises(id),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  set_number      INTEGER NOT NULL,
  weight_kg       NUMERIC(6,2) NOT NULL DEFAULT 0,
  reps            INTEGER NOT NULL,
  rpe             NUMERIC(3,1),                -- Rate of Perceived Exertion 1-10
  is_pr           BOOLEAN DEFAULT false,        -- auto-detected personal record
  est_1rm_kg      NUMERIC(6,2),               -- Epley: weight × (1 + reps/30)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rpe_range CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10))
);

-- Daily scores (computed + cached)
CREATE TABLE IF NOT EXISTS daily_scores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  score           INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  sleep_score     INTEGER CHECK (sleep_score >= 0 AND sleep_score <= 100),
  nutrition_score INTEGER CHECK (nutrition_score >= 0 AND nutrition_score <= 100),
  activity_score  INTEGER CHECK (activity_score >= 0 AND activity_score <= 100),
  workout_score   INTEGER CHECK (workout_score >= 0 AND workout_score <= 100),
  recovery_score  INTEGER CHECK (recovery_score >= 0 AND recovery_score <= 100),
  battery_pct     INTEGER CHECK (battery_pct >= 0 AND battery_pct <= 100),
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- User goals (configurable targets for score calculation)
CREATE TABLE IF NOT EXISTS user_goals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  sleep_goal_hours  NUMERIC(4,1) DEFAULT 8.0,
  calorie_goal      INTEGER DEFAULT 2500,
  protein_goal_g    INTEGER DEFAULT 180,
  carbs_goal_g      INTEGER DEFAULT 250,
  fat_goal_g        INTEGER DEFAULT 80,
  steps_goal        INTEGER DEFAULT 10000,
  active_cal_goal   INTEGER DEFAULT 500,
  water_goal_ml     INTEGER DEFAULT 3000,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_daily_metrics_updated_at
  BEFORE UPDATE ON daily_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workout_sessions_updated_at
  BEFORE UPDATE ON workout_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_goals_updated_at
  BEFORE UPDATE ON user_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
