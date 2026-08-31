'use client'

import { useEffect, useState } from 'react'
import type { DashboardSurface } from '@/lib/dashboard/layout'

/**
 * Which grid this browser is drawing, and the media query that decides.
 *
 * ── 1280px, BECAUSE THAT IS WHERE THE GRID ITSELF CHANGES ────────────────────
 * `WidgetGrid` renders `grid-cols-2 xl:grid-cols-4`, and Tailwind's `xl` is
 * 1280px. Picking any other number here would mean the layout the app STORES and
 * the layout the browser LAYS OUT disagree across some band of widths — a
 * desktop arrangement holding four-column tiles, rendered into a two-column
 * grid. The two must be the same threshold or they are not the same decision.
 */
const DESKTOP_QUERY = '(min-width: 1280px)'

/**
 * ── IT RESOLVES AFTER MOUNT, AND THAT COSTS NOTHING HERE ─────────────────────
 * There is no server-side answer to "how wide is the window", so a hook that
 * guessed would render one arrangement and hydrate into another. It returns
 * `phone` first and corrects itself in an effect — which is free, because
 * `WidgetGrid` already reads its layout in an effect for exactly the same
 * reason (localStorage is not available during SSR either), so the surface is
 * known before the first arrangement is ever painted.
 *
 * ── AND IT KEEPS LISTENING ───────────────────────────────────────────────────
 * A window dragged across the threshold, an iPad rotated, a Split View resized:
 * all three change which arrangement is correct, and a one-shot read would leave
 * the desktop layout rendered into a two-column grid until a reload.
 */
export function useDashboardSurface(): DashboardSurface {
  const [surface, setSurface] = useState<DashboardSurface>('phone')

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(DESKTOP_QUERY)
    const apply = () => setSurface(mq.matches ? 'desktop' : 'phone')
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  return surface
}
