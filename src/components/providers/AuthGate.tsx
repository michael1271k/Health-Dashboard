'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { HelixMark } from '@/components/HelixMark'

type AuthState = 'resolving' | 'authed' | 'anon'

/**
 * Native Session Shell (Phase 16) — fixes the iOS standalone-PWA blank screen.
 *
 * iOS gives a home-screen PWA an ISOLATED storage container: a Safari login
 * does not exist inside it. Without a session every RLS query silently returns
 * [] and the app renders "successfully"… empty. This gate resolves the session
 * before rendering data surfaces: no session → redirect to /auth (sign in ONCE
 * inside the container; persistSession keeps it), and while resolving it shows
 * a branded splash instead of a blank/empty dashboard.
 *
 * Also keeps long-idle PWAs alive: token auto-refresh is started/stopped with
 * page visibility so a session left in the app switcher for days refreshes on
 * foreground instead of silently expiring back to empty queries.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [state, setState] = useState<AuthState>('resolving')

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setState(session ? 'authed' : 'anon')
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

  // No session → the auth page is the only destination.
  useEffect(() => {
    if (state === 'anon' && pathname !== '/auth') router.replace('/auth')
  }, [state, pathname, router])

  if (pathname === '/auth') return <>{children}</>
  if (state === 'authed') return <>{children}</>

  // Resolving (≤ a few hundred ms from localStorage) or redirecting: branded splash.
  return (
    <div className="min-h-[60dvh] flex flex-col items-center justify-center gap-3" role="status" aria-label="Loading HELIX">
      <HelixMark className="w-10 h-10 animate-pulse" />
      <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-primary/80">HELIX</span>
    </div>
  )
}
