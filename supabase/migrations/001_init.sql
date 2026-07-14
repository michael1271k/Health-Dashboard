-- ============================================================================
-- HELIX — Consolidated initial schema
-- ============================================================================
-- Single pristine schema folding former migrations 001–015 (Apple-Health/ghost
-- + nutrition_phases-marker bits dropped). Apply to a fresh database, then run
-- the exercise seed (002_seed_exercises.sql) and `npx tsx scripts/seed_supabase.ts --apply`.
-- Idempotent (IF NOT EXISTS guards). All timestamps UTC. Single-user app.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  steps INTEGER, active_cal INTEGER, rest_hr INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS sleep_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hk_uuid TEXT UNIQUE,
  start_time TIMESTAMPTZ NOT NULL, end_time TIMESTAMPTZ NOT NULL,
  duration_min INTEGER NOT NULL,
  deep_min INTEGER DEFAULT 0, rem_min INTEGER DEFAULT 0, core_min INTEGER DEFAULT 0, awake_min INTEGER DEFAULT 0,
  sleep_score INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sleep_duration_positive CHECK (duration_min > 0)
);

CREATE TABLE IF NOT EXISTS nutrition_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hk_uuid TEXT UNIQUE,
  logged_at TIMESTAMPTZ NOT NULL, date DATE NOT NULL, meal_type TEXT,
  calories NUMERIC(8,2) NOT NULL DEFAULT 0, protein_g NUMERIC(8,2) NOT NULL DEFAULT 0,
  carbs_g NUMERIC(8,2) NOT NULL DEFAULT 0, fat_g NUMERIC(8,2) NOT NULL DEFAULT 0, fiber_g NUMERIC(8,2),
  phase TEXT,                              -- derived: 'cut' | 'maintenance' | 'bulk'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS body_composition (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hk_uuid TEXT UNIQUE,
  measured_at TIMESTAMPTZ NOT NULL, date DATE NOT NULL,
  weight_kg NUMERIC(5,2) NOT NULL, body_fat_pct NUMERIC(5,2), muscle_mass_kg NUMERIC(5,2),
  water_pct NUMERIC(5,2), bone_mass_kg NUMERIC(5,2), bmi NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS water_intake (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hk_uuid TEXT UNIQUE, logged_at TIMESTAMPTZ NOT NULL, date DATE NOT NULL,
  amount_ml NUMERIC(8,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hk_uuid TEXT UNIQUE, taken_at TIMESTAMPTZ NOT NULL, date DATE NOT NULL,
  name TEXT NOT NULL, quantity NUMERIC(8,2), unit TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exercises (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, name_he TEXT,
  split_day TEXT NOT NULL CHECK (split_day IN ('push','pull','legs','upper','lower')),
  muscle_groups TEXT[], is_compound BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notion_page_id TEXT, started_at TIMESTAMPTZ NOT NULL, ended_at TIMESTAMPTZ,
  split_day TEXT NOT NULL CHECK (split_day IN ('push','pull','legs','upper','lower')),
  notes TEXT, total_volume_kg NUMERIC(10,2), session_score INTEGER,
  set_count INTEGER, pr_count INTEGER, duration_min INTEGER, calories_burned INTEGER,
  avg_bpm INTEGER, report_md TEXT,
  migrated_from_notion BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'complete',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workout_sets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL, weight_kg NUMERIC(6,2) NOT NULL DEFAULT 0, reps INTEGER NOT NULL,
  rpe NUMERIC(3,1), is_pr BOOLEAN DEFAULT false, est_1rm_kg NUMERIC(6,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rpe_range CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10))
);

CREATE TABLE IF NOT EXISTS daily_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  sleep_score INTEGER CHECK (sleep_score BETWEEN 0 AND 100),
  nutrition_score INTEGER CHECK (nutrition_score BETWEEN 0 AND 100),
  activity_score INTEGER CHECK (activity_score BETWEEN 0 AND 100),
  workout_score INTEGER CHECK (workout_score BETWEEN 0 AND 100),
  recovery_score INTEGER CHECK (recovery_score BETWEEN 0 AND 100),
  battery_pct INTEGER CHECK (battery_pct BETWEEN 0 AND 100),
  finalized BOOLEAN NOT NULL DEFAULT FALSE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS user_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  sleep_goal_hours NUMERIC(4,1) DEFAULT 8.0, calorie_goal INTEGER DEFAULT 2500,
  protein_goal_g INTEGER DEFAULT 180, carbs_goal_g INTEGER DEFAULT 250, fat_goal_g INTEGER DEFAULT 80,
  steps_goal INTEGER DEFAULT 10000, active_cal_goal INTEGER DEFAULT 500, water_goal_ml INTEGER DEFAULT 3000,
  context_mode TEXT NOT NULL DEFAULT 'normal' CHECK (context_mode IN ('normal','travel','illness','emergency')),
  goal_preset TEXT,
  day_cutoff_hour INTEGER NOT NULL DEFAULT 0,
  unit_system TEXT NOT NULL DEFAULT 'kg' CHECK (unit_system IN ('kg','lb')),
  reduce_motion BOOLEAN NOT NULL DEFAULT false,
  auto_log_supplements BOOLEAN NOT NULL DEFAULT false,
  active_program TEXT NOT NULL DEFAULT 'axis5_hybrid',
  timezone TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  steps INTEGER, water_ml NUMERIC(8,1), sleep_minutes INTEGER,
  carbs_g NUMERIC(8,2), protein_g NUMERIC(8,2), fats_g NUMERIC(8,2),
  weight_kg NUMERIC(6,2), lean_mass_kg NUMERIC(6,2), bmi NUMERIC(5,2),
  training_minutes INTEGER, active_energy NUMERIC(8,1), body_fat_pct NUMERIC(5,2),
  standing_minutes INTEGER, avg_heart_rate INTEGER, avg_rest_heart_rate INTEGER,
  respiratory_rate NUMERIC(5,2), blood_oxygen NUMERIC(5,2),
  muscle_percent NUMERIC(5,2), water_percent NUMERIC(5,2), bone_mineral NUMERIC(6,2),
  visceral_fat NUMERIC(5,1), bmr NUMERIC(7,1),
  hrv_ms NUMERIC(6,2), exercise_minutes INTEGER, stand_hours INTEGER, vo2max NUMERIC(5,2),
  -- Apple Health metrics + Day Vault subjective fields
  wrist_temp_delta NUMERIC(4,2), time_in_daylight_min INTEGER, heart_rate_recovery INTEGER,
  effort_rating SMALLINT CHECK (effort_rating BETWEEN 1 AND 10),
  mood SMALLINT CHECK (mood BETWEEN 1 AND 5),
  journal_md TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'weekly' CHECK (type IN ('weekly')),
  period_start DATE NOT NULL, period_end DATE NOT NULL,
  content_md TEXT NOT NULL, session_summary_md TEXT, weight_report_md TEXT,
  metrics JSONB, notion_page_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, period_start, period_end)
);

