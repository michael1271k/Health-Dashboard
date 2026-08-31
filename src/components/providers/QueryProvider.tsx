'use client'

import { QueryClient, defaultShouldDehydrateQuery } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { useState } from 'react'

/**
 * Map/Set query data does NOT survive the JSON round-trip of persistence —
 * it deserializes as a plain `{}`, and the next hard load hands components an
 * object without .get()/.has(), crashing the first render (the "*.get is not
 * a function" refresh-crash family). Those queries (useExerciseMap,
 * useExerciseMemory, useExerciseSetHistory, useSupplements) are cheap to
 * refetch — just never persist them.
 *
 * THE CHECK USED TO BE TOP-LEVEL ONLY, on the assumption that "all our Map/Set
 * payloads are the query data itself". `useMonthActivity` broke that assumption:
 * its data was `{ workoutDates: Set, dataDates: Set }`, an object CONTAINING
 * Sets, so the guard passed it, both Sets persisted as `{}`, and the Momentum
 * calendar died on cold open with `workoutDates.has is not a function`.
 *
 * It now walks nested values too, so the next hook that hides a Map/Set one
 * level down silently skips persistence instead of shipping a launch crash.
 * (`useMonthActivity` itself returns plain arrays now — this is the net.)
 *
 * Depth is capped: query payloads here are shallow view models, and an
 * unbounded walk would scan large row arrays on every dehydrate.
 */
function isJsonSafe(data: unknown, depth = 3): boolean {
  if (data instanceof Map || data instanceof Set) return false
  if (depth <= 0 || data === null || typeof data !== 'object') return true
  if (Array.isArray(data)) return data.every((v) => isJsonSafe(v, depth - 1))
  return Object.values(data as Record<string, unknown>).every((v) => isJsonSafe(v, depth - 1))
}

/**
 * Per-query size cap on what gets persisted.
 *
 * The restore is a SYNCHRONOUS `JSON.parse` of the whole blob, on the main
 * thread, before children render — so the persisted cache is paid for on every
 * cold start whether or not the route that wrote it is the one being opened.
 * That trade is worth it for a view model and not worth it for a thousand rows:
 * `useContinuum(true)` pulls the entire history, and the timeline hooks hold
 * hundreds of days. Those refetch in under a second anyway.
 *
 * A cap rather than a key allowlist, because an allowlist goes stale silently —
 * the next big query simply is not on it and nobody notices. This bounds the
 * cost by the thing that actually costs, whatever it is called. The stringify
 * runs on dehydrate, which is throttled to 2s and off the critical path.
 */
const MAX_PERSISTED_BYTES = 96 * 1024

/**
 * ── AND A BUDGET FOR THE WHOLE BLOB ──────────────────────────────────────────
 *
 * The per-query cap above bounds the biggest entry and nothing else. There are
 * ~140 distinct `queryKey` declarations in `lib/`, `gcTime` is 30 minutes, and
 * the cache accretes every query touched inside that window — so the ceiling
 * was 140 × 96 KB against WebKit's ~5 MB ORIGIN quota, which this blob shares
 * with nineteen other `helix_*` keys including the live session draft.
 *
 * Two things go wrong at the top of that range, and the second is worse than
 * the first. The restore is a synchronous `JSON.parse` before children render,
 * so growth is paid on every cold start whether or not the route that wrote it
 * is the one being opened. And an over-quota origin makes EVERY
 * `localStorage.setItem` throw — including the draft autosave, which is the one
 * write in this app that must never fail.
 *
 * So dehydration takes a budget. Queries are admitted newest-first, which is
 * the right order for a cache whose purpose is to paint the last screen you
 * looked at, and admission stops once the budget is spent. The counter resets
 * on each dehydrate pass; `shouldDehydrateQuery` is called once per query per
 * pass, in the order the cache holds them, so `dataUpdatedAt` has to be
 * compared against the pass rather than assumed sorted — hence the two-stage
 * check rather than a running total alone.
 */
const MAX_TOTAL_PERSISTED_BYTES = 1.5 * 1024 * 1024

function sizeOf(data: unknown): number {
  try { return JSON.stringify(data).length } catch { return Number.POSITIVE_INFINITY }
}

function isSmallEnough(data: unknown): boolean {
  return sizeOf(data) <= MAX_PERSISTED_BYTES
}

