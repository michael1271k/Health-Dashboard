-- ============================================
-- Migration 006: AI reports table, user_goals tuner columns,
--                signup allowlist trigger
-- ============================================

-- Enable UUID extension (idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- AI-generated weekly (and future) reports
CREATE TABLE IF NOT EXISTS reports (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type           TEXT NOT NULL DEFAULT 'weekly' CHECK (type IN ('weekly')),
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  content_md     TEXT NOT NULL,          -- Markdown report body
  metrics        JSONB,                  -- Raw 7-day aggregate used for generation
  notion_page_id TEXT,                   -- Backfilled after Notion push
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, period_start, period_end)
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_owns_reports ON reports
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Context mode + preset columns on user_goals
ALTER TABLE user_goals
  ADD COLUMN IF NOT EXISTS context_mode TEXT NOT NULL DEFAULT 'normal'
    CHECK (context_mode IN ('normal', 'travel', 'illness', 'emergency')),
  ADD COLUMN IF NOT EXISTS goal_preset TEXT;

-- Signup allowlist: only michael127k@gmail.com may create an account
-- (defence-in-depth — the primary gate is enable_signup=false in the dashboard)
CREATE OR REPLACE FUNCTION auth.enforce_signup_allowlist()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM 'michael127k@gmail.com' THEN
    RAISE EXCEPTION 'Signups are restricted to the app owner.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_signup_allowlist ON auth.users;
CREATE TRIGGER enforce_signup_allowlist
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION auth.enforce_signup_allowlist();
