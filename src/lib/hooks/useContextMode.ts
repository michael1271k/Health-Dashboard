'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useUserGoals } from '@/lib/hooks/useDashboard'
import { useSetNutritionException } from '@/lib/hooks/useNutritionException'
import { logicalTodayISO } from '@/lib/utils/day'
import {
  CONTEXT_META, contextFromSetting, isRangeMode, type ContextMode,
} from '@/lib/nutrition/context'

/**
 * The active context RANGE — one mode, and the day it started.
 *
 * ── WHY `since` IS ALLOWED TO BE NULL ────────────────────────────────────────
 * `context_since` is a new column. Reading it as null on a database that has not
 * run the DDL means "an active mode whose start we cannot prove", and everything
 * downstream treats that as covering TODAY only — see `rangeCovers`. The
 * alternative, assuming the range extends backwards, would stamp arbitrary
 * history with a context because a column was missing, and there is no undo for
 * that.
 */
export interface ActiveContext {
  mode: ContextMode
  since: string | null
}

export function useContextMode(): ActiveContext {
  const { data: row } = useUserGoals()
  const mode = contextFromSetting((row as { context_mode?: string | null } | null)?.context_mode)
  const since = (row as { context_since?: string | null } | null)?.context_since ?? null
  return { mode, since: mode === 'normal' ? null : since }
}

/**
 * Set the context from either surface — the day banner or Settings.
 *
 * One mutation for both, because they are one decision. A RANGE mode (travel,
 * illness, emergency) persists in `user_goals` and stamps today; a one-day mode
 * (event, refeed, social) stamps the day and touches nothing global. Choosing
 * Normal ends an active range and clears the day's own label — but never
 * retro-edits the days already stamped, because those days happened.
 */
export function useSetContext(date: string) {
  const qc = useQueryClient()
  const setDay = useSetNutritionException(date)

  return useMutation({
    mutationFn: async (mode: ContextMode) => {
      const today = logicalTodayISO()
      const { data: { user } } = await supabase.auth.getUser()

      // The global half. Only a range mode writes it, and only for TODAY — a
      // context declared on a past date is a note about that date, not a
      // statement that you are ill now.
      if (user && date === today && (isRangeMode(mode) || mode === 'normal')) {
        const patch: Record<string, unknown> = {
          user_id: user.id,
          context_mode: mode,
          context_since: mode === 'normal' ? null : today,
        }
        const { error } = await supabase.from('user_goals')
          .upsert(patch as unknown as never, { onConflict: 'user_id' })
        if (error && /context_since|column|schema cache|PGRST204/i.test(error.message)) {
          // Pre-migration: keep the mode, lose only the start date. The range
          // then covers today, which is exactly what it did before ranges.
          delete patch.context_since
          await supabase.from('user_goals')
            .upsert(patch as unknown as never, { onConflict: 'user_id' })
        }
        void qc.invalidateQueries({ queryKey: ['user_goals'] })
        void qc.invalidateQueries({ queryKey: ['today'] })
      }

      // The day half — the column every export, adherence reader and score
      // already understands. This also runs the recompute.
      await setDay.mutateAsync({ reason: CONTEXT_META[mode].dayLabel })
    },
  })
}
