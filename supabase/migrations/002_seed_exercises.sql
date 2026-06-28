-- ============================================
-- Migration 007: Seed workout exercise catalog + baseline session data
-- ============================================
-- Inserts the full Hevy-sourced exercise catalog for Push, Pull, and Legs/Lower
-- (stored as split_day = 'legs' — canonical for the combined split).
--
-- Also inserts one baseline workout_session + workout_sets per split so that
-- the progressive-overload memory UI shows "Previous: Xkg × Y" immediately.
--
-- IDEMPOTENT: re-running is safe.
--   - exercises: ON CONFLICT (user_id, name) DO NOTHING
--   - baseline sessions: guarded by WHERE NOT EXISTS on a sentinel note value
-- ============================================

-- ─── 1. Exercise catalog ─────────────────────────────────────────────────────

INSERT INTO exercises (user_id, name, name_he, split_day, muscle_groups, is_compound)
SELECT
  u.id               AS user_id,
  ex.name,
  ex.name_he,
  ex.split_day,
  ex.muscle_groups,
  ex.is_compound
FROM auth.users u
CROSS JOIN (VALUES
  -- ── PUSH ──────────────────────────────────────────────────────────────────
  ('Incline DB Bench Press',          'לחיצת ספסל עלייה DB',    'push', ARRAY['chest','shoulders'],            TRUE ),
  ('Chest Press (Machine)',            'לחיצת חזה מכונה',        'push', ARRAY['chest','triceps'],              TRUE ),
  ('Pec Deck (Butterfly)',             'כנפי פרפר',              'push', ARRAY['chest'],                        FALSE),
  ('Shoulder Press (DB)',              'לחיצת כתפיים DB',        'push', ARRAY['shoulders','triceps'],          TRUE ),
  ('Seated Lateral Raise (DB)',        'הרמות צד ישיבה',         'push', ARRAY['shoulders'],                    FALSE),
  ('Triceps Rope Pushdown',            'פשיטת מרפק חבל',         'push', ARRAY['triceps'],                     FALSE),
  ('Overhead Triceps Extension (Cable)','פשיטת מרפק מעל ראש',   'push', ARRAY['triceps'],                     FALSE),
  ('Side Plank',                       'פלאנק צד',               'push', ARRAY['core','obliques'],              FALSE),
  ('Russian Twist',                    'פיתול רוסי',             'push', ARRAY['core','obliques'],              FALSE),
  ('Lying Leg Raise',                  'הרמת רגליים שכיבה',      'push', ARRAY['core'],                        FALSE),

  -- ── PULL ──────────────────────────────────────────────────────────────────
  ('Lat Pulldown (Cable)',             'פולדאון כבל',            'pull', ARRAY['lats','biceps'],               TRUE ),
  ('Seated Cable Row (V Grip)',        'חתירה ישיבה V',          'pull', ARRAY['back','biceps'],               TRUE ),
  ('Face Pull',                        'פוש פייס',               'pull', ARRAY['rear_delts','traps'],           FALSE),
  ('Straight Arm Pulldown (Rope)',     'פשיטת ידיים ישרה',       'pull', ARRAY['lats'],                        FALSE),
  ('Bicep Curl (DB)',                  'כפיפת מרפק DB',          'pull', ARRAY['biceps'],                      FALSE),
  ('Hammer Curl (DB)',                 'פמות פטיש',              'pull', ARRAY['biceps','brachialis'],          FALSE),
  ('Preacher Curl (Machine)',          'כפיפת מרפק כס',          'pull', ARRAY['biceps'],                      FALSE),
  ('Crunch (Machine)',                 'בטן מכונה',              'pull', ARRAY['core'],                        FALSE),
  ('Bicycle Crunch',                   'כפיפת אופניים',          'pull', ARRAY['core','obliques'],              FALSE),

  -- ── LEGS / LOWER (split_day = 'legs') ────────────────────────────────────
  ('Leg Press Horizontal (Machine)',   'לחיצת רגליים אופקי',     'legs', ARRAY['quads','glutes'],               TRUE ),
  ('Romanian Deadlift (DB)',           'RDL DB',                  'legs', ARRAY['hamstrings','glutes'],          TRUE ),
  ('Hip Thrust (Machine)',             'דחיפת ירכיים מכונה',     'legs', ARRAY['glutes'],                      TRUE ),
  ('Hip Adduction (Machine)',          'כיסוי ירכיים מכונה',     'legs', ARRAY['inner_thigh'],                  FALSE),
  ('Leg Extension (Machine)',          'פשיטת ברך מכונה',         'legs', ARRAY['quads'],                       FALSE),
  ('Seated Leg Curl (Machine)',        'כפיפת ברך ישיבה',         'legs', ARRAY['hamstrings'],                  FALSE),
  ('Calf Press (Machine)',             'עליית שוק מכונה',         'legs', ARRAY['calves'],                      FALSE),
  ('Reverse Crunch',                   'כפיפה הפוכה',            'legs', ARRAY['core'],                        FALSE),
  ('Hollow Rock',                      'הולו רוק',               'legs', ARRAY['core'],                        FALSE)
) AS ex(name, name_he, split_day, muscle_groups, is_compound)
ON CONFLICT (user_id, name) DO NOTHING;

