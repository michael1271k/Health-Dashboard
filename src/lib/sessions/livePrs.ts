import { isSetCommitted, type SessionDraft } from '@/lib/sessions/draft'
import { isTimedExercise } from '@/lib/exercises/timed'
import { detectSessionPrs, type PrAxis, type PrBaselines, type PrCandidateSet } from '@/lib/training/prEngine'

export interface LivePrs {
  /** `${localId}|${setIdx}` → the axes that set just claimed. */
  bySet: Map<string, PrAxis[]>
  /** Distinct axis-records across the session — the "Records Achieved" counter. */
  count: number
}

export const EMPTY_LIVE_PRS: LivePrs = { bySet: new Map(), count: 0 }

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
      })
      origin.push({ localId: ex.localId, setIdx: i })
    })
  }
  if (!candidates.length) return EMPTY_LIVE_PRS

  const r = detectSessionPrs(candidates, baselines)
  const bySet = new Map<string, PrAxis[]>()
  r.perSet.forEach((d, i) => {
    if (d.axes.length) bySet.set(livePrKey(origin[i].localId, origin[i].setIdx), d.axes)
  })
  return { bySet, count: r.prCount }
}
