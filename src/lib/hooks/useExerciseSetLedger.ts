'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { programDayByKey } from '@/lib/programs'
import { sessionVolumeKg, type VolumeSet } from '@/lib/sessions/volume'
import type { HistorySetType } from './useExerciseSetHistory'
import { isWorkingSet } from '@/lib/training/setTags'

/** One logged set, as the ledger renders it. */
export interface LedgerSet {
  setNumber: number
  weightKg: number
  reps: number
  rpe: number | null
  setType: HistorySetType | null
  side: 'L' | 'R' | null
  pairId: string | null
  /** Working-set position (warm-ups are null), so the row can say "3" not "4". */
  workingNum: number | null
}

/** Every set of one exercise in one session. */
export interface LedgerSession {
  sessionId: string
  date: string
  /** The workout this happened on — "Upper A", not a weekday. */
  label: string
  sets: LedgerSet[]
  /** The exercise's tonnage in that session, pairs collapsed to the weak side. */
  volumeKg: number
  workingSets: number
}

/**
 * The full per-session set ledger for ONE exercise.
 *
 * ── WHY THIS IS A NEW QUERY ──────────────────────────────────────────────────
 * Two hooks were already near it and neither answers the question.
 *
 *   `useExerciseHistory` (RPC `exercise_history`) returns one AGGREGATED row per
 *   day — top weight, best 1RM, session volume, reps. It draws the charts. It
 *   cannot say what the third set was.
 *
 *   `useExerciseSetHistory` returns real sets, and then throws all but the most
 *   recent session away ("a different (older) date for a known name is
 *   skipped") — it exists to seed a deck, not to be read.
 *
 * So the sets were on screen only inside a session report, one session at a
 * time, reachable only if you remembered which day you did the movement.
 *
 * ── WHAT IT IS KEYED ON ──────────────────────────────────────────────────────
 * `exercise_id`, not name. The library already has the UUID (it is the route
 * param), and a name key would re-merge the catalog splits that exist on
 * purpose — Seated Cable Row is three exercises by grip, and their ledgers are
 * not interchangeable.
 *
 * ── THE FLOOR (moved back four months on 2026-08-22) ─────────────────────────
 * Per-set history used to begin 2026-07-16: everything before it arrived from
 * Notion as session totals with zero rows in `workout_sets`. Those sets were
 * never actually lost — they were itemised in each session's `report_md` — and
 * `scripts/backfill-notion-sets.mjs` parsed 1,586 of them back into rows, so the
 * record now opens on the first PPL session.
 *
 * TEN sessions still carry no sets, because their rebuilt tonnage disagreed with
 * the stored `total_volume_kg` and the backfill refuses to write a session it
 * cannot reconcile: 2026-04-27, 05-13, 05-15, 05-18, 05-22, 05-28, 06-01, 06-09,
 * 06-14, 06-23. An empty tail here still means "not recorded", never "not
 * trained" — which is why the component states the floor rather than letting the
 * list imply it.
 */
export const PER_SET_HISTORY_FROM = '2026-03-10'

export function useExerciseSetLedger(exerciseId: string | null, sessionLimit = 25) {
  return useQuery({
    queryKey: ['workout_sets', 'exercise_ledger', exerciseId, sessionLimit],
    enabled: !!exerciseId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LedgerSession[]> => {
      const { data, error } = await supabase
        .from('workout_sets')
        .select('weight_kg, reps, rpe, set_number, set_type, side, pair_id, workout_sessions!inner(id, started_at, day_key, split_day)')
        .eq('exercise_id', exerciseId as string)
        .order('created_at', { ascending: false })
        // Generous, and bounded: 25 sessions of a heavily-paired lift is ~200
        // rows, but the ORDER is by insert time and a session's rows share it,
        // so the cap has to clear the newest N sessions whole rather than
        // slicing one in half.
        .limit(1200)
      if (error) throw error

      return groupLedgerRows((data ?? []) as unknown as LedgerRow[], sessionLimit)
    },
  })
}

