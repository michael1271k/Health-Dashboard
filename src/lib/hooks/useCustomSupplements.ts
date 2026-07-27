'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { SupplementSlot } from '@/lib/supplements'

/** Optional per-supplement training/rest dose split lives in the jsonb schedule
 *  (no extra columns) — e.g. Multivitamin 2 tabs on training days, 1 on rest. */
export interface CustomSchedule {
  days?: number[]        // 0=Sun … 6=Sat; absent ⇒ every day
  trainingDose?: string  // dose on training days (falls back to `dose`)
  restDose?: string      // dose on rest days (falls back to `dose`)
}

export interface CustomSupplement {
  id: string
  name: string
  dose: string
  color: string | null
  form: string | null   // pill | powder | capsule | …
  time: string | null   // HH:MM
  schedule: CustomSchedule | null
}

export interface NewCustomSupplement {
  name: string
  dose: string
  color: string
  form: string
  time: string
  days: number[]
  trainingDose?: string
  restDose?: string
}

/** The dose for a custom supplement on a training vs rest day. */
export function customDoseFor(c: CustomSupplement, isTraining: boolean): string {
  return (isTraining ? c.schedule?.trainingDose : c.schedule?.restDose) || c.dose
}

const KEY = ['custom_supplements'] as const

/** Every custom supplement the user has defined (self-heals if the table is absent). */
export function useCustomSupplements() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<CustomSupplement[]> => {
      const { data, error } = await supabase
        .from('custom_supplements')
        .select('id, name, dose, color, form, time, schedule')
        .order('time', { ascending: true })
      if (error) return [] // table not migrated yet
      return (data ?? []) as CustomSupplement[]
    },
    staleTime: 60_000,
  })
}

export function useAddCustomSupplement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (s: NewCustomSupplement) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const schedule: CustomSchedule = { days: s.days }
      if (s.trainingDose) schedule.trainingDose = s.trainingDose
      if (s.restDose) schedule.restDose = s.restDose
      const { error } = await supabase.from('custom_supplements').insert({
        user_id: session.user.id, name: s.name, dose: s.dose, color: s.color,
        form: s.form, time: s.time, schedule,
      } as unknown as never)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteCustomSupplement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('custom_supplements').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

/**
 * Custom supplements due on a weekday → SupplementSlot rows the checklist can
 * render + log alongside the built-in protocol. Each item's key is
 * `custom:<id>` so it persists to supplement_log like any other. Grouped by time.
 */
export function customSlotsForDate(customs: CustomSupplement[], weekday: number, isTraining = true): SupplementSlot[] {
  const due = customs.filter((c) => !c.schedule?.days?.length || c.schedule.days.includes(weekday))
  if (!due.length) return []
  const byTime = new Map<string, CustomSupplement[]>()
  for (const c of due) {
    const t = c.time || '—'
    byTime.set(t, [...(byTime.get(t) ?? []), c])
  }
  return [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, items]) => ({
      key: `custom-${time}`,
      time,
      label: 'Custom',
      accent: items[0].color || '#8E9AAC',
      items: items.map((c) => ({ key: `custom:${c.id}`, name: c.name, dose: customDoseFor(c, isTraining) })),
    }))
}
