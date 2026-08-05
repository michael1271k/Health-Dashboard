'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { weekStartOf, isoAddDays } from '@/lib/utils/week'

export interface CardioLog {
  id: string
  kind: string          // walk | run
  distance_m: number | null
  duration_min: number | null
  /** LEGACY single-energy column. Every row logged before the full field set
   *  has only this; read it through `activeKcalOf()`, never directly. */
  kcal: number | null
  active_kcal: number | null
  total_kcal: number | null
  avg_hr: number | null
  effort: number | null           // Borg CR10
  from_healthkit: boolean
}

export interface NewCardio {
  kind: 'walk' | 'run'
  distance_m: number | null
  duration_min: number | null
  active_kcal: number | null
  total_kcal: number | null
  avg_hr: number | null
  effort: number | null
}

/** The columns added after the table shipped. Dropped on a PGRST204 retry so an
 *  unmigrated DB still records the walk rather than losing it. */
const EXTRA_COLS = ['active_kcal', 'total_kcal', 'avg_hr', 'effort'] as const
const SELECT_FULL = 'id, kind, distance_m, duration_min, kcal, active_kcal, total_kcal, avg_hr, effort, from_healthkit'
const SELECT_BASE = 'id, kind, distance_m, duration_min, kcal, from_healthkit'

/** Manual cardio (walk/run) logged for a day. A SEPARATE ledger from Active
 *  Energy — deliberately never summed into it, so nothing double-counts. */
export function useCardioLogs(date: string) {
  return useQuery({
    queryKey: ['cardio_logs', date],
    enabled: !!date,
    queryFn: async (): Promise<CardioLog[]> => {
      const q = (cols: string) => supabase.from('cardio_logs').select(cols)
        .eq('date', date).order('created_at', { ascending: true })
      let { data, error } = await q(SELECT_FULL)
      // Pre-migration DB: fall back to the original column set rather than
      // rendering an empty day.
      if (error) ({ data, error } = await q(SELECT_BASE))
      if (error) return [] // table not migrated at all
      return ((data ?? []) as unknown as Array<Partial<CardioLog>>).map((r) => ({
        id: r.id!, kind: r.kind!, distance_m: r.distance_m ?? null,
        duration_min: r.duration_min ?? null, kcal: r.kcal ?? null,
        active_kcal: r.active_kcal ?? null, total_kcal: r.total_kcal ?? null,
        avg_hr: r.avg_hr ?? null, effort: r.effort ?? null,
        from_healthkit: r.from_healthkit ?? false,
      }))
    },
    staleTime: 30_000,
  })
}

/**
 * Every cardio row, for grading records and for prefill.
 *
 * One query rather than one per axis: `cardio_logs` is a handful of rows a week,
 * and the record engine is pure and read-time (see lib/cardio/cardioPrs.ts) —
 * there is no stored PR to keep in sync, so the whole ledger IS the record book.
 */
export function useCardioHistory() {
  return useQuery({
    queryKey: ['cardio_logs', 'history'],
    staleTime: 60_000,
    queryFn: async (): Promise<Array<CardioLog & { date: string }>> => {
      const q = (cols: string) => supabase.from('cardio_logs').select(cols)
        .order('date', { ascending: false }).limit(500)
      let { data, error } = await q(`date, ${SELECT_FULL}`)
      if (error) ({ data, error } = await q(`date, ${SELECT_BASE}`))
      if (error) return []
      return ((data ?? []) as unknown as Array<Partial<CardioLog> & { date: string }>).map((r) => ({
        id: r.id!, kind: r.kind!, date: r.date, distance_m: r.distance_m ?? null,
        duration_min: r.duration_min ?? null, kcal: r.kcal ?? null,
        active_kcal: r.active_kcal ?? null, total_kcal: r.total_kcal ?? null,
        avg_hr: r.avg_hr ?? null, effort: r.effort ?? null,
        from_healthkit: r.from_healthkit ?? false,
      }))
    },
  })
}

/**
 * The most recent walk / run, to seed the next one.
 *
 * Same route as the body panel's carry-forward: it is offered, not applied.
 * Repeating yesterday's loop is the common case and re-typing 3.2 km every time
 * is the friction; writing it for you would be inventing a session.
 */
export function useLastCardio(kind: 'walk' | 'run') {
  const { data } = useCardioHistory()
  return (data ?? []).find((r) => r.kind === kind) ?? null
}

export function useAddCardio(date: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: NewCardio) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const row: Record<string, unknown> = {
        user_id: session.user.id, date, kind: c.kind,
        distance_m: c.distance_m, duration_min: c.duration_min,
        // `kcal` stays written so historical readers (and the weekly export's
        // pre-migration fallback) keep seeing the active figure.
        kcal: c.active_kcal,
        active_kcal: c.active_kcal, total_kcal: c.total_kcal,
        avg_hr: c.avg_hr, effort: c.effort,
        from_healthkit: false,
      }
      let { error } = await supabase.from('cardio_logs').insert(row as unknown as never)
      if (error && /schema cache|PGRST204|column/i.test(error.message)) {
        for (const k of EXTRA_COLS) delete row[k]
        ;({ error } = await supabase.from('cardio_logs').insert(row as unknown as never))
      }
      if (error) throw error
    },
    onSuccess: () => {
      // The day's list AND the history the records + prefill derive from.
      qc.invalidateQueries({ queryKey: ['cardio_logs'] })
    },
  })
}

/** Delete is date-free: the row id is enough, and every cardio query is
 *  invalidated afterwards because a deletion can move a record. */
export function useDeleteCardio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cardio_logs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      // The day's list AND the history the records + prefill derive from.
      qc.invalidateQueries({ queryKey: ['cardio_logs'] })
    },
  })
}

/** Zone-2 target = 2 steady cardio sessions per week (the plan's rest-day work). */
export const ZONE2_WEEKLY_TARGET = 2
/** A session counts as Zone-2 when it's a steady ≥ 20 min effort (excludes the
 *  5-min treadmill warm-up); anything shorter isn't a Zone-2 block. */
const ZONE2_MIN_MINUTES = 20

/** How many Zone-2 sessions have been logged in the week containing `date`. */
export function useZone2Week(date: string) {
  return useQuery({
    queryKey: ['cardio_logs', 'zone2_week', weekStartOf(date)],
    enabled: !!date,
    staleTime: 30_000,
    queryFn: async (): Promise<number> => {
      const from = weekStartOf(date)
      const to = isoAddDays(from, 7)
      const { data, error } = await supabase
        .from('cardio_logs')
        .select('duration_min')
        .gte('date', from).lt('date', to)
      if (error) return 0 // table not migrated yet
      return (data ?? []).filter((r) => ((r as { duration_min: number | null }).duration_min ?? 0) >= ZONE2_MIN_MINUTES).length
    },
  })
}
