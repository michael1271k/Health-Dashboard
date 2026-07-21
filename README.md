# HELIX

**Precision health & fitness intelligence — your body, charted.**

HELIX is a personal, single-user PWA that turns raw Apple Health data into an
actionable performance dashboard: daily readiness scoring, a recovery "battery,"
weight/macro trends, and a fast PPL workout logger with automatic PR detection — all
mirrored to Notion for a human-friendly training log.

> **Code convention:** comments describe *what the code does* — never release or
> development phases. No "Phase N" tags or temporary developmental labels in code
> comments, ever. Program/era names in data (e.g. "Helix Cut 5.1") are allowed.

## What it does

```
Apple Health  ──►  Native iOS app (HealthKit bridge)  ──►  /api/ingest
                                                                │
                                                                ▼
                                                        Supabase (Postgres)
                                                                │
                          ┌─────────────────────────────────────┴───────────────┐
                          ▼                                                      ▼
              Next.js PWA on Netlify                                Notion (gym-log mirror)
        (dashboard · charts · workout logger)                    best-effort per-session page
```

1. **Ingest** — The native iOS app reads Apple Health via a Capacitor HealthKit
   bridge and POSTs the daily metrics to `/api/ingest`, authenticated with the
   signed-in user's Supabase JWT.
2. **Store** — Metrics and workouts are validated (Zod) and upserted into Supabase
   Postgres, the system of record for all high-volume, time-series data.
3. **Score** — Daily Score, recovery Battery, and Readiness Coach engines derive
   guidance from sleep, HRV, and training load.
4. **View** — A Next.js App Router PWA (installable, offline-capable via Serwist)
   renders the dashboard, charts, and workout logger.
5. **Mirror** — Each saved gym session is written to a Notion database as a formatted
   page (best-effort; a Notion outage never blocks the app).

## Tech stack

- **Framework**: Next.js 15 (App Router) · React 19
- **Styling**: Tailwind CSS v4 design tokens · shadcn/ui v4 (Base UI primitives)
- **Data**: Supabase (Postgres, Auth, RLS) · TanStack Query
- **Charts**: Recharts · **3D**: react-three-fiber (battery orb)
- **PWA**: Serwist service worker
- **Integrations**: Notion API (`@notionhq/client`)
- **Validation**: Zod
- **Testing**: Vitest + Testing Library (unit) · Playwright (e2e)
- **Deployment**: Netlify

## Development

```bash
npm install
npm run dev        # development server (http://localhost:3000)
npm run build      # production build
npm run test       # vitest unit tests
npm run typecheck  # TypeScript check
npm run e2e        # Playwright end-to-end tests
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in your values:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side service-role key (never exposed to client) |
| `NOTION_TOKEN` | Notion integration token for the gym-log mirror |
| `NOTION_GYM_DB_ID` | Target Notion database ID for sessions |
| `NEXT_PUBLIC_APP_URL` | Public app URL (used for same-origin auth checks) |

`.env.local` is gitignored and must never be committed. On Netlify, set the same
variable names in **Site settings → Environment variables**.

## Design system

- `primary` `#00E5A0` (electric mint) · `energy` `#7C5CFF` (vivid purple)
- `bg` `#0B0E13` (deep navy-black) · `surface` `#141A22` · `border` `#243040`
- Fonts: Outfit (headings) · Inter (body) · JetBrains Mono (numbers)
