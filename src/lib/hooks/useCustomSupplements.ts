'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { SupplementSlot } from '@/lib/supplements'

/**
 * Everything about a supplement that isn't one of the table's own columns lives
 * in the `schedule` jsonb. Deliberately: the alternative is four more columns
 * and a paste-SQL round trip for a shape that is still settling.
 */
export interface CustomSchedule {
  days?: number[]        // 0=Sun … 6=Sat; absent ⇒ every day
  trainingDose?: string  // dose on training days (falls back to `dose`)
  restDose?: string      // dose on rest days (falls back to `dose`)
  /**
   * Stable log key. `supplement_log.item_key` and `SUPPLEMENT_NUTRIENTS` are both
   * keyed by this string, and there are months of ticked history behind the nine
   * seeded ones ('creatine', 'citrulline', …). A row without it falls back to
   * `custom:<id>`, which is what user-added supplements have always used.
   *
   * NEVER change one on an existing row: the history does not follow it.
   */
  key?: string
  /**
   * The slot this belongs to — 'Morning', 'Pre-Workout', … Purely a display
   * grouping; the TIME is what orders the day.
   */
  slot?: string
  /**
   * Free text stating a RULE the dose alone cannot ("2 on Monday & Friday",
   * "empty stomach"). Printed verbatim in the weekly export.
   */
  notes?: string
  /**
   * Taken only on training days. The pre-workout stimulants are the case: a flat
   * list makes them look like a daily dose, and the export used to recover this
   * by regex-matching the word "citrulline" in a rendered string.
   */
  trainingOnly?: boolean
}

export interface CustomSupplement {
  id: string
  name: string
  dose: string
  color: string | null
  form: string | null   // pill | powder | capsule | …
  time: string | null   // HH:MM
  schedule: CustomSchedule | null
  /** Micronutrient payload per UNIT of the dose; null = contributes none. */
  micros: Record<string, number> | null
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
  notes?: string
}

/** The dose for a custom supplement on a training vs rest day. */
export function customDoseFor(c: CustomSupplement, isTraining: boolean): string {
  return (isTraining ? c.schedule?.trainingDose : c.schedule?.restDose) || c.dose
}

/** The log key: the stable seeded one where present, else the row's own id. */
export function supplementKeyOf(c: CustomSupplement): string {
  return c.schedule?.key || `custom:${c.id}`
}

/** Every row's micronutrient payload, keyed for `supplementNutrients`. */
export function nutrientPayloads(customs: CustomSupplement[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const c of customs) if (c.micros) out[supplementKeyOf(c)] = c.micros
  return out
}

const KEY = ['custom_supplements'] as const

/**
 * Surfaces that must refresh after the stack changes.
 *
 * `weekly_export` is here for the reason the macro override needed it: the
 * export now reads the stack from this table and caches its rendered markdown,
 * so without the invalidation, editing a dose and immediately exporting emits
 * the dose that was just replaced — in a string that looks perfectly correct.
 */
const CASCADE_KEYS: readonly (readonly string[])[] = [
  // `['micros']` was here and matched no `useQuery` — the same dead-prefix
  // mistake `workoutKeys.ts` documents at length. Removed with W4.
  KEY, ['weekly_export'], ['supplement_log'],
]

/** Every custom supplement the user has defined (self-heals if the table is absent). */
export function useCustomSupplements() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<CustomSupplement[]> => {
      const { data, error } = await supabase
        .from('custom_supplements')
        .select('id, name, dose, color, form, time, schedule, micros')
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
      if (s.notes?.trim()) schedule.notes = s.notes.trim()
      const { error } = await supabase.from('custom_supplements').insert({
        user_id: session.user.id, name: s.name, dose: s.dose, color: s.color,
        form: s.form, time: s.time, schedule,
      } as unknown as never)
      if (error) throw error
    },
    onSuccess: () => { for (const k of CASCADE_KEYS) qc.invalidateQueries({ queryKey: k }) },
  })
}

/**
 * Edit a supplement in place — dose, time, notes, schedule.
 *
 * The missing verb. Add and Delete existed, so changing L-Citrulline from 3 g to
 * the 6 g actually taken meant deleting the row and rebuilding it, which for a
 * SEEDED supplement would have destroyed the `schedule.key` its months of ticked
 * history hang off. Patching `schedule` MERGES rather than replaces, so an edit
 * that never mentions the key cannot drop it.
 */
export function useUpdateCustomSupplement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch, schedule }: {
      id: string
      patch?: Partial<Pick<CustomSupplement, 'name' | 'dose' | 'color' | 'form' | 'time'>>
      schedule?: Partial<CustomSchedule>
    }) => {
      const { data: cur, error: readErr } = await supabase
        .from('custom_supplements').select('schedule').eq('id', id).single()
      if (readErr) throw readErr
      const merged = { ...((cur as { schedule: CustomSchedule | null } | null)?.schedule ?? {}), ...(schedule ?? {}) }
      const { error } = await supabase.from('custom_supplements')
        .update({ ...(patch ?? {}), ...(schedule ? { schedule: merged } : {}) } as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { for (const k of CASCADE_KEYS) qc.invalidateQueries({ queryKey: k }) },
  })
}

export function useDeleteCustomSupplement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('custom_supplements').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { for (const k of CASCADE_KEYS) qc.invalidateQueries({ queryKey: k }) },
  })
}

/**
 * The DB rows due on a day → `SupplementSlot`s the checklist renders and the
 * export prints. Grouped by TIME and ordered by it.
 *
 * This is the whole protocol, not a supplement to a hardcoded one. Every item —
 * the nine seeded ones and anything added since — is a row in
 * `custom_supplements`, so editing a dose in the UI changes the checklist, the
 * micro totals and the markdown export at once. See `stackForDate` in
 * lib/supplements.ts for the fallback when the table is empty.
 */
export function customSlotsForDate(customs: CustomSupplement[], weekday: number, isTraining = true): SupplementSlot[] {
  const due = customs.filter((c) =>
    (!c.schedule?.days?.length || c.schedule.days.includes(weekday))
    // A training-only item simply is not part of a rest day.
    && (isTraining || !c.schedule?.trainingOnly))
  if (!due.length) return []
  const byTime = new Map<string, CustomSupplement[]>()
  for (const c of due) {
    const t = c.time || '—'
    byTime.set(t, [...(byTime.get(t) ?? []), c])
  }
  return [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, items]) => ({
      key: `stack-${time}`,
      time,
      // The slot's name comes from its members; 'Custom' was a label for a
      // second-class list that no longer exists.
      label: items.find((c) => c.schedule?.slot)?.schedule?.slot ?? 'Stack',
      accent: items[0].color || '#8E9AAC',
      items: items.map((c) => ({
        key: supplementKeyOf(c),
        name: c.name,
        dose: customDoseFor(c, isTraining),
        trainingOnly: c.schedule?.trainingOnly,
        notes: c.schedule?.notes,
        customId: c.id,
      })),
    }))
}
