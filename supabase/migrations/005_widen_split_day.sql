-- ============================================
-- Migration 005: Widen split_day CHECK for PPL+ split
-- Adds 'upper' and 'lower' to support the full schedule:
--   Sun=Push, Mon=Pull, Tue=Legs, Wed=Rest, Thu=Upper, Fri=Lower, Sat=Rest
-- ============================================

-- exercises table
ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_split_day_check;
ALTER TABLE exercises ADD CONSTRAINT exercises_split_day_check
  CHECK (split_day IN ('push', 'pull', 'legs', 'upper', 'lower'));

-- workout_sessions table
ALTER TABLE workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_split_day_check;
ALTER TABLE workout_sessions ADD CONSTRAINT workout_sessions_split_day_check
  CHECK (split_day IN ('push', 'pull', 'legs', 'upper', 'lower'));
