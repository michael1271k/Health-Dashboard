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
import { PHASES, getWeekPhase } from '@/lib/phases'
import { logicalTodayISO } from '@/lib/utils/day'

const isoAddDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

export type EraFilter = 'all' | 'ppl' | 'axis'

export const ERA_FILTER_META: Record<EraFilter, { label: string; color: string }> = {
  axis: { label: 'Helix 5.1',  color: '#3EE0FF' },
  ppl:  { label: 'PPL Legacy', color: '#8B97B2' },
  all:  { label: 'All',        color: '#19E3B1' },
}

/** Pill display order — "All" far-left; the default selection stays 'axis'. */
export const ERA_FILTER_ORDER: EraFilter[] = ['all', 'axis', 'ppl']

const STORAGE_KEY = 'helix_era_filter'

// ── Sub-phase (nested under the Helix 5.1 era): Cut / Maintenance / Bulk ──
export type SubPhase = 'cut' | 'maintenance' | 'bulk'
export type SubPhaseSel = 'auto' | SubPhase

export const SUB_PHASE_META: Record<SubPhase, { label: string; color: string }> = {
  cut:         { label: 'Cut',   color: '#38E1FF' },
  maintenance: { label: 'Maint', color: '#43F59B' },
  bulk:        { label: 'Bulk',  color: '#FFB020' },
}
export const SUB_PHASE_ORDER: SubPhase[] = ['cut', 'maintenance', 'bulk']

const SUB_STORAGE_KEY = 'helix_sub_phase'

function weekStartSundayISO(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}

/** The program's current training phase — the authoritative auto-detection. */
export function currentAutoPhase(): SubPhase {
  const kind = getWeekPhase(weekStartSundayISO(logicalTodayISO()))?.kind
  if (kind === 'bulk') return 'bulk'
  if (kind === 'maintenance') return 'maintenance'
  return 'cut' // cut / peak / unknown all read as the active Cut block
}

/** Resolve an 'auto' selection to the concrete current phase. */
export function resolveSubPhase(sel: SubPhaseSel): SubPhase {
  return sel === 'auto' ? currentAutoPhase() : sel
}

/** Inclusive date window covered by an era filter value. */
export function eraDateRange(era: EraFilter): { from: string; to: string } {
  const to = logicalTodayISO()
  if (era === 'axis') return { from: HELIX_CUT_START, to }
  if (era === 'ppl') return { from: PHASES[0].start, to: isoAddDays(HELIX_CUT_START, -1) }
  return { from: PHASES[0].start, to }
}

interface EraCtx {
  era: EraFilter
  setEra: (e: EraFilter) => void
  /** Raw sub-phase selection ('auto' or an explicit override). */
  subPhase: SubPhaseSel
  setSubPhase: (p: SubPhaseSel) => void
  /** The concrete phase after resolving 'auto' → current program phase. */
  resolvedPhase: SubPhase
}
const EraFilterContext = createContext<EraCtx | null>(null)

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

  const [subPhase, setSubPhase] = useState<SubPhaseSel>(() => {
    if (typeof window === 'undefined') return 'auto'
    try {
      const stored = localStorage.getItem(SUB_STORAGE_KEY)
      if (stored === 'auto' || stored === 'cut' || stored === 'maintenance' || stored === 'bulk') return stored
    } catch { /* ignore */ }
    return 'auto'
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, era) } catch { /* ignore */ }
  }, [era])
  useEffect(() => {
    try { localStorage.setItem(SUB_STORAGE_KEY, subPhase) } catch { /* ignore */ }
  }, [subPhase])

  return (
    <EraFilterContext.Provider value={{ era, setEra, subPhase, setSubPhase, resolvedPhase: resolveSubPhase(subPhase) }}>
      {children}
    </EraFilterContext.Provider>
  )
}

export function useEraFilter(): EraCtx {
  const ctx = useContext(EraFilterContext)
  if (!ctx) throw new Error('useEraFilter must be used within <EraFilterProvider>')
  return ctx
}
