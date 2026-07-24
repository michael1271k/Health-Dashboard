'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'
import { programDayByKey } from '@/lib/programs'

/**
 * DOMS tracking, scoped to the two muscles that actually steer the protocol.
 *
 * The eight-muscle grid was noise: upper-body soreness never changed a decision,
 * and rating eight groups daily is a chore nobody sustains. Quads and hamstrings
 * are the ones that gate whether the next leg day runs as programmed.
 *
 * Tape measurements (waist/arm/thigh) were removed entirely — see the migration
 * that drops `body_measurements`.
 */
export const DOMS_MUSCLES = ['Quads', 'Hamstrings'] as const
export type DomsMuscle = (typeof DOMS_MUSCLES)[number]

export const DOMS_LEVELS = [
  { v: 0, label: 'None' },
  { v: 1, label: 'Mild' },
  { v: 2, label: 'Moderate' },
  { v: 3, label: 'Severe' },
] as const

/** Today's DOMS ratings, muscle → severity. Empty (not an error) pre-migration. */
export function useDoms(date = logicalTodayISO()) {
  return useQuery({
    queryKey: ['doms_logs', date],
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.from('doms_logs')
        .select('muscle_group, severity').eq('date', date)
      if (error) return {}   // table not migrated yet → degrade quietly
      const out: Record<string, number> = {}
      for (const r of (data ?? []) as Array<{ muscle_group: string; severity: number }>) {
        out[r.muscle_group] = r.severity
      }
      return out
    },
  })
}

/** The leg session a day's soreness is attributable to, and how long ago it was. */
export interface DomsSource {
  sessionId: string
  dayKey: string | null
  /** "Legs & Core B" — resolved from the program, falling back to the split. */
  label: string
  date: string
  /** 0 = same day as the session, 1 = next day, 2 = two days later. */
  dayOffset: number
}

/** How many days after a session DOMS is still worth rating. */
export const DOMS_WINDOW_DAYS = 3   // the session day + the following two

const dayDiff = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

/**
 * The leg session responsible for today's soreness — the most recent one within
 * the 72-hour window ending on `date`.
 *
 * DOMS peaks at 24–48h and is usually gone by 72h, so a rating on Sunday is
 * reporting on Friday's session, not on Sunday. Without the attribution the log
 * was just "quads: moderate on the 26th", which can't be read back against the
 * session that caused it.
 */
export function useDomsSource(date = logicalTodayISO()) {
  return useQuery({
    queryKey: ['doms_source', date],
    staleTime: 60_000,
    queryFn: async (): Promise<DomsSource | null> => {
      const from = new Date(`${date}T00:00:00Z`)
      from.setUTCDate(from.getUTCDate() - (DOMS_WINDOW_DAYS - 1))
      const end = new Date(`${date}T00:00:00Z`)
      end.setUTCDate(end.getUTCDate() + 1)
      const { data, error } = await supabase.from('workout_sessions')
        .select('id, started_at, split_day, day_key')
        .gte('started_at', from.toISOString())
        .lt('started_at', end.toISOString())
        .order('started_at', { ascending: false })
      if (error) return null
      const rows = (data ?? []) as Array<{ id: string; started_at: string; split_day: string; day_key: string | null }>
      // Quads/hamstrings soreness comes from leg days; an upper day isn't a
      // plausible cause, so it must never be credited with the rating.
      const legs = rows.find((r) => r.split_day === 'legs' || (r.day_key ?? '').startsWith('legs'))
      if (!legs) return null
      const sessionDate = legs.started_at.slice(0, 10)
      const programDay = legs.day_key ? programDayByKey(legs.day_key) : null
      return {
        sessionId: legs.id,
        dayKey: legs.day_key,
        label: programDay
          ? (programDay.sub ? `${programDay.label} · ${programDay.sub}` : programDay.label)
          : legs.split_day[0].toUpperCase() + legs.split_day.slice(1),
        date: sessionDate,
        dayOffset: Math.max(0, dayDiff(sessionDate, date)),
      }
    },
  })
}

/**
 * Rate (or re-rate) a muscle. Upserts on (user_id, date, muscle_group), so the
 * rating stays editable all day — tapping a different level replaces it rather
 * than stacking rows.
 *
 * `source` ties the rating to the session that caused it. The write self-heals
 * if `source_session_id` / `source_day_key` aren't migrated yet: it retries
 * without them, so ratings keep working until the SQL is run.
 */
export function useLogDoms(date = logicalTodayISO()) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ muscle, severity, source }: {
      muscle: string; severity: number; source?: DomsSource | null
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const base = { user_id: user.id, date, muscle_group: muscle, severity }
      const full = source
        ? { ...base, source_session_id: source.sessionId, source_day_key: source.dayKey }
        : base
      const { error } = await supabase.from('doms_logs').upsert(
        full as never, { onConflict: 'user_id,date,muscle_group' },
      )
      if (!error) return
      if (source && /source_session_id|source_day_key|column|schema cache|PGRST204/i.test(error.message)) {
        const { error: retry } = await supabase.from('doms_logs').upsert(
          base as never, { onConflict: 'user_id,date,muscle_group' },
        )
        if (retry) throw new Error(retry.message)
        return
      }
      throw new Error(error.message)
    },
    onMutate: async ({ muscle, severity }) => {
      const key = ['doms_logs', date]
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Record<string, number>>(key)
      qc.setQueryData(key, { ...(prev ?? {}), [muscle]: severity })
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['doms_logs', date], ctx.prev) },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['doms_logs', date] }) },
  })
}

/** DOMS across a date range — feeds the weekly AI export. */
export function useDomsRange(from: string, to: string) {
  return useQuery({
    queryKey: ['doms_logs', 'range', from, to],
    staleTime: 60_000,
    queryFn: async (): Promise<Array<{ date: string; muscle: string; severity: number }>> => {
      const { data, error } = await supabase.from('doms_logs')
        .select('date, muscle_group, severity').gte('date', from).lte('date', to)
      if (error) return []
      return ((data ?? []) as Array<{ date: string; muscle_group: string; severity: number }>)
        .map((r) => ({ date: r.date, muscle: r.muscle_group, severity: r.severity }))
    },
  })
}
