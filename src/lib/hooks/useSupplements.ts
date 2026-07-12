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
        // Auto-log items whose scheduled time has passed — UNLESS an explicit
        // record already exists (a manual tap/untap always wins).
        // actually WRITE the rows (ignoreDuplicates keeps manual records
        // authoritative) so scores, history, and other devices see them too —
        // previously this only simulated ticks client-side and persisted nothing.
        const logged = new Set(rows.map((r) => r.item_key))
        const due: Array<{ key: string; time: string }> = []
        for (const slot of SUPPLEMENT_PROTOCOL) {
          if (!slotTimePassed(slot.time)) continue
          for (const it of slot.items) if (!logged.has(it.key)) due.push({ key: it.key, time: slot.time })
        }
        if (due.length) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            const inserts = due.map((d) => ({
              user_id: session.user.id, date, item_key: d.key, taken: true,
              taken_at: new Date(`${date}T${d.time}:00`).toISOString(),
            }))
            // Best-effort: ticks show locally either way; a failed write simply
            // retries on the next fetch (idempotent upsert).
            await supabase.from('supplement_log')
              .upsert(inserts as never[], { onConflict: 'user_id,date,item_key', ignoreDuplicates: true })
          }
          for (const d of due) taken.add(d.key)
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
