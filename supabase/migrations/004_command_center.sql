-- ============================================================================
-- HELIX — Workout Command Center: coach-report ingest, deck ordering, dedupe
-- ============================================================================
-- The AI coach now delivers a strict JSON session report that the Command
-- Center turns into an editable widget deck before committing. These additive
-- columns carry: the report archive (JSONB), the HELIX-5 program-day identity,
-- the deck's exercise order, and an idempotency key so a double-pasted report
-- can never create a duplicate session.
-- Idempotent (ADD COLUMN / CREATE INDEX IF NOT EXISTS) — safe to run twice.
-- Run this ONCE in the Supabase SQL editor.
-- ============================================================================

ALTER TABLE workout_sessions
  -- Coach report's session.id (e.g. "2026-07-19-D1") — dedupe/idempotency key.
  ADD COLUMN IF NOT EXISTS client_session_id TEXT,
  -- HELIX-5 program-day identity: cb_a | legs_a | arms | cb_b | legs_b.
  -- Finer than split_day (which stays the coarse push/pull/legs/upper/lower
  -- enum) — lets session-intel match "same program day" exactly.
  ADD COLUMN IF NOT EXISTS day_key           TEXT,
  -- The full validated coach JSON (per-exercise status/note live here).
  ADD COLUMN IF NOT EXISTS coach_report      JSONB,
  -- Promoted from the report: the single action item for the next session.
  ADD COLUMN IF NOT EXISTS next_session_flag TEXT;

-- Partial unique index: legacy/manual/AI-path rows (NULL) stay unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_sessions_client_id
  ON workout_sessions(user_id, client_session_id)
  WHERE client_session_id IS NOT NULL;

ALTER TABLE workout_sets
  -- Deck position of the exercise within its session (all sets of one
  -- exercise share the value). NULL on legacy rows = implicit insert order.
  ADD COLUMN IF NOT EXISTS exercise_order INTEGER;
