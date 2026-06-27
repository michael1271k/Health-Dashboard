-- ============================================
-- Migration 012: Clean-slate purge of transactional user data (Phase 7)
-- ============================================
-- Wipes ALL historical/transactional rows for the single app user so the Notion
-- re-seed (historical_seed.sql) lands on a 100% clean slate — no duplicate,
-- partial, or messy rows.
--
-- PRESERVES the `exercises` catalog and `user_goals`/settings (deleting those
-- would break the logger and reset your nutrition preset + targets).
--
-- Run this alone to wipe without reseeding, OR rely on the identical wipe header
-- baked into historical_seed.sql. Idempotent / safe to re-run.
-- ============================================

DO $$
DECLARE
  uid UUID := (SELECT id FROM auth.users ORDER BY created_at LIMIT 1);
BEGIN
  IF uid IS NULL THEN
    RAISE NOTICE 'No auth user found — nothing to purge.';
    RETURN;
  END IF;

  -- Order matters: children before parents (workout_sets → workout_sessions).
  DELETE FROM workout_sets       WHERE user_id = uid;
  DELETE FROM workout_sessions   WHERE user_id = uid;
  DELETE FROM nutrition_entries  WHERE user_id = uid;
  DELETE FROM body_composition   WHERE user_id = uid;
  DELETE FROM daily_metrics      WHERE user_id = uid;
  DELETE FROM sleep_sessions     WHERE user_id = uid;
  DELETE FROM water_intake       WHERE user_id = uid;
  DELETE FROM supplements        WHERE user_id = uid;
  DELETE FROM daily_scores       WHERE user_id = uid;
  DELETE FROM daily_logs         WHERE user_id = uid;
  DELETE FROM reports            WHERE user_id = uid;

  RAISE NOTICE 'Purged transactional data for user %, preserved exercises + user_goals.', uid;
END $$;
