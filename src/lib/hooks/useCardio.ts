'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useOptimisticMutation } from '@/lib/hooks/useOptimisticMutation'
import { weekStartOf, isoAddDays } from '@/lib/utils/week'
import { isZone2 } from '@/lib/cardio/zone2'

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

/**
 * ── THE ROW APPEARS ON THE TAP, NOT ON THE ROUND TRIP ────────────────────────
 * This was invalidate-on-success, so logging a walk left the day's list
 * unchanged through `auth.getSession()`, an insert, a possible column-fallback
 * retry, and a refetch. The optimistic row carries a temporary id — the real one
 * is assigned by the database — which is fine because nothing addresses a cardio
 * row by id until the invalidation below has replaced it with the server's copy.
 * `useDeleteCardio` is the only id consumer, and a row you have not seen come
 * back yet is a row you have not had time to delete.
 */
const OPTIMISTIC_ID_PREFIX = 'pending:'

export function useAddCardio(date: string) {
  return useOptimisticMutation<NewCardio, void>({
    patches: (c) => [{
      key: ['cardio_logs', date],
      apply: (prev) => {
        const rows = prev as CardioLog[] | undefined
        if (!rows) return undefined
        const pending: CardioLog = {
          id: `${OPTIMISTIC_ID_PREFIX}${Date.now()}`,
          kind: c.kind,
          distance_m: c.distance_m ?? null,
          duration_min: c.duration_min ?? null,
          kcal: c.active_kcal ?? null,
          active_kcal: c.active_kcal ?? null,
          total_kcal: c.total_kcal ?? null,
          avg_hr: c.avg_hr ?? null,
          effort: c.effort ?? null,
          from_healthkit: false,
        }
        // Appended, because the query orders by `created_at` ascending and this
        // is the newest row.
        return [...rows, pending]
      },
    }],
    // The day's list AND the history the records + prefill derive from.
    invalidate: [['cardio_logs']],
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

// The definition moved to `lib/cardio/zone2.ts` — this module is `'use client'`,
// and the widget route needs the same two numbers to count the same way. It is
// re-exported so every existing importer is unchanged.
export { ZONE2_WEEKLY_TARGET } from '@/lib/cardio/zone2'

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
      return (data ?? []).filter((r) => isZone2((r as { duration_min: number | null }).duration_min)).length
    },
  })
}
