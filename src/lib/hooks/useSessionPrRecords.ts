'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import {
  buildBaselines, detectSessionPrs, type AxisRecord, type PrAxis,
} from '@/lib/training/prEngine'
import { prFloorFor } from '@/lib/training/prTruth'
import { isTimedExercise } from '@/lib/exercises/timed'
import { repWindowFor } from '@/lib/training/ceilings'
import type { SessionDetail } from '@/lib/hooks/useSessionDetail'

/**
 * The slice of a session this needs — id, when, which routine, and the sets.
 *
 * A structural subset rather than the whole `SessionDetail`, so a caller that
 * holds those four facts (the exercise ledger holds exactly them, as props) can
 * ask without being handed the entire detail object first.
 */
export type PrSessionInput = Pick<SessionDetail, 'id' | 'date' | 'dayKey' | 'exercises'>

/**
 * What a past session's records actually BEAT — recomputed, because the ledger
 * cannot say.
 *
 * ── WHY THIS IS NOT A `SELECT` ───────────────────────────────────────────────
 * The obvious implementation is to read `personal_records` and show the delta.
 * There is no delta there to read: the table holds `value` and no `previous`,
 * and it is written with an upsert-on-conflict, so recording a new best
 * DESTROYS the figure it replaced. That is fine for a record book — it is a
 * list of current bests — and useless for the question "by how much".
 *
 * The live deck answers it because `detectSessionPrs` captures the beaten
 * baseline in memory, one line before absorbing the set that beat it (see
 * `beatenBaselines`). It exists only for the duration of that commit.
 *
 * So the report re-derives it: every set of every exercise in this session,
 * from STRICTLY BEFORE this session's date, folded into baselines exactly as
 * `save.ts` folds them, then the session replayed through the same detector.
 *
 * ── AND WHY RE-DERIVING IS THE POINT, NOT A COMPROMISE ───────────────────────
 * The alternative — render the new value with no comparison — would have been a
 * third of the work. But then the two sheets would be different components
 * saying different things about one record, and the first time the engine's
 * rules changed only one of them would follow. Running the real detector means
 * the report and the logger cannot disagree: they are the same arithmetic over
 * the same history.
 *
 * ── LAZY ON PURPOSE ──────────────────────────────────────────────────────────
 * This is a second round trip that fetches every historical set for the
 * session's movements. Nobody pays for it until a medal is actually tapped —
 * `enabled` gates the whole thing, and TanStack keeps the answer for the rest
 * of the visit.
 */

/** One set's records, keyed by the axis each one claimed. */
export type SetRecords = Partial<Record<PrAxis, AxisRecord>>

export interface SessionPrRecords {
  /** `${exerciseId}:${setNumber}` → the axes that set won, with what they beat. */
  bySet: Map<string, SetRecords>
}

/** The identity a set is filed under here. Stable across renders. */
export function prSetKey(exerciseId: string, setNumber: number): string {
  return `${exerciseId}:${setNumber}`
}

/** One historical set, as the detector needs it. Shaped by the query below. */
export interface PrHistoryRow {
  /** Canonical exercise NAME — the key everything here is filed under. */
  name: string
  /** Session date, so rows from this session or later can be excluded. */
  date: string
  weightKg: number
  reps: number
  est1rmKg: number | null
  setType: string | null
  side: string | null
  pairId: string | null
}

/**
 * The whole derivation, with the fetch taken out.
 *
 * Separated so it can be tested against a fixture: the claim worth pinning is
 * not that a query returns rows, it is that this page resolves the SAME record
 * the live logger did — same baselines, same order, same set. A hook that owns
 * both the fetch and the arithmetic can only be tested by mocking Supabase,
 * which tests the mock.
 */
