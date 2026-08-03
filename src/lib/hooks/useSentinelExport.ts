'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { weekStartOf, isoAddDays } from '@/lib/utils/week'

/**
 * Stored weekly audit reports — READ AND WRITE ONLY.
 *
 * There is no report BUILDER here any more. `src/lib/reports/sentinel.ts` (503
 * lines) hardcoded a §1–§7 "SENTINEL-7" brief, plus `ascii.ts`, `t4wm.ts`,
 * `tdee.ts` and `integrity.ts` to feed it, and `useSentinelExport` ran eight
 * parallel queries to assemble one. A report format baked into the app is a
 * format that has to ship a release to change; the whole point of the paste
 * loop is that the format lives OUTSIDE the app. The raw-data export
 * (`useWeeklyExport`) is the only payload the app produces, and whatever
 * analysis you run on it comes back as free-form markdown.
 *
 * `SENTINEL_TYPE` stays because rows already carry it in `reports.type` — it is
 * a storage discriminator now, not a template.
 */
export const SENTINEL_TYPE = 'sentinel7'

export interface SentinelReport { id: string; weekStart: string; content: string; createdAt: string }

/** Stored audit reports, newest first. */
export function useSentinelReports(limit = 24) {
  return useQuery({
    queryKey: ['reports', SENTINEL_TYPE, limit],
    staleTime: 60_000,
    queryFn: async (): Promise<SentinelReport[]> => {
      const { data, error } = await supabase
        .from('reports')
        .select('id, period_start, content_md, created_at')
        .eq('type', SENTINEL_TYPE)
        .order('period_start', { ascending: false })
        .limit(limit)
      if (error) return []
      return ((data ?? []) as unknown as Array<{ id: string; period_start: string; content_md: string | null; created_at: string }>)
        .filter((r) => r.content_md)
        .map((r) => ({ id: r.id, weekStart: r.period_start, content: r.content_md as string, createdAt: r.created_at }))
    },
  })
}

/** Save a pasted audit report for a week. */
export function useSaveSentinelReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ weekStart, contentMd }: { weekStart: string; contentMd: string }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const { error } = await supabase.from('reports').upsert(
        {
          user_id: session.user.id, type: SENTINEL_TYPE,
          period_start: weekStartOf(weekStart), period_end: isoAddDays(weekStartOf(weekStart), 6),
          content_md: contentMd,
        } as unknown as never,
        { onConflict: 'user_id,type,period_start' },
      )
      if (error) {
        // 42P10 = no unique constraint matching the ON CONFLICT target.
        if (error.code === '42P10') throw new Error('Run the reports unique-index paste-SQL first.')
        // 23514 = a CHECK constraint refused the row. Verified live 2026-08-03:
        // `reports_type_check` allows ONLY 'weekly', a leftover from the Notion
        // era, so every pasted report this app has ever tried to save was
        // rejected by the database and the raw Postgres text ("violates check
        // constraint") gave no clue which column was at fault. The fix is one
        // ALTER TABLE, not a code change — say so.
        if (error.code === '23514' && /type/i.test(error.message)) {
          throw new Error(
            `The database still refuses report type "${SENTINEL_TYPE}" — `
            + 'reports_type_check predates the paste loop. Run the reports_type_check paste-SQL.',
          )
        }
        throw error
      }
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['reports'] }) },
  })
}
