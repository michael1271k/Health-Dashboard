-- ============================================
-- Row Level Security Policies
-- Single-user app: each row belongs to auth.users(id)
-- ============================================

ALTER TABLE daily_metrics       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_composition    ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_intake        ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises           ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_scores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_goals          ENABLE ROW LEVEL SECURITY;

-- Generic policy factory: user can only see/change their own rows
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'daily_metrics','sleep_sessions','nutrition_entries',
    'body_composition','water_intake','supplements',
    'exercises','workout_sessions','workout_sets',
    'daily_scores','user_goals'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated
       USING (user_id = auth.uid())
       WITH CHECK (user_id = auth.uid())',
      'user_owns_' || t, t
    );
  END LOOP;
END;
$$;

-- Service role bypass (for webhook ingest API using service_role_key)
-- Service role already bypasses RLS by default in Supabase — no extra policy needed.
