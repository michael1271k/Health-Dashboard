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
 * refetch — just never persist them. Top-level check is sufficient: all our
 * Map/Set payloads are the query data itself.
 */
const isJsonSafe = (data: unknown) => !(data instanceof Map) && !(data instanceof Set)

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
        // v18: the sleep-window fix rewrote every daily_scores row. Devices
        // holding the pre-fix persisted cache kept painting the OLD row
        // (sleep_score null → "Awaiting Sleep Data", battery 52%) even though
        // the DB was already correct. Busting discards those stale blobs.
        buster: 'v18',
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => defaultShouldDehydrateQuery(q) && isJsonSafe(q.state.data),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
