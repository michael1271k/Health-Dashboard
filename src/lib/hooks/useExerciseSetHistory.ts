'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { eraForDate, type Era } from '@/lib/programs'
import { isWorkingSet } from '@/lib/training/setTags'

/** The set tags that round-trip through seeding. Mirrors `DraftSet['setType']`. */
export type HistorySetType = 'warmup' | 'failure' | 'dropset' | 'ghost'

/** One historical set. A unilateral pair is TWO of these sharing `pairId`. */
export interface HistorySet {
  weightKg: number
  reps: number
  /** Last session's per-set rating, carried so the deck can seed it and clear it
   *  again the moment the load goes up. See `resolveSeededRpe`. */
  rpe?: number
  setType?: HistorySetType
  /**
   * Unilateral tracking, carried so seeding can rebuild the PAIR.
   *
   * Without these the two rows of a pair were indistinguishable from two
   * ordinary sets, so re-seeding turned last week's 2 physical sets into a
   * 3-set deck — one invented set per pair, every week. 2026-08-13's Single
   * Arm Triceps Pushdown is exactly that: Aug 6 logged set 1 plus one L/R
   * pair (3 rows), and Aug 13 opened with 3 independent sets.
   */
  side?: 'L' | 'R'
  pairId?: string
}

export interface ExerciseHistory {
  date: string                                    // most recent session date
  /** That session's FULL set list, ordered by set_number (1..n) — warm-ups
   *  included. The tag is carried so seeding reproduces last time exactly;
   *  callers that need a working-set baseline use `workingSets()`. */
  sets: HistorySet[]
}

/**
 * The working sets of a history entry — warm-ups removed.
 *
 * Seeding wants the WHOLE list (a warm-up you did last time is a warm-up you'll
 * do again, and its tag must survive the round-trip). Everything that reasons
 * about performance — the PREV chip, the ceiling check, progression — must not
 * see warm-ups, or a light first set drags the baseline down. One helper so the
 * three call sites can't drift apart.
 */
export function workingSets(h: ExerciseHistory | undefined): ExerciseHistory['sets'] {
  if (!h || !Array.isArray(h.sets)) return []
  return h.sets.filter((s) => isWorkingSet(s.setType))
}

/**
 * Previous-session memory for the Command Center deck: the most recent FULL
 * set list per exercise name — richer than a single top set, so
 * "Prev: 36 × 12/11/10 · Jul 12" renders beside today's inputs.
 *
 * ROUTINE-SCOPED BY DEFAULT. When `dayKey` is known (any template or edit deck)
 * only prior sessions of that SAME routine count. Doing Seated Leg Curl on both
 * Legs A and Legs B used to blend the two into one "previous", so a 3-set day
 * seeded from a 2-set day and the coach paced you against the wrong session.
 * Unscoped lookup survives only for a free-form paste deck, which has no routine.
 */
/**
 * One `workout_sets` row, joined to its exercise and session.
 *
 * Named so the reducer below can be pure and therefore tested — the scoping
 * rule is the part with a bug in it, and it lived inside a `queryFn` where the
 * only way to exercise it was a live database.
 */
export interface HistoryRow {
  weight_kg: number
  reps: number
  rpe: number | null
  set_number: number
  set_type: string | null
  side: string | null
  pair_id: string | null
  exercises: { name: string }
  workout_sessions: { started_at: string; day_key: string | null }
}

const TAGS: readonly string[] = ['warmup', 'failure', 'dropset', 'ghost']

/**
 * Rows → the most recent qualifying session per exercise name.
 *
 * ── THE THREE FILTERS, AND WHAT EACH ONE IS FOR ──────────────────────────────
 * `scopeKey` keeps only sessions of the SAME routine. This is the one that was
 * missing from the Previous column and produced 2026-08-27's blank set 3 — see
 * the note on `useGlobalSetHistory`.
 *
 * `before` is an EXCLUSIVE upper bound on the session date. Without it
 * "previous" means "the most recent session, full stop", which is right in a
 * live deck (today is not saved yet) and wrong everywhere that reads an OLD
 * session: opening July's workout would compare each set against August, i.e.
 * against its own future.
 *
 * `era` drops sessions from a previous program, whose numbers are not
 * comparable.
 *
 * Rows arrive newest-first (`created_at desc`) so the first date seen for a name
 * IS its most recent session. But WITHIN a session the working sets are
 * batch-inserted and share a `created_at`, so their relative order here is
 * undefined — the old code appended in that arbitrary order and then blindly
 * reversed, which flipped an already-correct list into `11, 12, 12`. Sorting by
 * `set_number` is deterministic 1..n regardless of insert timing.
 */
