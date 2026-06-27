-- ============================================
-- Migration 008: Session metrics + AI report + Notion-migration flag
-- ============================================
-- Adds session-level metrics (populated by the AI chat logger and the
-- one-time Notion → Supabase historical import) plus a generated report body.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS guards make this safe to re-run.
-- ============================================

ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS set_count           INTEGER,
  ADD COLUMN IF NOT EXISTS pr_count            INTEGER,
  ADD COLUMN IF NOT EXISTS duration_min        INTEGER,
  ADD COLUMN IF NOT EXISTS calories_burned     INTEGER,
  ADD COLUMN IF NOT EXISTS avg_bpm             INTEGER,
  ADD COLUMN IF NOT EXISTS report_md           TEXT,
  ADD COLUMN IF NOT EXISTS migrated_from_notion BOOLEAN NOT NULL DEFAULT FALSE;

-- Helps the historical-import dedupe (user + day + split) and weekly grouping.
CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_started
  ON workout_sessions (user_id, started_at);
