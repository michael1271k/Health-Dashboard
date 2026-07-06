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
            // Data is kept fresh by the realtime WebSocket invalidation, so we can
            // cache aggressively — navigating between tabs serves from cache
            // instead of refetching (the main tab-switch lag source).
            staleTime: 5 * 60 * 1000,
            gcTime: 30 * 60 * 1000,
            refetchOnWindowFocus: false,
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
    }),
  )

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000, buster: 'v13' }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