export function historyFromRows(
  rows: readonly HistoryRow[],
  opts: { scopeKey?: string | null; before?: string | null; era?: Era } = {},
): Map<string, ExerciseHistory> {
  const { scopeKey = null, before = null, era } = opts
  type Row = HistorySet & { setNumber: number }
  const acc = new Map<string, { date: string; rows: Row[] }>()

  for (const r of rows) {
    if (scopeKey && r.workout_sessions.day_key !== scopeKey) continue
    const date = r.workout_sessions.started_at.slice(0, 10)
    if (before && date >= before) continue
    if (era && eraForDate(date) !== era) continue

    const name = r.exercises.name
    // Only a genuine two-sided row carries the pair through — a `pair_id`
    // with no side, or a side with no `pair_id`, is an ordinary set.
    const sided = r.pair_id && (r.side === 'L' || r.side === 'R')
    const row: Row = {
      weightKg: r.weight_kg, reps: r.reps, setNumber: r.set_number,
      // Supabase returns numeric(3,1) as a string on some paths; coerce once
      // here so nothing downstream compares '8.5' to 8.5.
      ...(r.rpe != null && Number.isFinite(Number(r.rpe)) ? { rpe: Number(r.rpe) } : {}),
      ...(r.set_type && TAGS.includes(r.set_type) ? { setType: r.set_type as HistorySetType } : {}),
      ...(sided ? { side: r.side as 'L' | 'R', pairId: r.pair_id as string } : {}),
    }
    const existing = acc.get(name)
    if (!existing) acc.set(name, { date, rows: [row] })
    else if (existing.date === date) existing.rows.push(row)
    // a different (older) date for a known name is skipped
  }

  const out = new Map<string, ExerciseHistory>()
  for (const [name, { date, rows: setRows }] of acc) {
    const sets: HistorySet[] = [...setRows]
      .sort((a, b) => a.setNumber - b.setNumber)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ setNumber, ...rest }) => rest)
    out.set(name, { date, sets })
  }
  return out
}

export function useExerciseSetHistory(names: string[], era?: Era, dayKey?: string, before?: string) {
  const key = [...names].sort().join('|')
  const scopeKey = dayKey ?? null
  return useQuery({
    queryKey: ['workout_sets', 'deck_history', key, era ?? 'all', scopeKey ?? 'any', before ?? 'latest'],
    enabled: names.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, ExerciseHistory>> => {
      const { data, error } = await supabase
        .from('workout_sets')
        .select('weight_kg, reps, rpe, set_number, set_type, side, pair_id, exercises!inner(name), workout_sessions!inner(started_at, day_key)')
        .in('exercises.name', names)
        .order('created_at', { ascending: false })
        // 2000, not 600: this now SEEDS the logger, and a low cap silently
        // dropped rarely-trained lifts out of the window — they then fell back
        // to the program's cold-start numbers, which read as "arbitrary data".
        .limit(2000)
      if (error) throw error
      return historyFromRows((data ?? []) as unknown as HistoryRow[], { scopeKey, before, era })
    },
  })
}

/**
 * The same memory, and it is SCOPED TOO — this is now a named alias, not a
 * second rule.
 *
 * ── WHAT THIS USED TO DO, AND WHY IT WAS WRONG ───────────────────────────────
 * It dropped the `dayKey` filter, on the argument that the "Previous" column
 * asks a different question from the coach: what did I lift last time I did
 * this MOVEMENT, whichever routine that was. That reads well and it does not
 * survive contact with a five-day split where the same movement is programmed
 * at different set counts on different days.
 *
 * 2026-08-27 is the case. Chest Press (Machine) is on both `cb_a` and `cb_b`;
 * `cb_b` runs three sets and `cb_a` runs two. Logging Upper B that morning, the
 * unscoped lookup landed on the most recent session containing the movement —
 * 2026-08-23, a `cb_a` day — and returned its TWO sets. So set 3 had no
 * previous at all: not a gap in the data, a comparison against the wrong
 * session that happened to be shorter. The scoped lookup returns 2026-08-20's
 * `cb_b`, which has three, and set 3 shows 40 kg × 10.
 *
 * The failure is worse than an empty cell, because the two sets it DID fill
 * were also wrong — 40 × 11 and 40 × 10 from a different routine, presented as
 * "last time" for a session they were not part of. An empty column is legible
 * as missing; a populated one is not legible as wrong.
 *
 * A movement's first outing on a new routine now shows nothing rather than
 * borrowing another day's numbers, and that is the correct answer: there is no
 * previous Upper B for it yet, and inventing one is what this fixes.
 *
 * Kept as its own export so the call sites still SAY which question they are
 * asking; it simply no longer answers it differently.
 */
export function useGlobalSetHistory(names: string[], era?: Era, dayKey?: string, before?: string) {
  return useExerciseSetHistory(names, era, dayKey, before)
}
