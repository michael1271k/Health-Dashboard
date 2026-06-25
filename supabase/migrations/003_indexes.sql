-- ============================================
-- Performance Indexes
-- ============================================

-- Most queries filter by user_id + date range
CREATE INDEX idx_daily_metrics_user_date     ON daily_metrics(user_id, date DESC);
CREATE INDEX idx_sleep_sessions_user_start   ON sleep_sessions(user_id, start_time DESC);
CREATE INDEX idx_nutrition_entries_user_date ON nutrition_entries(user_id, date DESC);
CREATE INDEX idx_body_composition_user_date  ON body_composition(user_id, date DESC);
CREATE INDEX idx_water_intake_user_date      ON water_intake(user_id, date DESC);
CREATE INDEX idx_supplements_user_date       ON supplements(user_id, date DESC);
CREATE INDEX idx_workout_sessions_user_date  ON workout_sessions(user_id, started_at DESC);
CREATE INDEX idx_workout_sets_session        ON workout_sets(session_id);
CREATE INDEX idx_workout_sets_exercise_user  ON workout_sets(exercise_id, user_id, created_at DESC);
CREATE INDEX idx_daily_scores_user_date      ON daily_scores(user_id, date DESC);

-- Dedup lookups (hk_uuid columns already have UNIQUE constraint = implicit index)
-- Additional GIN index for Hebrew text search on notes
CREATE INDEX idx_workout_sessions_notes_gin ON workout_sessions USING gin(to_tsvector('simple', COALESCE(notes, '')));
