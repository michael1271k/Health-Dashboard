'use client'

/**
 * Global training-era filter — ONE filter state shared by every table, chart,
 * and weight graph (Nutrition, Charts, Journey, Command Center trends).
 *
 * Defaults to the CURRENT era (Helix Cut) for a clean-slate daily view;
 * the choice persists in localStorage across navigation and reloads. The
 * 'axis' token deliberately matches `eraForDate`'s return value so existing
 * era-aware hooks (useMuscleAnalytics, HelixViz) plug in without renames.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { HELIX_CUT_START } from '@/lib/programs'
import { PHASES } from '@/lib/phases'
import { logicalTodayISO } from '@/lib/utils/day'

const isoAddDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

export type EraFilter = 'all' | 'ppl' | 'axis'

export const ERA_FILTER_META: Record<EraFilter, { label: string; color: string }> = {
  axis: { label: 'Helix Cut',  color: '#3EE0FF' },
  ppl:  { label: 'PPL Legacy', color: '#8B97B2' },
  all:  { label: 'All',        color: '#19E3B1' },
}

/** Pill display order — "All" far-left; the default selection stays 'axis'. */
export const ERA_FILTER_ORDER: EraFilter[] = ['all', 'axis', 'ppl']

const STORAGE_KEY = 'helix_era_filter'

/** Inclusive date window covered by an era filter value. */
export function eraDateRange(era: EraFilter): { from: string; to: string } {
  const to = logicalTodayISO()
  if (era === 'axis') return { from: HELIX_CUT_START, to }
  if (era === 'ppl') return { from: PHASES[0].start, to: isoAddDays(HELIX_CUT_START, -1) }
  return { from: PHASES[0].start, to }
}

const EraFilterContext = createContext<{ era: EraFilter; setEra: (e: EraFilter) => void } | null>(null)

export function EraFilterProvider({ children }: { children: ReactNode }) {
  // Lazy initializer, NOT a hydrate-effect: an effect pair (read → write)
  // briefly persists the default before the stored value lands, and a tree
  // remount inside that window (React hydration recovery) permanently
  // clobbers the user's choice. Reading at first client render makes every
  // mount self-consistent. The pills never appear in SSR HTML (AuthGate
  // renders a spinner server-side), so this cannot introduce a mismatch.
  const [era, setEra] = useState<EraFilter>(() => {
    if (typeof window === 'undefined') return 'axis'
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'all' || stored === 'ppl' || stored === 'axis') return stored
    } catch { /* ignore */ }
    return 'axis'
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, era) } catch { /* ignore */ }
  }, [era])

  return <EraFilterContext.Provider value={{ era, setEra }}>{children}</EraFilterContext.Provider>
}

export function useEraFilter(): { era: EraFilter; setEra: (e: EraFilter) => void } {
  const ctx = useContext(EraFilterContext)
  if (!ctx) throw new Error('useEraFilter must be used within <EraFilterProvider>')
  return ctx
}
