# HELIX

**Precision health & fitness intelligence — your body, charted.**

HELIX is a personal, single-user PWA that turns raw Apple Health data into an
actionable performance dashboard: daily readiness scoring, a recovery "battery,"
weight/macro trends, and a fast workout logger with automatic PR detection.

> **Code convention:** comments describe *what the code does* — never release or
> development phases. No "Phase N" tags or temporary developmental labels in code
> comments, ever. Program/era names in data (e.g. "Helix Cut 5.1") are allowed.

> **The app never calls a model.** There is no `/api/ai` and no model SDK in the
> dependency tree. The weekly report is a copy-brief-out, paste-analysis-back
> loop performed by the user, deliberately.

## What it does

```
Apple Health  ──►  Native iOS app (HealthKit bridge)  ──►  /api/ingest
                                                                │
                                                                ▼
                                                        Supabase (Postgres)
                                                                │
                          ┌─────────────────────────────────────┴───────────────┐
                          ▼                                                      ▼
              Next.js PWA on Netlify                                Notion (daily-log mirror)
        (dashboard · charts · workout logger)                     best-effort per-DAY summary
```

1. **Ingest** — The native iOS app reads Apple Health via a Capacitor HealthKit
   bridge and POSTs the daily metrics to `/api/ingest`, authenticated with the
   signed-in user's Supabase JWT.
2. **Store** — Metrics and workouts are validated (Zod) and upserted into Supabase
   Postgres, the system of record for all high-volume, time-series data.
   **Supabase is also the schema-of-record**: there are no `.sql` migrations in
   this repo, so introspect the live database before assuming a column exists.
3. **Score** — Daily Score, recovery Battery, and Readiness Coach engines derive
   guidance from sleep, HRV, and training load.
4. **View** — A Next.js App Router PWA (installable, offline-capable via Serwist)
   renders the dashboard, charts, and workout logger.
5. **Mirror** — Changed days are written to a Notion database as a formatted day
   summary (best-effort; a Notion outage never blocks the app).

Workouts are tracked live in **Hevy** and transcribed into Helix afterwards — the
logger is a transcription surface, not a gym timer. Nothing in the app may assume
an in-progress session.

## Tech stack

- **Framework**: Next.js 15 (App Router) · React 19 · TypeScript
- **Styling**: Tailwind CSS v4 design tokens · shadcn/ui (Base UI primitives)
- **Data**: Supabase (Postgres, Auth, RLS) · TanStack Query (persisted to localStorage)
- **Charts**: Recharts (dynamically imported — never in a route's first load)
- **Motion**: framer-motion via `LazyMotion` in strict mode (`m.*` only, never `motion.*`)
- **PWA**: Serwist service worker
- **Native**: Capacitor 6 (iOS) with custom HealthKit and Face ID plugins
- **Integrations**: Notion REST (hand-rolled `fetch`, no SDK)
- **Validation**: Zod
- **Testing**: Vitest + Testing Library (unit) · Playwright (e2e)
- **Deployment**: Netlify (Node 22)

## Development

```bash
npm install
npm run dev        # development server (http://localhost:3000)
npm run build      # production build
npm run check      # next lint && tsc --noEmit — the gate before any commit
npm run test       # vitest unit tests
npm run typecheck  # TypeScript only
npm run lint       # ESLint only
npm run e2e        # Playwright end-to-end tests
npm run analyze    # production build with the bundle analyzer
npm run icons      # rasterise resources/icon.png into every PWA/iOS/widget icon
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in your values:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side service-role key (never exposed to client) |
| `NOTION_TOKEN` | Notion integration token for the daily-log mirror |
| `NOTION_DAILY_LOG_DB_ID` | Target Notion database ID |
| `NEXT_PUBLIC_APP_URL` | Public app URL (used for same-origin auth checks) |
| `NEXT_PUBLIC_BUILD_ID` | Inlined build id — the deploy-drift version gate compares it against `/api/version` |
| `NEXT_PUBLIC_DEV_EMAIL` / `NEXT_PUBLIC_DEV_PASSWORD` | Local dev sign-in |
| `NEXT_PUBLIC_BYPASS_EMAIL` / `NEXT_PUBLIC_BYPASS_PASSWORD` | The single-button `/auth` credentials |

`.env.local` is gitignored and must never be committed. On Netlify, set the same
variable names in **Site settings → Environment variables**.

## Design system

Obsidian & Ember. Every colour is exported from `src/lib/theme/palette.ts` —
never hardcode a hex in a component.

- Canvas `#0A0B0D` · hairline `#23262B` · text `#ECEEF2` · muted `#79808C`
- Signature `EMBER #E0703C` · jewel ramp: `SAPPHIRE` `EMERALD` `GOLD` `AMETHYST` `OXIDE`
- Grouped maps for domains that must not collide: `MACRO`, `SPLIT`, `SLEEP`, `BODY`
- **Type is the system stack** (`-apple-system`), because on the target device
  that *is* SF Pro. The three webfonts this file used to name were deleted in
  2026-08; they had not been loaded for two redesigns before that.

## Repo docs

- `CLAUDE.md` — the graphify knowledge-graph workflow (query it before grepping)
- `docs/native-ios.md` — Capacitor/HealthKit architecture
- `docs/ios-deploy-guide.md` — signing and device deployment
- `docs/watchos-install-loop.md` — the watch target's install quirks
