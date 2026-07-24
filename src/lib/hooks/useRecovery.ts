'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'

/** Muscles worth tracking soreness for (legs first — they drive the protocol). */
export const DOMS_MUSCLES = ['Quads', 'Hamstrings', 'Calves', 'Glutes', 'Chest', 'Back', 'Shoulders', 'Arms'] as const
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

export interface BodyMeasurement {
  date: string
  navelWaistCm: number | null
  relaxedArmCm: number | null
  thighCm: number | null
}

/**
 * Tape measurements — the APEX-5.1 answer to noisy BIA. Waist/arm/thigh move
 * slowly and honestly, so they beat scale body-fat% for judging recomposition.
 */
export function useMeasurements(limit = 30) {
  return useQuery({
    queryKey: ['body_measurements', limit],
    staleTime: 60_000,
    queryFn: async (): Promise<BodyMeasurement[]> => {
      const { data, error } = await supabase.from('body_measurements')
        .select('date, navel_waist_cm, relaxed_arm_cm, thigh_cm')
        .order('date', { ascending: false }).limit(limit)
      if (error) return []
      return ((data ?? []) as Array<Record<string, string | number | null>>).map((r) => ({
        date: r.date as string,
        navelWaistCm: (r.navel_waist_cm as number) ?? null,
        relaxedArmCm: (r.relaxed_arm_cm as number) ?? null,
        thighCm: (r.thigh_cm as number) ?? null,
      }))
    },
  })
}

export function useSaveMeasurement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (m: { date: string; navelWaistCm: number | null; relaxedArmCm: number | null; thighCm: number | null }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('body_measurements').upsert({
        user_id: user.id, date: m.date,
        navel_waist_cm: m.navelWaistCm, relaxed_arm_cm: m.relaxedArmCm, thigh_cm: m.thighCm,
      } as never, { onConflict: 'user_id,date' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['body_measurements'] }) },
  })
}
