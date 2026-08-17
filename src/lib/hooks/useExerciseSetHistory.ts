'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { eraForDate, type Era } from '@/lib/programs'

/** The set tags that round-trip through seeding. Mirrors `DraftSet['setType']`. */
export type HistorySetType = 'warmup' | 'failure' | 'dropset'

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
  return h.sets.filter((s) => s.setType !== 'warmup')
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
export function useExerciseSetHistory(names: string[], era?: Era, dayKey?: string) {
  const key = [...names].sort().join('|')
  const scopeKey = dayKey ?? null
  return useQuery({
    queryKey: ['workout_sets', 'deck_history', key, era ?? 'all', scopeKey ?? 'any'],
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

      const rows = ((data ?? []) as unknown as Array<{
        weight_kg: number; reps: number; rpe: number | null; set_number: number; set_type: string | null
        side: string | null; pair_id: string | null
        exercises: { name: string }
        workout_sessions: { started_at: string; day_key: string | null }
      }>)
        // Only previous sessions of the SAME routine.
        .filter((r) => !scopeKey || r.workout_sessions.day_key === scopeKey)

      // Rows arrive newest-first (created_at desc) to pick each exercise's most
      // recent session. But WITHIN a session the working sets are batch-inserted
      // and share a created_at, so their relative order here is undefined — the
      // old code appended in that arbitrary order and then blindly `.reverse()`d,
      // which flipped an already-correct list into `11, 12, 12`. Sort by
      // set_number instead: deterministic 1..n regardless of insert timing.
      type Row = HistorySet & { setNumber: number }
      const TAGS: readonly string[] = ['warmup', 'failure', 'dropset']
      const acc = new Map<string, { date: string; rows: Row[] }>()
      for (const r of rows) {
        const date = r.workout_sessions.started_at.slice(0, 10)
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
          .map(({ setNumber, ...s }) => s)
        out.set(name, { date, sets })
      }
      return out
    },
  })
}

/**
 * The same memory, UNSCOPED — the last time you did this movement at all.
 *
 * ── WHY BOTH EXIST ───────────────────────────────────────────────────────────
 * The routine-scoped lookup above is right for everything that PACES you: rep
 * windows, the ceiling check and progression are per-routine, and blending
 * Legs A's leg curl with Legs B's is what made the coach argue with itself.
 *
 * The "Previous" column on a set row is a different question. It asks what you
 * lifted last time you did this movement, and the honest answer on a Friday is
 * Monday's leg curl even though Monday was a different routine — otherwise the
 * column is empty on every movement that appears in two splits, which is most
 * of them.
 *
 * It is a second query rather than a second filter over one, deliberately: the
 * scoped hook's `queryKey` carries the routine, and widening it would rebuild
 * the whole cache entry every time a deck opened on a different day.
 */
export function useGlobalSetHistory(names: string[], era?: Era) {
  return useExerciseSetHistory(names, era)
}
