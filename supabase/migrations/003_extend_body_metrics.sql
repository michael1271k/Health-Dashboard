-- ============================================================================
-- HELIX — Extend body_composition + nutrition_entries for the full Notion baseline
-- ============================================================================
-- The Notion "📅 Daily Log" carries a complete InBody-style breakdown that the
-- original 6-column body_composition table could not hold. These additive
-- columns give every Notion metric a home so the historical import loses nothing.
-- Idempotent (ADD COLUMN IF NOT EXISTS) — safe to run more than once.
-- Run this ONCE in the Supabase SQL editor BEFORE scripts/import_notion.ts.
-- ============================================================================

ALTER TABLE body_composition
  ADD COLUMN IF NOT EXISTS fat_mass_kg             NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS body_water_mass_kg      NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS protein_mass_kg         NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS muscle_pct              NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS protein_pct             NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS bone_mineral_pct        NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS skeletal_muscle_mass_kg NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS fat_free_mass_kg        NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS waist_hip_ratio         NUMERIC(5,3),
  ADD COLUMN IF NOT EXISTS visceral_fat            NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS bmr                     NUMERIC(7,1);

ALTER TABLE nutrition_entries
  ADD COLUMN IF NOT EXISTS target_kcal INTEGER;
