'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { peekSessionDraft } from '@/lib/sessions/draft'

/**
 * On a HARD browser reload (F5 / Cmd-R), always boot the Dashboard instead of
 * re-rendering the deeply-nested tab. A fresh navigation or deep link (type
 * 'navigate') is left alone — only an explicit reload bounces home. This also
 * means a reload never re-instantiates a nested, chunk-mismatch-prone surface.
 *
 * ── EXCEPT DURING A WORKOUT ─────────────────────────────────────────────────
 * On iOS the webview's content process is killed while the app sits in the
 * background, and Capacitor's recovery is `webView.reload()` — which arrives
 * here as navigation type 'reload', indistinguishable from a Cmd-R. So the one
 * time this guard fired for real, it fired against a user who had done nothing
 * but lock their phone mid-set, and took the deck away from them. A live draft
 * means the reload was recovery, not intent: stay where you are.
 */
export function ReloadHome() {
  const router = useRouter()
  useEffect(() => {
    try {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (nav?.type !== 'reload') return
      if (window.location.pathname === '/') return
      if (peekSessionDraft()) return // recovery mid-session — never yank the deck
      router.replace('/')
    } catch { /* navigation timing unavailable — no-op */ }
    // Run once on the initial mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
