# VITAL Supabase Setup

## Provisioning

1. Create a Supabase project at https://supabase.com
2. Copy the Project URL and anon/service_role keys into `.env.local`
3. Run migrations:
   ```bash
   # Option A: Supabase CLI (recommended)
   npx supabase db push

   # Option B: Run SQL directly in Supabase Dashboard → SQL Editor
   # Run migrations in order: 001, 002, 003
   ```
4. Run seed (optional, populates PPL exercise catalog):
   ```bash
   npx supabase db seed
   ```

## Tables

| Table | Description |
|---|---|
| `daily_metrics` | Steps, active calories, resting HR per day |
| `sleep_sessions` | Sleep windows with stage breakdown |
| `nutrition_entries` | Meals/macros from MFP via Apple Health |
| `body_composition` | Weight + body fat from Xiaomi scale |
| `water_intake` | Water from WaterLama via Apple Health |
| `supplements` | Supplement logs from Apple Health |
| `exercises` | PPL exercise catalog (with Hebrew names) |
| `workout_sessions` | Logged workout sessions |
| `workout_sets` | Individual sets within sessions |
| `daily_scores` | Computed daily scores (cached) |
| `user_goals` | User-configured targets |

## Auth

Magic link (passwordless) email auth. Configure email templates in Supabase Dashboard → Auth → Email Templates.
