/**
 * The Session Report's arithmetic — PURE, extracted from `ExerciseBreakdown`,
 * `SessionHighlights` and `MetricGrid` so each rule can be vectored and ported.
 * The unit preference is INJECTED (`toDisplay`), never read from storage here.
 */
import type { DetailExercise, DetailSet } from '@/lib/hooks/useSessionDetail'
import type { HistorySet } from '@/lib/hooks/useExerciseSetHistory'
import type { IntelMetric } from '@/lib/hooks/useSessionIntel'
import { prAxisLabel } from '@/lib/training/prEngine'
import { isTimedExercise } from '@/lib/exercises/timed'
import { formatSet } from '@/lib/utils/setFormat'
import { isWorkingSet } from '@/lib/training/setTags'
import { LOAD_STEP_KG } from '@/lib/training/ceilings'
import { GOLD, EMBER } from '@/lib/theme/palette'

// ── the ledger rows ──────────────────────────────────────────────────────────

export type DetailRow =
  | { kind: 'single'; num: number | null; set: DetailSet }
  | { kind: 'pair'; num: number | null; left?: DetailSet; right?: DetailSet }

/**
 * Fold the flat set list into ledger rows: a unilateral pair is ONE row, and
 * only WORKING sets take an ordinal — a warm-up is not "set 1 of 4", it IS the W.
 */
export function toRows(sets: DetailSet[]): DetailRow[] {
  const rows: DetailRow[] = []
  const byPair = new Map<string, Extract<DetailRow, { kind: 'pair' }>>()
  let num = 0
  for (const s of sets) {
    const counts = isWorkingSet(s.setType)
    if (s.pairId) {
      let g = byPair.get(s.pairId)
      if (!g) {
        if (counts) num += 1
        g = { kind: 'pair', num: counts ? num : null }
        byPair.set(s.pairId, g)
        rows.push(g)
      }
      if (s.side === 'R') g.right = s; else g.left = s
    } else {
      if (counts) num += 1
      rows.push({ kind: 'single', num: counts ? num : null, set: s })
    }
  }
  return rows
}

/** Pair each numbered row with its counterpart from last time; a pair consumes two. */
export function rowsWithPrev(rows: DetailRow[], prevSets: HistorySet[]): Array<{
  row: DetailRow; prev?: HistorySet; prevRight?: HistorySet
}> {
  let i = 0
  return rows.map((row) => {
    if (row.num == null) return { row }              // warm-up: no counterpart
    if (row.kind === 'pair') {
      const out = { row, prev: prevSets[i], prevRight: prevSets[i + 1] }
      i += 2
      return out
    }
    return { row, prev: prevSets[i++] }
  })
}

/** vs-last-same-type glyph: ⬆️ improved · ═ held · ⬇️ regressed · 🆕 baseline. */
export function deltaGlyph(delta: -1 | 0 | 1 | null | undefined): string | null {
  if (delta === undefined) return null
  if (delta == null) return '🆕'
  return delta === 1 ? '⬆️' : delta === -1 ? '⬇️' : '═'
}

// ── the progression cue ──────────────────────────────────────────────────────

export function progressionCue(
  t: { progression: { state: string; ceiling: number | null; suggestKg: number | null } } | undefined,
  timed: boolean,
  unit: string,
  toDisplay: (kg: number) => number | null,
): { short: string; title: string; color: string } | null {
  const p = t?.progression
  if (!p || (p.state !== 'ready' && p.state !== 'one-more')) return null
  const ceil = `${p.ceiling}${timed ? 's' : ' reps'}`
  if (p.state === 'one-more') {
    return { short: '1 more', title: `One more clean session at ${ceil}`, color: GOLD }
  }
  if (timed) return { short: 'extend', title: `Cleared twice — extend past ${p.ceiling}s`, color: EMBER }
  // No load to add on bodyweight work; the cue is reps.
  if (p.suggestKg == null) return { short: 'extend', title: `Cleared twice — extend past ${ceil}`, color: EMBER }
  return {
    short: `+${LOAD_STEP_KG}${unit}`,
    title: `Cleared twice — add ${LOAD_STEP_KG}${unit} to ${toDisplay(p.suggestKg)}${unit}`,
    color: EMBER,
  }
}

