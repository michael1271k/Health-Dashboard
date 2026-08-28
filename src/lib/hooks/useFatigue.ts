'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'
import { EMERALD, GOLD, OXIDE, SAND, STEEL } from '@/lib/theme/palette'

/**
 * Four readings a day, in words.
 *
 * ── WHY A TABLE AND NOT FOUR COLUMNS ON `daily_logs` ─────────────────────────
 * `doms_logs` is the app's proven shape for per-day, per-key subjective data:
 * `(user_id, date, key, value)` with a unique index, upserted on conflict. This
 * copies it exactly, so the hook, the policy and the optimistic update are all
 * the same idea one file over — and a fifth slot is a row rather than a
 * migration on a table that is already 49 columns wide.
 *
 * ── AND WHY IT DOES NOT FEED THE SCORE ───────────────────────────────────────
 * `computeReadiness` is 100% computed from sleep, battery and recovery, and
 * `scoring/types.ts` calls `sessionRpe` "the only subjective signal the app
 * collects". Letting a self-report move the daily score would make it a number
 * you can talk yourself into — and all 147 historical days have no value to
 * compare against, so every past day would silently be scored under a different
 * rule from every future one. This is a record, not an input.
 */

export const FATIGUE_SLOTS = ['morning', 'noon', 'evening', 'eod'] as const
export type FatigueSlot = typeof FATIGUE_SLOTS[number]

export const SLOT_LABEL: Record<FatigueSlot, string> = {
  morning: 'Morning',
  noon: 'Noon',
  evening: 'Evening',
  eod: 'End of day',
}

/**
 * Five levels, named. Numbers would invite arithmetic the scale does not
 * support — the distance from Fresh to Fine is not the distance from Heavy to
 * Empty, and nothing here averages them.
 *
 * Stored 1..5 (matching the DB CHECK) because an ordered small integer sorts,
 * indexes and compares; the WORD is what is ever shown.
 */
export interface FatigueLevel {
  value: number
  label: string
  hint: string
  color: string
}

export const FATIGUE_LEVELS: readonly FatigueLevel[] = [
  { value: 1, label: 'Fresh', hint: 'ready for anything', color: EMERALD },
  { value: 2, label: 'Fine',  hint: 'normal, no complaints', color: STEEL },
  { value: 3, label: 'Worn',  hint: 'feeling the week', color: SAND },
  { value: 4, label: 'Heavy', hint: 'everything is an effort', color: GOLD },
  { value: 5, label: 'Empty', hint: 'nothing left', color: OXIDE },
] as const

export function fatigueLevel(v: number | null | undefined): FatigueLevel | null {
  return FATIGUE_LEVELS.find((l) => l.value === v) ?? null
}

/** A day's readings, slot → level. Absent slots simply were not logged. */
export type FatigueDay = Partial<Record<FatigueSlot, number>>

export function useFatigue(date = logicalTodayISO()) {
  return useQuery({
    queryKey: ['fatigue_logs', date],
    staleTime: 30_000,
    queryFn: async (): Promise<FatigueDay> => {
      const { data, error } = await supabase.from('fatigue_logs')
        .select('slot, level').eq('date', date)
      // Degrade quietly if the table is not migrated yet — the same courtesy
      // `useDoms` extends, for the same reason: a tracker that throws takes the
      // whole day page down with it.
      if (error) return {}
      const out: FatigueDay = {}
      for (const r of (data ?? []) as Array<{ slot: string; level: number }>) {
        if ((FATIGUE_SLOTS as readonly string[]).includes(r.slot)) out[r.slot as FatigueSlot] = r.level
      }
      return out
    },
  })
}

export function useLogFatigue(date = logicalTodayISO()) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ slot, level }: { slot: FatigueSlot; level: number | null }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      // Clearing DELETES rather than writing a zero. There is no "0" level, and
      // a row that exists means the question was answered — which is a fact the
      // export reports and must not be faked.
      if (level == null) {
        const { error } = await supabase.from('fatigue_logs')
          .delete().eq('user_id', user.id).eq('date', date).eq('slot', slot)
        if (error) throw new Error(error.message)
        return
      }

      const { error } = await supabase.from('fatigue_logs').upsert(
        { user_id: user.id, date, slot, level } as never,
        { onConflict: 'user_id,date,slot' },
      )
      if (error) throw new Error(error.message)
    },
    // Optimistic, like DOMS: four taps in a row must not each wait for a round
    // trip, and the value is trivially re-derivable if the write fails.
    onMutate: async ({ slot, level }) => {
      await qc.cancelQueries({ queryKey: ['fatigue_logs', date] })
      const prev = qc.getQueryData<FatigueDay>(['fatigue_logs', date])
      qc.setQueryData<FatigueDay>(['fatigue_logs', date], (old) => {
        const next: FatigueDay = { ...(old ?? {}) }
        if (level == null) delete next[slot]
        else next[slot] = level
        return next
      })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(['fatigue_logs', date], ctx.prev)
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['fatigue_logs', date] }) },
  })
}

/**
 * The day's summary reading — the LATEST slot logged, not the mean.
 *
 * A mean of "Fresh at 7am, Empty at 9pm" is "Worn", which describes neither
 * moment and is the one answer that was never true. The tracker exists to show
 * the shape of a day; the single figure that stands for it is where the day
 * ended up.
 */
export function latestFatigue(day: FatigueDay): { slot: FatigueSlot; level: number } | null {
  for (const slot of [...FATIGUE_SLOTS].reverse()) {
    const level = day[slot]
    if (level != null) return { slot, level }
  }
  return null
}
