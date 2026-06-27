-- ============================================
-- Migration 009: Flat daily_logs table (Apple Shortcut ingest + AI completion)
-- ============================================
-- One row per day mirroring the Notion "Daily Log". The custom iOS Shortcut
-- POSTs the automated fields; advanced scale metrics (muscle_percent,
-- water_percent, bone_mineral, visceral_fat, bmr) default NULL and are filled
-- later by the AI chat completion ("השלמה מהמשקל").
--
-- IDEMPOTENT: IF NOT EXISTS guards make this safe to re-run.
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS daily_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date              DATE NOT NULL,

  -- ── Shortcut (automated) fields ──
  steps             INTEGER,
  water_ml          NUMERIC(8,1),
  sleep_minutes     INTEGER,
  carbs_g           NUMERIC(8,2),
  protein_g         NUMERIC(8,2),
  fats_g            NUMERIC(8,2),
  weight_kg         NUMERIC(6,2),
  lean_mass_kg      NUMERIC(6,2),
  bmi               NUMERIC(5,2),
  training_minutes  INTEGER,
  active_energy     NUMERIC(8,1),
  body_fat_pct      NUMERIC(5,2),
  move_minutes      INTEGER,
  standing_minutes  INTEGER,
  avg_heart_rate    INTEGER,
  blood_oxygen      NUMERIC(5,2),

  -- ── Advanced scale metrics (AI-completed; default NULL) ──
  muscle_percent    NUMERIC(5,2),
  water_percent     NUMERIC(5,2),
  bone_mineral      NUMERIC(6,2),
  visceral_fat      NUMERIC(5,1),
  bmr               NUMERIC(7,1),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_owns_daily_logs ON daily_logs;
CREATE POLICY user_owns_daily_logs ON daily_logs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Reuse the updated_at trigger function from migration 001
DROP TRIGGER IF EXISTS set_daily_logs_updated_at ON daily_logs;
CREATE TRIGGER set_daily_logs_updated_at
  BEFORE UPDATE ON daily_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