/** One `workout_sets` row as PostgREST hands it back, joined to its session. */
export interface LedgerRow {
  weight_kg: number
  reps: number
  rpe: number | string | null
  set_number: number
  set_type: string | null
  side: string | null
  pair_id: string | null
  workout_sessions: { id: string; started_at: string; day_key: string | null; split_day: string | null }
}

const TAGS: readonly string[] = ['warmup', 'failure', 'dropset', 'ghost']

/**
 * Rows → sessions, newest first.
 *
 * Exported and pure so the grouping can be tested directly: the three rules it
 * enforces (deterministic set order, a unilateral pair counted once, tonnage at
 * the weaker side) are exactly the ones that have been got wrong elsewhere in
 * this codebase, and none of them are visible in a screenshot.
 */
export function groupLedgerRows(rows: LedgerRow[], sessionLimit = 25): LedgerSession[] {
  const bySession = new Map<string, { date: string; dayKey: string | null; splitDay: string | null; rows: LedgerSet[] }>()

  for (const r of rows) {
    const s = r.workout_sessions
    const bucket = bySession.get(s.id) ?? {
      date: s.started_at.slice(0, 10), dayKey: s.day_key, splitDay: s.split_day, rows: [],
    }
    bucket.rows.push({
      setNumber: r.set_number,
      weightKg: r.weight_kg,
      reps: r.reps,
      // numeric(3,1) arrives as a string on some PostgREST paths; coerce once
      // here so nothing downstream compares '8.5' to 8.5.
      rpe: r.rpe != null && Number.isFinite(Number(r.rpe)) ? Number(r.rpe) : null,
      setType: r.set_type && TAGS.includes(r.set_type) ? (r.set_type as HistorySetType) : null,
      side: r.side === 'L' || r.side === 'R' ? r.side : null,
      pairId: r.pair_id ?? null,
      workingNum: null,
    })
    bySession.set(s.id, bucket)
  }

  const out: LedgerSession[] = []
  for (const [sessionId, b] of bySession) {
    // Rows arrive newest-first and a session's working sets are batch-inserted on
    // one `created_at`, so their order here is undefined. Sort by set_number:
    // deterministic 1..n regardless of insert timing.
    const sets = [...b.rows].sort((a, z) => a.setNumber - z.setNumber)

    // Working-set numbering, with a unilateral pair counted ONCE — the same rule
    // the session report's ledger uses, so "set 3" means set 3 in both.
    let n = 0
    const seenPairs = new Set<string>()
    for (const s of sets) {
      if (!isWorkingSet(s.setType)) continue
      if (s.pairId) {
        if (!seenPairs.has(s.pairId)) { seenPairs.add(s.pairId); n += 1 }
        s.workingNum = n
      } else {
        n += 1
        s.workingNum = n
      }
    }

    const vs: VolumeSet[] = sets
      .filter((s) => isWorkingSet(s.setType))
      .map((s) => ({ weightKg: s.weightKg, reps: s.reps, side: s.side, pairId: s.pairId }))

    out.push({
      sessionId,
      date: b.date,
      label: workoutLabel(b.dayKey, b.splitDay),
      sets,
      volumeKg: Math.round(sessionVolumeKg(vs)),
      workingSets: n,
    })
  }

  return out
    .sort((a, z) => (a.date < z.date ? 1 : a.date > z.date ? -1 : 0))
    .slice(0, sessionLimit)
}

/**
 * The workout a session belongs to.
 *
 * `day_key` is the exact program-day identity and survives a swap; `split_day`
 * is the legacy fallback. Never the weekday — a Wednesday session can be Upper A
 * (see the swap rules), and inferring the split from the date is how "Delts &
 * Arms" ended up plotted on the Upper A curve.
 */
function workoutLabel(dayKey: string | null, splitDay: string | null): string {
  const d = dayKey ? programDayByKey(dayKey) : undefined
  if (d) return d.sub ? `${d.label} · ${d.sub}` : d.label
  if (splitDay) return splitDay[0].toUpperCase() + splitDay.slice(1)
  return 'Session'
}
