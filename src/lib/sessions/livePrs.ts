import { isSetCommitted, type SessionDraft } from '@/lib/sessions/draft'
import { isTimedExercise } from '@/lib/exercises/timed'
import { detectSessionPrs, type AxisRecord, type PrAxis, type PrBaselines, type PrCandidateSet } from '@/lib/training/prEngine'

export interface LivePrs {
  /** `${localId}|${setIdx}` → the axes that set just claimed. */
  bySet: Map<string, PrAxis[]>
  /**
   * `${localId}|${setIdx}` → what each claimed axis achieved and what it beat.
   *
   * A SECOND map rather than a richer `bySet`, deliberately. `bySet` is a prop on
   * every set row and its identity is what `memo` holds on; widening it would put
   * the sheet's data on the render-hot path for no benefit, since only the one
   * set whose trophy was tapped ever needs it.
   */
  detailBySet: Map<string, Partial<Record<PrAxis, AxisRecord>>>
  /** Distinct axis-records across the session — the "Records Achieved" counter. */
  count: number
}

export const EMPTY_LIVE_PRS: LivePrs = { bySet: new Map(), detailBySet: new Map(), count: 0 }

export const livePrKey = (localId: string, setIdx: number) => `${localId}|${setIdx}`

/**
 * Records claimed by the sets ticked green so far.
 *
 * ONLY COMMITTED SETS COUNT. An untouched template row still holds last week's
 * numbers; judging those would light up the whole deck with records the moment
 * it opened, before a single rep was done.
 *
 * Sets are fed to the engine in deck order and the engine absorbs each one, so
 * a second set that merely ties the first does not also claim the record — and
 * because `saveSession` runs the same function over the same order, what you see
 * on the tick is what gets written.
 */
/**
 * Everything the record answer depends on, as a string.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT ABOUT ENGINE COST ─────────────────────
 * `detectSessionPrs` measures at 0.0126 ms against a 24-set deck, flat whatever
 * the history size — `PrBaselines` arrives pre-reduced, so the index is ~138
 * keys whether you have logged 200 sets or 4000. That is 0.08% of a frame. The
 * engine was never the problem, and deferring it would have bought nothing.
 *
 * What matters is that `computeLivePrs` returns a NEW Map every call. That Map
 * is a prop on all six ExerciseCards, so a fresh one on every keystroke broke
 * `memo` for the entire deck — 2.664 ms of reconciliation per character, 211×
 * the engine's cost. Holding the Map's identity steady is worth ~84% of that.
 *
 * ONLY COMMITTED SETS APPEAR HERE, because only they can change the answer. A
 * template-seeded live deck starts every set `done: false`, so during normal
 * logging this digest never changes while you type and the engine does not run
 * at all — the result would have been identical each time. Tick a set and the
 * digest moves, exactly once, which is when the answer genuinely changes.
 */
export function livePrDigest(draft: SessionDraft | null): string {
  if (!draft) return ''
  let out = draft.date
  for (const ex of draft.exercises) {
    if (ex.kind === 'cardio') continue
    for (let i = 0; i < ex.sets.length; i++) {
      const s = ex.sets[i]
      if (!isSetCommitted(s)) continue
      out += `|${ex.localId}:${i}:${ex.name}:${s.weightKg}:${s.reps}:${s.setType ?? ''}:${s.side ?? ''}:${s.pairId ?? ''}`
    }
  }
  return out
}

export function computeLivePrs(draft: SessionDraft | null, baselines: PrBaselines | undefined): LivePrs {
  if (!draft || !baselines) return EMPTY_LIVE_PRS

  const candidates: PrCandidateSet[] = []
  const origin: Array<{ localId: string; setIdx: number }> = []

  for (const ex of draft.exercises) {
    if (ex.kind === 'cardio') continue
    const timed = isTimedExercise(ex.name)
    ex.sets.forEach((s, i) => {
      if (!isSetCommitted(s)) return
      candidates.push({
        key: ex.name, weightKg: s.weightKg, reps: s.reps, setType: s.setType ?? null, timed,
        // Carried so the live volume axis collapses a unilateral pair exactly as
        // `saveSession` does — a badge shown on the tick must be the one written.
        side: s.side ?? null, pairId: s.pairId ?? null,
        // IDENTITY, for the same reason. `saveSession` passes the session date,
        // so an ASSERTED date takes the record-book branch there (see prSeed).
        // Omitting it here meant the deck ran live detection on a date the
        // engine had been told not to guess about, and the two disagreed about
        // the very session being edited.
        date: draft.date, exerciseName: ex.name, setNumber: i + 1,
      })
      origin.push({ localId: ex.localId, setIdx: i })
    })
  }
  if (!candidates.length) return EMPTY_LIVE_PRS

  const r = detectSessionPrs(candidates, baselines)
  const bySet = new Map<string, PrAxis[]>()
  const detailBySet = new Map<string, Partial<Record<PrAxis, AxisRecord>>>()
  r.perSet.forEach((d, i) => {
    if (!d.axes.length) return
    const key = livePrKey(origin[i].localId, origin[i].setIdx)
    bySet.set(key, d.axes)
    // Only the axes that SURVIVED `supersedeWithinSession` — a set that held an
    // axis for four minutes before a heavier set took it keeps no badge, and
    // must not keep a delta either.
    const detail: Partial<Record<PrAxis, AxisRecord>> = {}
    for (const axis of d.axes) {
      const rec = d.records[axis]
      if (rec) detail[axis] = rec
    }
    if (Object.keys(detail).length) detailBySet.set(key, detail)
  })
  return { bySet, detailBySet, count: r.prCount }
}