-- ─── 2. Baseline sessions for progressive-overload memory ────────────────────
-- One session per split (~7 days ago), using Epley est_1rm_kg = weight * (1 + reps/30).
-- Guarded by a sentinel in the notes field so re-running this migration does nothing.

DO $$
DECLARE
  v_user_id   UUID;
  v_push_id   UUID;
  v_pull_id   UUID;
  v_legs_id   UUID;
  v_base_date TIMESTAMPTZ := NOW() - INTERVAL '7 days';
BEGIN
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  IF v_user_id IS NULL THEN RETURN; END IF;

  -- ── PUSH baseline ──────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM workout_sessions
    WHERE user_id = v_user_id AND notes = '__seed_push__'
  ) THEN
    INSERT INTO workout_sessions
      (user_id, split_day, started_at, ended_at, notes, total_volume_kg, session_score)
    VALUES
      (v_user_id, 'push', v_base_date, v_base_date + INTERVAL '75 minutes',
       '__seed_push__', 2543.0, NULL)
    RETURNING id INTO v_push_id;

    INSERT INTO workout_sets
      (session_id, exercise_id, user_id, set_number, weight_kg, reps, is_pr, est_1rm_kg)
    SELECT v_push_id, e.id, v_user_id, 1, s.weight_kg, s.reps, TRUE,
           s.weight_kg * (1 + s.reps::numeric / 30)
    FROM (VALUES
      ('Incline DB Bench Press',           35.0,  12),
      ('Chest Press (Machine)',            37.5,  12),
      ('Pec Deck (Butterfly)',             52.5,  11),
      ('Shoulder Press (DB)',              30.0,   9),
      ('Seated Lateral Raise (DB)',        10.0,  13),
      ('Triceps Rope Pushdown',            15.0,  14),
      ('Overhead Triceps Extension (Cable)',10.0, 12),
      ('Side Plank',                        0.0,  55),  -- reps = seconds
      ('Russian Twist',                    10.0,  16),
      ('Lying Leg Raise',                   0.0,  13)
    ) AS s(name, weight_kg, reps)
    JOIN exercises e ON e.name = s.name AND e.user_id = v_user_id;
  END IF;

  -- ── PULL baseline ──────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM workout_sessions
    WHERE user_id = v_user_id AND notes = '__seed_pull__'
  ) THEN
    INSERT INTO workout_sessions
      (user_id, split_day, started_at, ended_at, notes, total_volume_kg, session_score)
    VALUES
      (v_user_id, 'pull', v_base_date + INTERVAL '2 days',
       v_base_date + INTERVAL '2 days' + INTERVAL '70 minutes',
       '__seed_pull__', 2358.0, NULL)
    RETURNING id INTO v_pull_id;

    INSERT INTO workout_sets
      (session_id, exercise_id, user_id, set_number, weight_kg, reps, is_pr, est_1rm_kg)
    SELECT v_pull_id, e.id, v_user_id, 1, s.weight_kg, s.reps, TRUE,
           s.weight_kg * (1 + s.reps::numeric / 30)
    FROM (VALUES
      ('Lat Pulldown (Cable)',          49.5,  11),
      ('Seated Cable Row (V Grip)',     42.5,  12),
      ('Face Pull',                     16.25, 12),
      ('Straight Arm Pulldown (Rope)',  17.5,  12),
      ('Bicep Curl (DB)',               18.0,  12),
      ('Hammer Curl (DB)',              18.0,  11),
      ('Preacher Curl (Machine)',       16.25, 11),
      ('Crunch (Machine)',              57.5,  12),
      ('Bicycle Crunch',                 0.0,   9)
    ) AS s(name, weight_kg, reps)
    JOIN exercises e ON e.name = s.name AND e.user_id = v_user_id;
  END IF;

  -- ── LEGS/LOWER baseline ────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM workout_sessions
    WHERE user_id = v_user_id AND notes = '__seed_legs__'
  ) THEN
    INSERT INTO workout_sessions
      (user_id, split_day, started_at, ended_at, notes, total_volume_kg, session_score)
    VALUES
      (v_user_id, 'legs', v_base_date + INTERVAL '4 days',
       v_base_date + INTERVAL '4 days' + INTERVAL '80 minutes',
       '__seed_legs__', 5157.0, NULL)
    RETURNING id INTO v_legs_id;

    INSERT INTO workout_sets
      (session_id, exercise_id, user_id, set_number, weight_kg, reps, is_pr, est_1rm_kg)
    SELECT v_legs_id, e.id, v_user_id, 1, s.weight_kg, s.reps, TRUE,
           s.weight_kg * (1 + s.reps::numeric / 30)
    FROM (VALUES
      ('Leg Press Horizontal (Machine)',  80.0,  10),
      ('Romanian Deadlift (DB)',          30.0,  12),
      ('Hip Thrust (Machine)',            27.5,  11),
      ('Hip Adduction (Machine)',         55.0,  14),
      ('Leg Extension (Machine)',         42.5,  12),
      ('Seated Leg Curl (Machine)',       45.0,  12),
      ('Calf Press (Machine)',            72.5,  11),
      ('Reverse Crunch',                   0.0,  15),
      ('Hollow Rock',                      0.0,  38)  -- reps = seconds
    ) AS s(name, weight_kg, reps)
    JOIN exercises e ON e.name = s.name AND e.user_id = v_user_id;
  END IF;

END $$;
