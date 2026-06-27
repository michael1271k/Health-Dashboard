-- ============================================
-- Migration 011: daily_logs field refresh
-- ============================================
-- The custom iOS Shortcut no longer sends Apple's "move minutes" but does send
-- respiratory rate (andningsfrekvens) and a dedicated resting heart rate
-- (vilopuls, distinct from the day's average HR). Align the schema:
--   - drop  move_minutes
--   - add   respiratory_rate     NUMERIC(5,2)  (breaths / minute)
--   - add   avg_rest_heart_rate  INTEGER       (resting bpm)
--
-- IDEMPOTENT: IF EXISTS / IF NOT EXISTS guards make this safe to re-run.
-- ============================================

ALTER TABLE daily_logs DROP COLUMN IF EXISTS move_minutes;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS respiratory_rate    NUMERIC(5,2);
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS avg_rest_heart_rate INTEGER;
