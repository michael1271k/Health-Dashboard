'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'

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

/**
 * Rate (or re-rate) a muscle. Upserts on (user_id, date, muscle_group), so the
 * rating stays editable all day — tapping a different level replaces it rather
 * than stacking rows.
 */
export function useLogDoms(date = logicalTodayISO()) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ muscle, severity }: { muscle: string; severity: number }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('doms_logs').upsert(
        { user_id: user.id, date, muscle_group: muscle, severity } as never,
        { onConflict: 'user_id,date,muscle_group' },
      )
      if (error) throw new Error(error.message)
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
