'use client'

import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { useState } from 'react'

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
            refetchOnMount: false,
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
      // Bump this on any deploy that changes cached query/component shapes so
      // a device with an older persisted cache discards it instead of feeding
      // stale-shaped data into new components.
      persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000, buster: 'v14' }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
