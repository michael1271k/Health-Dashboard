'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { LaunchSurface } from '@/components/launch/LaunchSurface'
import { hydratePrefsFromDb } from '@/lib/utils/prefsSync'

type AuthState = 'resolving' | 'authed' | 'anon'

/**
 * Zero-load optimistic gate: Supabase persists its session token in
 * localStorage (`sb-*-auth-token`). If that token exists we render the app
 * IMMEDIATELY (no splash) and verify the session in the background — the warm
 * start, which is every launch after the first, paints instantly. Only a
 * genuinely missing token shows the brief splash before redirecting to /auth.
 */
function hasPersistedSession(): boolean {
  if (typeof window === 'undefined') return false
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && /^sb-.*-auth-token$/.test(k) && localStorage.getItem(k)) return true
    }
  } catch { /* storage blocked */ }
  return false
}

/**
 * Native Session Shell — fixes the iOS standalone-PWA blank screen.
 *
 * iOS gives a home-screen PWA an ISOLATED storage container: a Safari login
 * does not exist inside it. Without a session every RLS query silently returns
 * [] and the app renders "successfully"… empty. This gate resolves the session
 * before rendering data surfaces: no session → redirect to /auth (sign in ONCE
 * inside the container; persistSession keeps it). A persisted token lets us skip
 * the splash entirely and paint optimistically.
 *
 * Also keeps long-idle PWAs alive: token auto-refresh is started/stopped with
 * page visibility so a session left in the app switcher for days refreshes on
 * foreground instead of silently expiring back to empty queries.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  // Optimistic: a persisted token → 'authed' on first paint (no splash).
  const [state, setState] = useState<AuthState>(() => (hasPersistedSession() ? 'authed' : 'resolving'))

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      setState(session ? 'authed' : 'anon')
      // DB-backed preferences hydrate every context (Safari + PWA identical).
      if (session) void hydratePrefsFromDb()
    }).catch(() => { if (!cancelled) setState('anon') })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? 'authed' : 'anon')
    })

    // Foreground token refresh — critical for a PWA idle in the app switcher.
    const onVisibility = () => {
      try {
        if (document.visibilityState === 'visible') supabase.auth.startAutoRefresh()
        else supabase.auth.stopAutoRefresh()
      } catch { /* non-fatal */ }
    }
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisibility)
      try { supabase.auth.stopAutoRefresh() } catch { /* non-fatal */ }
    }
  }, [])

  // No session → the auth page is the only destination. Every /auth/* route
  // (sign-in AND the password-recovery flow) is public so a recovery link can
  // establish its session before the gate resolves.
  useEffect(() => {
    if (state === 'anon' && !pathname.startsWith('/auth')) router.replace('/auth')
  }, [state, pathname, router])

  if (pathname.startsWith('/auth')) return <>{children}</>
  if (state === 'authed') return <>{children}</>

  // Resolving (≤ a few hundred ms from localStorage) or redirecting.
  //
  // The SAME surface the sign-in page renders, with no card. The mark, the
  // wordmark and the backdrop hold their exact position and size across the
  // handover, so arriving at /auth is the card appearing beneath a lockup that
  // never moved — not a cut between two screens that share a logo.
  return <LaunchSurface status="Loading HELIX" />
}
