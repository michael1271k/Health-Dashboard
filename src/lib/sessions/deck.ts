/**
 * The deck's row arithmetic — PURE, extracted from `ExerciseCard` and
 * `SetEditorRow` so it can be vectored and ported.
 *
 * Nothing here knows about React; the components import from this file.
 */
import type { DraftExercise, DraftSet } from '@/lib/sessions/draft'

/** The coach status chip's words and hue, per verdict. */
export const STATUS_META: Record<NonNullable<DraftExercise['status']>, { label: string; color: string }> = {
  PR:       { label: 'PR',       color: '#D4AF37' },  // gold
  PROGRESS: { label: 'PROG ▲',   color: '#3E9E7A' },
  HOLD:     { label: 'HOLD',     color: '#79808C' },
  REGRESS:  { label: 'REGR ▼',   color: '#C4514E' },
  NEW:      { label: 'NEW',      color: '#8E9AAC' },
}

// A unilateral L/R pair reads as ONE numbered set that expands into Left/Right
// sub-rows — NOT two sibling rows. groupSets folds the flat draft list into that
// display shape while preserving each side's original index (for edit/remove).
export type SetGroup =
  | { kind: 'single'; idx: number; set: DraftSet; num: number }
  | { kind: 'pair'; pairId: string; num: number; left?: { idx: number; set: DraftSet }; right?: { idx: number; set: DraftSet } }

export function groupSets(sets: DraftSet[]): SetGroup[] {
  const groups: SetGroup[] = []
  const byPair = new Map<string, Extract<SetGroup, { kind: 'pair' }>>()
  let num = 0
  sets.forEach((set, idx) => {
    if (set.pairId) {
      let g = byPair.get(set.pairId)
      if (!g) { num += 1; g = { kind: 'pair', pairId: set.pairId, num }; byPair.set(set.pairId, g); groups.push(g) }
      if (set.side === 'R') g.right = { idx, set }
      else g.left = { idx, set }
    } else {
      num += 1
      groups.push({ kind: 'single', idx, set, num })
    }
  })
  return groups
}

/** The ± chip's tap step, and its hold step — the quarter-kg microload. */
export const PLATE_STEP = 2.5
export const FINE_STEP = 0.25

/** Nudge a load and snap to the 0.25 kg grid (quarter-kg microloads), never below 0. */
export function nudgeLoad(weightKg: number, delta: number): number {
  return Math.max(0, Math.round((weightKg + delta) * 4) / 4)
}

/** Nudge a rep count, never below 1. */
export function nudgeReps(reps: number, delta: number): number {
  return Math.max(1, reps + delta)
}

/** Show the real load: 3.75 must never display as "3.8" (quarter-step plates). */
export const fmtKg = (w: number): string =>
  (w % 1 === 0 ? w.toFixed(0) : (w * 10) % 1 === 0 ? w.toFixed(1) : w.toFixed(2))

/** `0.37`, `5`, `12.5` — a fixed-point value with its dead zeros taken off. */
export function trimNum(v: number, digits: number): string {
  return v.toFixed(digits).replace(/\.?0+$/, '') || '0'
}
