-- W2 addendum — `personal_records.floor_value` (review finding HIGH-3).
-- Paste AFTER w2-generic-model.sql and w2-seed-founder.sql. Idempotent.
--
-- The natural key (user_id, exercise_key, axis) holds ONE row per axis, so the
-- record that beats an asserted floor REPLACES the floor row. Deleting that
-- session then dropped the bar to whatever the remaining sets could account
-- for. A record row now carries the floor it stands on; the phone's `retract`
-- hands the axis back to the floor instead of emptying it.

alter table public.personal_records
  add column if not exists floor_value numeric;

comment on column public.personal_records.floor_value is
  'The asserted floor this record beat (session rows only); retracting the session restores a session-less floor row at this value.';

-- Backfill: every seeded floor that a live record already stood above at seed
-- time was dropped by the seed's `do update … where value < excluded.value`;
-- it lives on here, on the record that beat it. Same 21 values as the seed.
update public.personal_records r
set floor_value = f.value
from (values
    ('Calf Press', 'weight', 72.5),
    ('Incline DB Press', 'volume', 432),
    ('Lat Pulldown', 'weight', 49.5),
    ('Lat Pulldown', 'e1rm', 67.81),
    ('Lat Pulldown', 'volume', 585),
    ('Leg Extension', 'weight', 42.5),
    ('Leg Extension', 'e1rm', 59.86),
    ('Leg Extension', 'volume', 600),
    ('Leg Press', 'weight', 80),
    ('Leg Press', 'e1rm', 109.59),
    ('Leg Press', 'volume', 980),
    ('Overhead Triceps Extension', 'weight', 12.5),
    ('Pec Deck', 'weight', 55),
    ('Pec Deck', 'e1rm', 75.34),
    ('Rope Triceps Pushdown', 'e1rm', 22.5),
    ('Rope Triceps Pushdown', 'volume', 225),
    ('Seated Cable Row (V-Grip)', 'e1rm', 62.3),
    ('Seated Cable Row (V-Grip)', 'volume', 595),
    ('Seated Leg Curl', 'weight', 50),
    ('Seated Leg Curl', 'e1rm', 73.53),
    ('Seated Leg Curl', 'volume', 712.5),
    ('Shoulder Press', 'weight', 31),
    ('Shoulder Press', 'e1rm', 42.25),
    ('Straight-Arm Pulldown', 'weight', 17.5),
    ('Straight-Arm Pulldown', 'e1rm', 24.65)
) as f(exercise_key, axis, value)
where r.user_id = 'f405d57b-d09f-4a2e-8a33-0c112f2ec34c'::uuid
  and r.exercise_key = f.exercise_key
  and r.axis = f.axis
  and r.session_id is not null
  and r.floor_value is null
  and r.value > f.value;

-- Verify: expect one column row, and the backfilled count.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'personal_records' and column_name = 'floor_value';
select count(*) as records_carrying_a_floor
from public.personal_records
where user_id = 'f405d57b-d09f-4a2e-8a33-0c112f2ec34c'::uuid and floor_value is not null;
