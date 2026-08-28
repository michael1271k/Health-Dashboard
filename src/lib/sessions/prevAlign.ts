import { isWorkingSet } from '@/lib/training/setTags'
import type { HistorySet } from '@/lib/hooks/useExerciseSetHistory'

/**
 * Which previous set belongs beside which of today's rows.
 *
 * ── THE BUG THIS EXISTS TO KILL ──────────────────────────────────────────────
 * The deck used to line the two lists up by DISPLAY NUMBER: row `n` took
 * `previous[n - 1]`. Those are two different countings, and they disagree the
 * moment a warm-up is involved.
 *
 * `previous` is `workingSets(history)` — warm-ups deliberately stripped, because
 * everything that reasons about performance must not see them (a light first set
 * drags a baseline down). The display number counts EVERY row, warm-ups
 * included. So on 2026-08-28's Leg Press:
 *
 *   today     row 1 = warm-up 60×15   row 2 = 72.5×14   row 3 = 72.5×14
 *   previous  [72.5×13, 72.5×14]      (Aug 21's two working sets)
 *
 * Row 1 took `previous[0]` — a WORKING set shown beside a warm-up. Row 2 took
 * `previous[1]`, the second working set, one place out. And row 3 took
 * `previous[2]`, which does not exist, so the last working set of the session
 * showed no previous at all. Reported as "Leg Press Set 3 had NO previous
 * values"; every exercise with a warm-up had the same off-by-one, and the two
 * cells that DID fill were also wrong, which is worse than the blank one.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * Like against like. A warm-up is compared with the previous session's warm-up,
 * a working set with the previous session's working set, each in their own
 * order. Nothing is invented: when the previous session had fewer of a kind,
 * the surplus rows show nothing rather than repeating the last value or
 * borrowing from the other kind.
 *
 * ── WHAT THIS IS *NOT* ───────────────────────────────────────────────────────
 * It is not a scoping rule. WHICH session `previous` comes from is decided by
 * `useExerciseSetHistory`, which is strictly routine-scoped (`day_key`) — a
 * `legs_b` deck never sees a `legs_a` session. This is the alignment inside a
 * correctly-chosen session, and the two were mistaken for one problem: the
 * scoping fix landed and set 3 was still blank, because it was never a scoping
 * bug.
 */

/**
 * Collapse a previous session's set list into DISPLAY rows.
 *
 * A unilateral L/R pair is two stored rows and ONE row on the deck, so a pair in
 * the history has to count once here or every row after it slides by one. The
 * first side encountered represents the pair — the two sides of a matched pair
 * are the same numbers, and an asymmetric one is still a single comparison.
 */
export function previousDisplayRows(sets: readonly HistorySet[] | undefined): HistorySet[] {
  if (!sets?.length) return []
  const seen = new Set<string>()
  const out: HistorySet[] = []
  for (const s of sets) {
    if (s.pairId) {
      if (seen.has(s.pairId)) continue
      seen.add(s.pairId)
    }
    out.push(s)
  }
  return out
}

/**
 * One previous set per row of today's deck, or null where there is none.
 *
 * `todayWarmup[i]` says whether today's row `i` is a warm-up; the returned array
 * has exactly the same length and order, so a caller indexes it by row.
 */
export function alignPreviousSets(
  todayWarmup: readonly boolean[],
  previous: readonly HistorySet[] | undefined,
): (HistorySet | null)[] {
  const rows = previousDisplayRows(previous)
  const warm = rows.filter((s) => !isWorkingSet(s.setType))
  const work = rows.filter((s) => isWorkingSet(s.setType))
  let wi = 0
  let ki = 0
  return todayWarmup.map((isWarm) => (isWarm ? warm[wi++] : work[ki++]) ?? null)
}
