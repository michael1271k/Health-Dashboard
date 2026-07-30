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
            refetchOnWindowFocus: true,
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
        // v19: MUST bump. Devices are holding a `month_activity` entry whose
        // workoutDates/dataDates persisted as `{}` (serialized Sets). Those
        // fields are arrays now, and restoring the old blob into the new shape
        // is precisely the launch the fix has to survive. Busting guarantees a
        // clean slate rather than relying on the runtime guard alone.
        buster: 'v19',
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => defaultShouldDehydrateQuery(q) && isJsonSafe(q.state.data),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
