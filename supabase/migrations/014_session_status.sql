-- ============================================
-- Migration 014: Workout session status (Phase 9 — Ghost Sessions)
-- ============================================
-- Auto-detected Apple Health workouts (duration + calories, no sets) land as
-- 'ghost' sessions that prompt a "Complete Report". Fully logged sessions are
-- 'complete'. Idempotent.
-- ============================================

ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'complete';
