-- ============================================
-- Migration 010: Supabase Realtime publication
-- ============================================
-- Add the metric tables to the `supabase_realtime` publication so the web app
-- receives postgres_changes events and auto-refreshes every open tab when the
-- iOS Shortcut ingest (or a manual edit) writes new data.
--
-- IDEMPOTENT: each table is only added if not already a member of the
-- publication, so this is safe to re-run.
-- ============================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'daily_logs', 'daily_metrics', 'nutrition_entries',
    'body_composition', 'sleep_sessions', 'workout_sessions', 'daily_scores'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
