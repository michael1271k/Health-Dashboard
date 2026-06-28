-- ============================================
-- Migration 013: Weekly report "files" (Phase 8)
-- ============================================
-- Each weekly page in Notion holds TWO child subpages — a Gym Session Summary
-- and a Weight Management Report. Store them as distinct columns so the
-- "File System" UI can present each week (folder) with its two files.
-- content_md keeps the week's overview/callout. Idempotent.
-- ============================================

ALTER TABLE reports ADD COLUMN IF NOT EXISTS session_summary_md TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS weight_report_md   TEXT;
