'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'
import { LEGACY_SLOT_KEYS, foldFatigueRows, normalizeSlot, type FatigueDay, type FatigueSlot } from '@/lib/recovery/fatigue'

// The vocabulary, the levels, the fold and `latestFatigue` live in
// `lib/recovery/fatigue.ts` now — a module the server scorer may import. This
// file keeps the two hooks and re-exports the rest so nothing upstream moves.
export * from '@/lib/recovery/fatigue'

/**
 * A day's readings.
 *
 * `isTraining` decides how a LEGACY row is filed — see `LEGACY_SLOTS`. It is a
 * parameter rather than a lookup inside the hook because `isTrainingDay` reads
 * the schedule store, which is invisible to React: a component that wants this
 * to update after a swap has to hold `useScheduleVersion()` itself, and hiding
 * that read in here would make the tracker freeze on whatever the cache held at
 * mount. See `useFatigueDay` for the wired-up version.
 */
export function useFatigue(date = logicalTodayISO(), isTraining = false) {
  return useQuery({
    queryKey: ['fatigue_logs', date, isTraining],
    staleTime: 30_000,
    queryFn: async (): Promise<FatigueDay> => {
      const { data, error } = await supabase.from('fatigue_logs')
        .select('slot, level').eq('date', date)
      // Degrade quietly if the table is not migrated yet — the same courtesy
      // `useDoms` extends, for the same reason: a tracker that throws takes the
      // whole day page down with it.
      if (error) return {}
      return foldFatigueRows((data ?? []) as Array<{ slot: string; level: number }>, isTraining)
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
      //
      // It also clears the LEGACY key this slot may still be stored under, so
      // un-ticking a migrated reading on a database whose paste-SQL has not run
      // does not leave the old row behind to reappear on the next read.
      if (level == null) {
        const legacy = LEGACY_SLOT_KEYS
          .filter((k) => normalizeSlot(k, true) === slot || normalizeSlot(k, false) === slot)
        const { error } = await supabase.from('fatigue_logs')
          .delete().eq('user_id', user.id).eq('date', date)
          .in('slot', [slot, ...legacy])
        if (error) throw new Error(error.message)
        return
      }

      const { error } = await supabase.from('fatigue_logs').upsert(
        { user_id: user.id, date, slot, level } as never,
        { onConflict: 'user_id,date,slot' },
      )
      if (error) throw new Error(error.message)
    },
    // Optimistic, like DOMS: three taps in a row must not each wait for a round
    // trip, and the value is trivially re-derivable if the write fails.
    //
    // Both cache entries for the date are patched — the query key carries
    // `isTraining`, and a swap mid-session must not leave a stale twin behind.
    onMutate: async ({ slot, level }) => {
      await qc.cancelQueries({ queryKey: ['fatigue_logs', date] })
      const prev = qc.getQueriesData<FatigueDay>({ queryKey: ['fatigue_logs', date] })
      qc.setQueriesData<FatigueDay>({ queryKey: ['fatigue_logs', date] }, (old) => {
        const next: FatigueDay = { ...(old ?? {}) }
        if (level == null) delete next[slot]
        else next[slot] = level
        return next
      })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.prev ?? []) qc.setQueryData(key, data)
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['fatigue_logs', date] }) },
  })
}

