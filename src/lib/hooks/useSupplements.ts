'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'

/** Set of supplement item_keys taken for the current logical day. */
export function useSupplements() {
  const date = logicalTodayISO()
  return useQuery({
    queryKey: ['supplement_log', date],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from('supplement_log').select('item_key, taken').eq('date', date)
      if (error) throw error
      return new Set(((data ?? []) as Array<{ item_key: string; taken: boolean }>).filter((r) => r.taken).map((r) => r.item_key))
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
      const { error } = await supabase.from('supplement_log')
        .upsert({ user_id: session.user.id, date, item_key: itemKey, taken } as never, { onConflict: 'user_id,date,item_key' })
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
