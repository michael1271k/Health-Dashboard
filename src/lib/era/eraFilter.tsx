'use client'

/**
 * Global training-era filter — ONE filter state shared, WITHIN a tab, by every
 * table, chart, and weight graph (Nutrition, Pathfinder, Command Center trends).
 *
 * Defaults to the CURRENT era (Helix Cut). It deliberately does NOT persist:
 * switching to a different top-level tab resets it back to the current era
 * (Auto), so a "PPL Legacy" selection made in Nutrition never bleeds into
 * Workout or Pathfinder. The 'axis' token matches `eraForDate`'s return value so
 * existing era-aware hooks (useMuscleAnalytics, HelixViz) plug in without renames.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { HELIX_CUT_START } from '@/lib/programs'
import { PHASES, getWeekPhase } from '@/lib/phases'
import { logicalTodayISO } from '@/lib/utils/day'
// Was a module-private const with the SAME NAME and a byte-identical body as
// the exported one. Two copies of date arithmetic is how two screens end up
// disagreeing about which week it is.
import { isoAddDays } from '@/lib/utils/week'

export type EraFilter = 'all' | 'ppl' | 'axis'

export const ERA_FILTER_META: Record<EraFilter, { label: string; color: string }> = {
  axis: { label: 'Helix 5.1',  color: '#8E9AAC' },
  ppl:  { label: 'Push/Pull/Legs', color: '#79808C' },
  all:  { label: 'All',        color: '#3E9E7A' },
}

/** Pill display order — "All" far-left; the default selection stays 'axis'. */
export const ERA_FILTER_ORDER: EraFilter[] = ['all', 'axis', 'ppl']

// ── Sub-phase (nested under the Helix 5.1 era): Cut / Maintenance / Bulk ──
export type SubPhase = 'cut' | 'maintenance' | 'bulk'
export type SubPhaseSel = 'auto' | SubPhase

export const SUB_PHASE_META: Record<SubPhase, { label: string; color: string }> = {
  cut:         { label: 'Cut',   color: '#8E9AAC' },
  maintenance: { label: 'Maint', color: '#3E9E7A' },
  bulk:        { label: 'Bulk',  color: '#D4AF37' },
}
export const SUB_PHASE_ORDER: SubPhase[] = ['cut', 'maintenance', 'bulk']

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
  const [era, setEra] = useState<EraFilter>('axis')
  const [subPhase, setSubPhase] = useState<SubPhaseSel>('auto')

  // Reset to the current era (Auto) whenever the user switches top-level tab, so
  // a filter chosen on one tab never carries into another. Ref-guarded on the
  // top URL segment: the initial mount keeps the 'axis' default (no spurious
  // reset), and same-tab navigation (e.g. ?view= changes) leaves the choice intact.
  const pathname = usePathname()
  const topSegment = (pathname ?? '/').split('/')[1] ?? ''
  const prevSegment = useRef(topSegment)
  useEffect(() => {
    if (prevSegment.current === topSegment) return
    prevSegment.current = topSegment
    setEra('axis')
    setSubPhase('auto')
  }, [topSegment])

  // `resolveSubPhase` walks the phase calendar and builds a Date. It used to run
  // in the render body, and the context value was a fresh object literal — so
  // every render of this provider (which wraps the ENTIRE app) invalidated all
  // seven consumers, including the Momentum timeline and both analytics panels.
  const resolvedPhase = useMemo(() => resolveSubPhase(subPhase), [subPhase])
  const value = useMemo<EraCtx>(
    () => ({ era, setEra, subPhase, setSubPhase, resolvedPhase }),
    [era, subPhase, resolvedPhase],
  )

  return <EraFilterContext.Provider value={value}>{children}</EraFilterContext.Provider>
}

export function useEraFilter(): EraCtx {
  const ctx = useContext(EraFilterContext)
  if (!ctx) throw new Error('useEraFilter must be used within <EraFilterProvider>')
  return ctx
}