export function sessionPrRecords(detail: PrSessionInput, history: readonly PrHistoryRow[]): SessionPrRecords {
  const bySet = new Map<string, SetRecords>()
  if (!detail.exercises.length) return { bySet }

  // Baselines are keyed by NAME here, not by `exercise_id` as in `save.ts`.
  // Both are valid — the engine takes a resolver precisely because the two
  // callers hold different identifiers — and the name is what this page already
  // has, and what `prFloorFor` and `personal_records.exercise_key` are keyed on,
  // so nothing needs translating.
  const floorOf = (name: string) => repWindowFor(name, detail.dayKey ?? undefined)?.floor ?? null

  // STRICTLY BEFORE. A session must not be judged against itself: including its
  // own rows would put every record's baseline at the record's own value and
  // every delta at zero.
  const before = history.filter((r) => r.date < detail.date)

  const baselines = buildBaselines(
    before.map((r) => ({
      key: r.name,
      weightKg: r.weightKg, reps: r.reps, est1rm: r.est1rmKg,
      setType: r.setType, side: r.side, pairId: r.pairId,
      repFloor: floorOf(r.name),
    })),
    (key) => isTimedExercise(key),
    // Without the floor, a return to an old load could still read as a new
    // record: the 2026-08-22 backfill rebuilt most of the Notion era, but ten
    // sessions remain set-less and PR history was deliberately left frozen
    // rather than recomputed over the new rows. See prTruth.ts.
    (key) => prFloorFor(key),
  )

  // IN THE ORDER THEY WERE PERFORMED. `detectSessionPrs` judges later sets
  // against earlier ones, so exercise order then set number — which is the order
  // `useSessionDetail` already returns.
  const flat = detail.exercises.flatMap((e) => e.sets.map((set) => ({ e, set })))
  const candidates = flat.map(({ e, set }) => ({
    key: e.name,
    weightKg: set.weightKg, reps: set.reps,
    setType: set.setType ?? null,
    timed: isTimedExercise(e.name),
    repFloor: floorOf(e.name),
    side: set.side, pairId: set.pairId,
    date: detail.date, exerciseName: e.name, setNumber: set.setNumber,
  }))

  const result = detectSessionPrs(candidates, baselines)
  result.perSet.forEach((det, i) => {
    if (!det.axes.length) return
    const { e, set } = flat[i]
    bySet.set(prSetKey(e.exerciseId, set.setNumber), det.records)
  })
  return { bySet }
}

export function useSessionPrRecords(detail: PrSessionInput | undefined, enabled: boolean) {
  const sessionId = detail?.id ?? null
  return useQuery({
    queryKey: ['session_pr_records', sessionId],
    enabled: enabled && !!detail,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SessionPrRecords> => {
      const d = detail as PrSessionInput
      const names = d.exercises.map((e) => e.name)
      if (!names.length) return { bySet: new Map() }

      // Every historical row for these movements, GLOBALLY — a record is a fact
      // about the movement, not about the routine it was trained on. Scoping to
      // the program day would let a lift that appears in two splits set a
      // "record" it had already beaten on the other one.
      const { data, error } = await supabase
        .from('workout_sets')
        .select('weight_kg, reps, est_1rm_kg, set_type, side, pair_id, exercises!inner(name), workout_sessions!inner(started_at)')
        .in('exercises.name', names)
        .order('created_at', { ascending: true })
        .limit(4000)
      if (error) throw error

      type Row = {
        weight_kg: number; reps: number; est_1rm_kg: number | null
        set_type: string | null; side: string | null; pair_id: string | null
        exercises: { name: string }
        workout_sessions: { started_at: string }
      }
      const history: PrHistoryRow[] = ((data ?? []) as unknown as Row[]).map((r) => ({
        name: r.exercises.name,
        date: r.workout_sessions.started_at.slice(0, 10),
        weightKg: r.weight_kg, reps: r.reps, est1rmKg: r.est_1rm_kg,
        setType: r.set_type, side: r.side, pairId: r.pair_id,
      }))

      return sessionPrRecords(d, history)
    },
  })
}