// ── the exercise strip ───────────────────────────────────────────────────────

/**
 * The facts a finished exercise has, computed once. Warm-ups are excluded from
 * every figure; a unilateral pair's reps count once; `topReps` is the best
 * single set, which on an unloaded lift is the longest rather than the heaviest.
 */
export function exerciseStats(ex: DetailExercise): {
  totalReps: number
  avgRpe: number | null
  topKg: number
  /** Best single set by reps (or seconds, on a timed hold). Never null. */
  topReps: number
} {
  const working = ex.sets.filter((s) => isWorkingSet(s.setType))
  // A unilateral pair is ONE set of work, so its reps count once — the same
  // rule tonnage already uses, and the reason this cannot just sum the rows.
  const seen = new Set<string>()
  let totalReps = 0
  for (const s of working) {
    const key = s.pairId ?? `#${s.setNumber}-${s.side ?? ''}`
    if (s.pairId && seen.has(key)) continue
    seen.add(key)
    totalReps += s.reps
  }

  const rpes = working.map((s) => s.rpe).filter((v): v is number => v != null)
  const avgRpe = rpes.length
    ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10
    : null

  return {
    totalReps,
    avgRpe,
    topKg: working.reduce((m, s) => Math.max(m, s.weightKg), 0),
    // Per SET, not summed — "top" means the best one, which on an unloaded lift
    // is the longest set rather than the heaviest. A pair is not deduped here
    // because taking the max of two sides is already the weaker-side-agnostic
    // answer: the best single effort is the best single effort.
    topReps: working.reduce((m, s) => Math.max(m, s.reps || 0), 0),
  }
}

// ── highlights ───────────────────────────────────────────────────────────────

/** The highest est-1RM of the session — a ranking, not a record. */
export function strongestOf(exercises: readonly DetailExercise[]): DetailExercise | null {
  let best: DetailExercise | null = null
  for (const e of exercises) {
    const v = e.bestEst1rm ?? 0
    if (v > 0 && (!best || v > (best.bestEst1rm ?? 0))) best = e
  }
  return best
}

export interface Highlight { name: string; axes: string[]; detail: string }

/** Every record in the session, one line each, resolved from the set that won it. */
export function highlightsOf(exercises: readonly DetailExercise[], toDisplay: (kg: number) => number | null, unit: string): Highlight[] {
  const out: Highlight[] = []
  for (const ex of exercises) {
    const timed = isTimedExercise(ex.name)
    const won = ex.sets.filter((s) => s.isPr)
    if (!won.length) continue
    // Collapse to ONE line per exercise: the set that carries the most axes,
    // then the heaviest. Two trophy rows for one movement reads as two records.
    // `prAxes` is read defensively throughout: a localStorage-persisted session
    // detail written before the field existed rehydrates without it, and a bare
    // `.length` here took the whole report down with an error boundary.
    const lead = [...won].sort((a, b) => (b.prAxes?.length ?? 0) - (a.prAxes?.length ?? 0) || b.weightKg - a.weightKg)[0]
    const axes = (lead.prAxes?.length ? lead.prAxes : ex.prAxes ?? []).map((a) => prAxisLabel(a, timed))
    out.push({
      name: ex.name,
      axes: [...new Set(axes)],
      detail: formatSet(lead.weightKg, lead.reps, { timed, unit, toDisplay }),
    })
  }
  return out
}

// ── the metric grid ──────────────────────────────────────────────────────────

/** Percent change for a metric, in the direction that metric considers good. */
export function pctOf(m: IntelMetric | undefined): { pct: number; good: boolean } | null {
  if (!m || m.value == null || m.previous == null || m.previous === 0) return null
  const pct = Math.round(((m.value - m.previous) / m.previous) * 100)
  if (pct === 0) return null
  return { pct, good: pct > 0 === m.higherIsBetter }
}
