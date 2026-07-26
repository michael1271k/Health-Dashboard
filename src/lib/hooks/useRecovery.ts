'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'
import { programDayByKey } from '@/lib/programs'

/**
 * DOMS tracking across the whole body. Each muscle's soreness is auto-attributed
 * to the most recent session (within the 72h window) that actually TRAINED it —
 * so "moderate quads" reads back against Legs & Core B while "sore chest" points
 * at the last Upper day, filtered by the session's own muscle tags.
 *
 * Tape measurements (waist/arm/thigh) were removed entirely — see the migration
 * that drops `body_measurements`.
 */
// Standardized display order: upper (Chest → Shoulders) then lower (Quads → Calves).
export const DOMS_MUSCLES = ['Chest', 'Back', 'Arms', 'Shoulders', 'Quads', 'Hamstrings', 'Calves'] as const
export type DomsMuscle = (typeof DOMS_MUSCLES)[number]

/** Fold a program muscle token into one of the tracked DOMS muscles (or null). */
function domsMuscleOf(token: string): DomsMuscle | null {
  switch (token.toLowerCase().replace(/[\s-]+/g, '_')) {
    case 'quads': case 'quadriceps': return 'Quads'
    case 'hamstrings': case 'glutes': return 'Hamstrings'
    case 'calves': return 'Calves'
    case 'back': case 'lats': case 'upper_back': case 'lower_back': case 'traps': return 'Back'
    case 'chest': case 'pecs': return 'Chest'
    case 'biceps': case 'triceps': case 'forearms': return 'Arms'
    case 'shoulders': case 'delts': case 'side_delts': case 'rear_delts': case 'front_delts': return 'Shoulders'
    default: return null   // core, etc. — not a tracked DOMS muscle
  }
}

/** The DOMS muscles a session trained — from its program day, else a split guess. */
function sessionDomsMuscles(dayKey: string | null, split: string): Set<DomsMuscle> {
  const out = new Set<DomsMuscle>()
  const day = dayKey ? programDayByKey(dayKey) : null
  if (day) {
    for (const ex of day.exercises) for (const t of ex.muscles) {
      const m = domsMuscleOf(t); if (m) out.add(m)
    }
    return out
  }
  // Legacy rows (no day_key): a coarse split → muscle guess.
  if (split === 'legs' || split === 'lower') { out.add('Quads'); out.add('Hamstrings'); out.add('Calves') }
  else { out.add('Chest'); out.add('Back'); out.add('Shoulders'); out.add('Arms') }
  return out
}

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
 * Per-muscle DOMS attribution: each tracked muscle → the most recent session in
 * the 72h window that actually trained it (filtered by the session's muscle tags).
 *
 * DOMS peaks at 24–48h and is usually gone by 72h, so a rating on Sunday is
 * reporting on Friday's session. Sore quads point at the last leg day; a sore
 * chest points at the last Upper day — each muscle to the workout that caused it.
 */
export function useDomsSources(date = logicalTodayISO()) {
  return useQuery({
    queryKey: ['doms_sources', date],
    staleTime: 60_000,
    queryFn: async (): Promise<Partial<Record<DomsMuscle, DomsSource>>> => {
      const from = new Date(`${date}T00:00:00Z`)
      from.setUTCDate(from.getUTCDate() - (DOMS_WINDOW_DAYS - 1))
      const end = new Date(`${date}T00:00:00Z`)
      end.setUTCDate(end.getUTCDate() + 1)
      const { data, error } = await supabase.from('workout_sessions')
        .select('id, started_at, split_day, day_key')
        .gte('started_at', from.toISOString())
        .lt('started_at', end.toISOString())
        .order('started_at', { ascending: false })   // newest first → first match wins
      if (error) return {}
      const rows = (data ?? []) as Array<{ id: string; started_at: string; split_day: string; day_key: string | null }>
      const byMuscle: Partial<Record<DomsMuscle, DomsSource>> = {}
      for (const r of rows) {
        const sessionDate = r.started_at.slice(0, 10)
        const programDay = r.day_key ? programDayByKey(r.day_key) : null
        const src: DomsSource = {
          sessionId: r.id,
          dayKey: r.day_key,
          label: programDay
            ? (programDay.sub ? `${programDay.label} · ${programDay.sub}` : programDay.label)
            : r.split_day[0].toUpperCase() + r.split_day.slice(1),
          date: sessionDate,
          dayOffset: Math.max(0, dayDiff(sessionDate, date)),
        }
        for (const m of sessionDomsMuscles(r.day_key, r.split_day)) {
          if (!byMuscle[m]) byMuscle[m] = src   // newest-first, so first is most recent
        }
      }
      return byMuscle
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