type PersistableQuery = Parameters<typeof defaultShouldDehydrateQuery>[0]

/** Everything the per-query rules already allow, before the budget applies. */
function isEligible(q: PersistableQuery): boolean {
  return defaultShouldDehydrateQuery(q) && isJsonSafe(q.state.data) && isSmallEnough(q.state.data)
}

/**
 * Which query hashes fit inside the budget, newest data first.
 *
 * Newest-first because the point of this cache is to paint the screen you were
 * last on. A cache that dropped the freshest rows to keep an hour-old one would
 * be paying the whole restore cost for the wrong screen.
 */
function admitNewestFirst(cache: { getAll: () => PersistableQuery[] }): Set<string> {
  const candidates = cache.getAll()
    .filter(isEligible)
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)

  const keep = new Set<string>()
  let used = 0
  for (const q of candidates) {
    const bytes = sizeOf(q.state.data)
    if (used + bytes > MAX_TOTAL_PERSISTED_BYTES) break
    used += bytes
    keep.add(q.queryHash)
  }
  return keep
}

/**
 * `shouldDehydrateQuery` is asked one query at a time and cannot see the pass it
 * belongs to, so the admission set is computed once and reused for the rest of
 * it. Dehydration is throttled to 2s (see `throttleTime` below), so a 500 ms
 * window is comfortably inside one pass and comfortably outside the next.
 */
const admission = { at: 0, keep: new Set<string>() }
const PASS_WINDOW_MS = 500

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // App-open paradigm: the app pushes fresh HealthKit data exactly when
            // it foregrounds, and `invalidateHealthData` / `invalidateWorkoutData`
            // explicitly revalidate after every sync and every write. Freshness
            // therefore comes from those events, NOT from polling on mount.
            //
            // PERF: this used to be `refetchOnMount: 'always'` with a 15s
            // staleTime. 'always' ignores staleTime by design, so EVERY mount
            // refetched — and since each tab is a route that unmounts its
            // predecessor, every single tab switch re-ran the whole page's query
            // fan-out against Supabase before it would paint fresh. That is the
            // sluggishness: not render cost, but a network round-trip per query
            // per navigation. `true` keeps the same cold-open behaviour (a
            // restored cache older than staleTime is stale, so it still
            // revalidates) while making an in-session tab switch instant.
            staleTime: 60 * 1000,
            gcTime: 30 * 60 * 1000,
            // OFF deliberately. A live Supabase WebSocket already invalidates
            // the exact keys a changed table feeds (RealtimeProvider), so
            // refetching every mounted query on focus is pure duplicate work —
            // and on iOS, tapping between the app and anything else fired it
            // constantly. Freshness comes from realtime events and from the
            // reconnect path below, not from the window regaining focus.
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            refetchOnMount: true,
            retry: 1,
          },
        },
      }),
  )

  // Zero-latency cold open: the query cache persists to localStorage, so the
  // PWA paints yesterday's data INSTANTLY on launch and refetches in background.
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      key: 'helix_query_cache',
      throttleTime: 2_000,
      // A corrupted/truncated cache blob must NEVER throw during restore (that
      // crashes the app on foreground). Bad JSON → treat as no cache.
      deserialize: (cached) => {
        try { return JSON.parse(cached) } catch { return undefined as never }
      },
    }),
  )

  return (
    <PersistQueryClientProvider
      client={queryClient}
      // Bump the buster on any deploy that changes cached query/component
      // shapes so a device with an older persisted cache discards it instead
      // of feeding stale-shaped data into new components. (v17: unified reports
      // schema — the ['reports','list'] rows changed shape.)
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        // v21: MUST bump. `PrBaselines` gained `bestSessionVolume` (the fifth PR
        // axis) and its values now carry the asserted all-time floor from
        // prTruth.ts. A cache written before either rehydrates a baseline set
        // that is BOTH missing a field and too low, which would flag records
        // that are not records — the exact bug the floor exists to end.
        //
        // v20 was the previous bump: `session-detail` sets gained `prAxes`, and
        // a cache written before it crashed the report on `prAxes.length`.
        buster: 'v21',
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => {
            if (!isEligible(q)) return false
            const now = Date.now()
            if (now - admission.at > PASS_WINDOW_MS) {
              admission.at = now
              admission.keep = admitNewestFirst(queryClient.getQueryCache())
            }
            return admission.keep.has(q.queryHash)
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
