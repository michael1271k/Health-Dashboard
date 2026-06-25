-- ============================================
-- Dev Seed Data
-- Run with: supabase db seed (after provisioning)
-- WARNING: only run against local dev instance
-- ============================================

-- Note: replace 'YOUR_USER_UUID' with your actual auth.users UUID after signing up

-- Sample exercises (PPL split)
-- These are inserted with ON CONFLICT DO NOTHING so they're idempotent
INSERT INTO exercises (user_id, name, name_he, split_day, muscle_groups, is_compound)
SELECT
  id AS user_id,
  name, name_he, split_day, muscle_groups, is_compound
FROM (VALUES
  -- Push
  ('Bench Press',       'לחיצת חזה',        'push', ARRAY['chest','triceps','shoulders'], true),
  ('Overhead Press',    'לחיצת כתפיים',     'push', ARRAY['shoulders','triceps'],         true),
  ('Incline DB Press',  'לחיצת ספסל עלייה', 'push', ARRAY['chest','shoulders'],           true),
  ('Dips',              'מתחים',             'push', ARRAY['chest','triceps'],              true),
  ('Lateral Raises',    'הרמות צדדיות',     'push', ARRAY['shoulders'],                   false),
  ('Tricep Pushdown',   'שכיבות שלישיות',   'push', ARRAY['triceps'],                     false),
  -- Pull
  ('Deadlift',          'מתיחת רגליים',     'pull', ARRAY['back','hamstrings','traps'],    true),
  ('Pull Ups',          'מתחים עליונים',    'pull', ARRAY['lats','biceps'],               true),
  ('Barbell Row',       'חתירה מוט',        'pull', ARRAY['back','biceps'],               true),
  ('Face Pulls',        'פוש פייס',         'pull', ARRAY['rear_delts','traps'],           false),
  ('Hammer Curls',      'פמות פטיש',        'pull', ARRAY['biceps','brachialis'],          false),
  ('Cable Row',         'חתירה כבל',        'pull', ARRAY['back','biceps'],               false),
  -- Legs
  ('Squat',             'סקוואט',           'legs', ARRAY['quads','glutes','hamstrings'],  true),
  ('Romanian Deadlift', 'RDL',              'legs', ARRAY['hamstrings','glutes'],           true),
  ('Leg Press',         'לחיצת רגליים',     'legs', ARRAY['quads','glutes'],               true),
  ('Walking Lunges',    'לאנגס',            'legs', ARRAY['quads','glutes'],               true),
  ('Leg Curls',         'פמות רגל',         'legs', ARRAY['hamstrings'],                   false),
  ('Calf Raises',       'פמות שוק',         'legs', ARRAY['calves'],                       false)
) AS data(name, name_he, split_day, muscle_groups, is_compound)
CROSS JOIN auth.users  -- inserts for each existing user
ON CONFLICT (user_id, name) DO NOTHING;

-- Default user goals
INSERT INTO user_goals (user_id, sleep_goal_hours, calorie_goal, protein_goal_g, carbs_goal_g, fat_goal_g, steps_goal, active_cal_goal, water_goal_ml)
SELECT id, 8.0, 2500, 180, 250, 80, 10000, 500, 3000
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
