'use client'

import { useSyncExternalStore } from 'react'

/**
 * Is the viewport at Tailwind's `md` breakpoint or wider?
 *
 * WHY THIS EXISTS: `hidden md:block` hides a subtree, it does not unmount it.
 * A widget wrapped that way still mounts, still runs its hooks and still issues
 * its queries — on a phone, where it will never be seen. The dashboard's
 * 30-day trend strip was doing exactly that: three Supabase selects on every
 * cold start of the primary device, for a panel that is display:none.
 *
 * Use this to GATE a mount when the component costs something. Keep using
 * `hidden md:block` for markup that is merely decorative — a CSS class costs
 * nothing and does not need a subscription.
 *
 * Renders `false` on the server and on the first client paint, so a phone never
 * flashes desktop-only content and a desktop pays one extra render. That order
 * is deliberate: this app is iOS-first, so the mobile branch is the one that
 * must be right without a round trip.
 */

const MD = '(min-width: 768px)'

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(MD)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MD).matches,
    () => false,
  )
}