-- Daily supplement protocol check-offs (hardcoded protocol lives in the app).
CREATE TABLE IF NOT EXISTS supplement_log (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  item_key TEXT NOT NULL,
  taken BOOLEAN NOT NULL DEFAULT false,
  taken_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date, item_key)
);

-- ── updated_at triggers ─────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['daily_metrics','workout_sessions','user_goals','daily_logs','supplement_log'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_%1$s_updated_at ON %1$s', t);
    EXECUTE format('CREATE TRIGGER set_%1$s_updated_at BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t);
  END LOOP;
END $$;

-- ── RLS (owner-only) ────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'daily_metrics','sleep_sessions','nutrition_entries','body_composition','water_intake',
    'supplements','exercises','workout_sessions','workout_sets','daily_scores','user_goals',
    'daily_logs','reports','supplement_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'user_owns_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', 'user_owns_' || t, t);
  END LOOP;
END $$;

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_daily_metrics_user_date     ON daily_metrics(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_sleep_sessions_user_start   ON sleep_sessions(user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_nutrition_entries_user_date ON nutrition_entries(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_body_composition_user_date  ON body_composition(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_water_intake_user_date      ON water_intake(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_supplements_user_date       ON supplements(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_date  ON workout_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workout_sets_session        ON workout_sets(session_id);
CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise_user  ON workout_sets(exercise_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_scores_user_date      ON daily_scores(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date        ON daily_logs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_reports_user_period         ON reports(user_id, period_start DESC);

-- ── Realtime publication ────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['daily_logs','daily_metrics','nutrition_entries','body_composition','sleep_sessions','workout_sessions','daily_scores','supplement_log'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ── Role grants ─────────────────────────────────────────────────────────────
-- CRITICAL after `drop schema public cascade`: the default Supabase grants are
-- gone, so even the service_role key (which bypasses RLS but NOT table GRANTs)
-- gets "permission denied". Restore them. RLS still scopes anon/authenticated
-- to their own rows; service_role bypasses RLS for the seeder.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- ── Multi-tenant household (profiles · roles · per-user ingest keys) ─────────
CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ingest_keys (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  secret TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, secret)
);
ALTER TABLE ingest_keys ENABLE ROW LEVEL SECURITY;

-- Auto-provision a profile on signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, split_part(NEW.email, '@', 1))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Role check WITHOUT recursive RLS (SECURITY DEFINER reads profiles directly).
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM profiles WHERE user_id = (SELECT auth.uid()) AND role = 'admin') $$;

-- Members see their own profile; admin sees the whole household.
DROP POLICY IF EXISTS profiles_self ON profiles;
CREATE POLICY profiles_self ON profiles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR private.is_admin());

-- Additive admin read on every data table (owner policies stay untouched).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'daily_metrics','sleep_sessions','nutrition_entries','body_composition',
    'water_intake','supplements','user_goals','workout_sessions','workout_sets',
    'daily_scores','daily_logs','reports','supplement_log'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS admin_reads_%I ON %I', t, t);
    EXECUTE format('CREATE POLICY admin_reads_%I ON %I FOR SELECT TO authenticated USING (private.is_admin())', t, t);
  END LOOP;
END $$;

-- Fast PR counting (partial index: only PR rows are indexed).
CREATE INDEX IF NOT EXISTS idx_workout_sets_user_pr ON workout_sets(user_id) WHERE is_pr;

-- One-round-trip day summary (security_invoker: RLS of the CALLER applies).
CREATE OR REPLACE VIEW day_summary WITH (security_invoker = true) AS
SELECT
  dl.user_id, dl.date,
  dl.steps, dl.water_ml, dl.sleep_minutes, dl.weight_kg,
  ds.score, ds.battery_pct,
  ne.calories, ne.protein_g AS n_protein_g, ne.carbs_g AS n_carbs_g, ne.fat_g AS n_fat_g, ne.phase,
  ws.session_count, ws.total_volume_kg, ws.first_split
FROM daily_logs dl
LEFT JOIN daily_scores ds ON ds.user_id = dl.user_id AND ds.date = dl.date
LEFT JOIN nutrition_entries ne ON ne.user_id = dl.user_id AND ne.date = dl.date AND ne.meal_type = 'daily'
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS session_count, SUM(w.total_volume_kg) AS total_volume_kg,
         MIN(w.split_day) AS first_split
  FROM workout_sessions w
  WHERE w.user_id = dl.user_id
    AND w.started_at >= dl.date::timestamptz
    AND w.started_at < (dl.date + 1)::timestamptz
) ws ON TRUE;

-- Realtime: make sure EVERY data table is in the publication (idempotent).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'daily_logs','nutrition_entries','daily_metrics','body_composition',
    'sleep_sessions','workout_sessions','daily_scores','supplement_log','water_intake','reports'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;


-- Notion export ledger (bulk "unexported" diff — one row per synced day) -------
CREATE TABLE IF NOT EXISTS notion_exports (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  page_url TEXT,
  PRIMARY KEY (user_id, date)
);
ALTER TABLE notion_exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_owns_notion_exports ON notion_exports;
CREATE POLICY user_owns_notion_exports ON notion_exports FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
