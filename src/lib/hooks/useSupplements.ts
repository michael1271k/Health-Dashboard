'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'
import { SUPPLEMENT_PROTOCOL, slotTimePassed } from '@/lib/supplements'

/** Set of supplement item_keys taken for the current logical day (auto-log aware). */
export function useSupplements() {
  const date = logicalTodayISO()
  return useQuery({
    queryKey: ['supplement_log', date],
    queryFn: async (): Promise<Set<string>> => {
      const [logRes, goalsRes] = await Promise.all([
        supabase.from('supplement_log').select('item_key, taken').eq('date', date),
        supabase.from('user_goals').select('auto_log_supplements').maybeSingle(),
      ])
      if (logRes.error) throw logRes.error
      const rows = (logRes.data ?? []) as Array<{ item_key: string; taken: boolean }>
      const taken = new Set(rows.filter((r) => r.taken).map((r) => r.item_key))

      const autoLog = (goalsRes.data as { auto_log_supplements?: boolean } | null)?.auto_log_supplements ?? false
      if (autoLog) {
        // Auto-mark items whose scheduled time has passed — UNLESS an explicit
        // record already exists (a manual tap/untap always wins).
        const logged = new Set(rows.map((r) => r.item_key))
        for (const slot of SUPPLEMENT_PROTOCOL) {
          if (!slotTimePassed(slot.time)) continue
          for (const it of slot.items) if (!logged.has(it.key)) taken.add(it.key)
        }
      }
      return taken
    },
    staleTime: 60_000,
  })
}

export function useToggleSupplement() {
  const qc = useQueryClient()
  const date = logicalTodayISO()
  const key = ['supplement_log', date] as const
  return useMutation({
    mutationFn: async ({ itemKey, taken }: { itemKey: string; taken: boolean }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { error } = await supabase.from('supplement_log').upsert(
        { user_id: session.user.id, date, item_key: itemKey, taken, taken_at: taken ? new Date().toISOString() : null } as never,
        { onConflict: 'user_id,date,item_key' },
      )
      if (error) throw error
    },
    // Optimistic — the checkbox flips instantly, reverts on error.
    onMutate: async ({ itemKey, taken }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Set<string>>(key)
      const next = new Set(prev ?? [])
      if (taken) next.add(itemKey); else next.delete(itemKey)
      qc.setQueryData(key, next)
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev) },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}
