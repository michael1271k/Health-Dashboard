'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { parseTemplate, type RoutineTemplate } from '@/lib/sessions/routineTemplate'

export const routineTemplateKey = (dayKey?: string | null) => ['routine_template', dayKey ?? 'none']

/**
 * The stored template for one programme day — the deck's FIRST seeding source.
 *
 * Returns null rather than throwing for every "not there yet" case: no day key,
 * no row, an un-migrated table, or a payload this build cannot read. Seeding
 * then falls through to history and finally to the program's cold start, which
 * is exactly what happened before the table existed. A template is an
 * optimisation over re-deriving the shape from history — never a prerequisite
 * for opening the logger.
 */
export function useRoutineTemplate(dayKey?: string | null) {
  return useQuery({
    queryKey: routineTemplateKey(dayKey),
    enabled: !!dayKey,
    staleTime: 60_000,
    queryFn: async (): Promise<RoutineTemplate | null> => {
      const { data, error } = await supabase
        .from('routine_templates')
        .select('payload')
        .eq('day_key', dayKey as string)
        .maybeSingle()
      // An un-migrated table must not break the logger.
      if (error) return null
      return parseTemplate((data as { payload?: unknown } | null)?.payload)
    },
  })
}

/**
 * Every stored template, by day key — for Settings, which lists the whole split
 * at once and would otherwise fire one query per day.
 *
 * Same tolerance as the single-day hook: an unreadable table yields an empty
 * map, and the caller falls back to showing the programme as authored.
 */
export function useRoutineTemplates() {
  return useQuery({
    queryKey: routineTemplateKey('all'),
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, { template: RoutineTemplate; updatedAt: string | null }>> => {
      const out = new Map<string, { template: RoutineTemplate; updatedAt: string | null }>()
      const { data, error } = await supabase
        .from('routine_templates')
        .select('day_key, payload, updated_at')
      if (error) return out
      for (const row of (data ?? []) as unknown as Array<{
        day_key: string; payload: unknown; updated_at: string | null
      }>) {
        const template = parseTemplate(row.payload)
        if (template) out.set(row.day_key, { template, updatedAt: row.updated_at })
      }
      return out
    },
  })
}
