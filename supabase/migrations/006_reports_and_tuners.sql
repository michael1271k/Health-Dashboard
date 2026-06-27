-- ============================================
-- Migration 006: AI reports table, user_goals tuner columns
-- ============================================
-- IMPORTANT: the original 006 attempted to add a BEFORE INSERT trigger on
-- auth.users (signup allowlist). Hosted Supabase forbids operations on the
-- auth schema (ERROR 42501). That block has been REMOVED — signups are
-- already blocked via the Supabase dashboard (enable_signup = false).
--
-- This migration is fully re-runnable (IF NOT EXISTS / DROP IF EXISTS guards).
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

-- Drop first so this migration is idempotent when re-run after a failed attempt
DROP POLICY IF EXISTS user_owns_reports ON reports;

CREATE POLICY user_owns_reports ON reports
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Context mode + preset columns on user_goals
ALTER TABLE user_goals
  ADD COLUMN IF NOT EXISTS context_mode TEXT NOT NULL DEFAULT 'normal'
    CHECK (context_mode IN ('normal', 'travel', 'illness', 'emergency')),
  ADD COLUMN IF NOT EXISTS goal_preset TEXT;
