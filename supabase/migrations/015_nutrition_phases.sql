-- ============================================
-- Migration 015: Nutrition phases / timeline markers (Phase 9)
-- ============================================
-- The Cut/Maintenance/Bulk modes become dated timeline markers: each row sets a
-- goal preset effective from a date forward, so nutrition data can be coloured
-- and filtered by the active phase. Idempotent.
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS nutrition_phases (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode           TEXT NOT NULL,            -- 'cut' | 'maintenance' | 'bulk'
  calorie_goal   INTEGER,
  protein_g      INTEGER,
  carbs_g        INTEGER,
  fat_g          INTEGER,
  effective_from DATE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, effective_from)
);

ALTER TABLE nutrition_phases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_owns_nutrition_phases ON nutrition_phases;
CREATE POLICY user_owns_nutrition_phases ON nutrition_phases
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_nutrition_phases_user_date ON nutrition_phases(user_id, effective_from);
