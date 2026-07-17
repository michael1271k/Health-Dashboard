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
            // App-open paradigm: the app pushes fresh HealthKit data exactly
            // when the app foregrounds, so we reconcile the UI on focus + reconnect.
            // A short staleTime means a foreground refetch actually re-hits the DB
            // right after the push, while tab-switches within the window still
            // serve instantly from cache (no refetch storm).
            staleTime: 15 * 1000,
            gcTime: 30 * 60 * 1000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            // Every cold open repaints instantly from the persisted cache, then
            // revalidates against Supabase — so data written out-of-band (a direct
            // DB insert / native push while the app was closed) always reconciles.
            refetchOnMount: 'always',
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
      // of feeding stale-shaped data into new components. (v16: existing
      // caches may hold Map-poisoned entries — discard them all once.)
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        buster: 'v16',
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => defaultShouldDehydrateQuery(q) && isJsonSafe(q.state.data),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
