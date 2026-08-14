'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { activeProgram, HELIX_CUT_START } from '@/lib/programs'
import type { EraFilter } from '@/lib/era/eraFilter'
import { useUserGoals } from '@/lib/hooks/useDashboard'
import { logicalTodayISO } from '@/lib/utils/day'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'

/**
 * Which era a chart should filter to, DERIVED from the selected window.
 *
 * ── WHY DERIVED AND NOT STORED ───────────────────────────────────────────────
 * `ChartRange` is the only timeframe control, and its era segment means "this
 * plan". Having it also *write* `EraFilterProvider`'s state would create two
 * facts that can disagree: the provider resets to 'axis' on every tab switch
 * (eraFilter.tsx), so a freshly-mounted panel would sit on the 30-day default
 * while the filter claimed an era, and nothing on screen would say which one the
 * charts were obeying. A function of `days` cannot desync from `days`.
 *
 * 1 Month is 'all' because over a 30-day window every row is inside the current
 * era anyway — the filter would be a no-op that only removed rows if you had
 * switched plans this month, which is precisely when you'd want to see both.
 */
export function eraForRange(days: number, monthDays = 30): EraFilter {
  return days === monthDays ? 'all' : activeProgram().era
}

/** Inclusive day count between two ISO dates, floored at 1. */
export function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(`${fromISO}T00:00:00Z`)
  const to = Date.parse(`${toISO}T00:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 1
  return Math.max(1, Math.round((to - from) / 86_400_000) + 1)
}

/**
 * Resolve the era's start date from the three places it can be recorded.
 *
 * Precedence, most-specific first:
 *
 *   1. `plans.started_on`          — when this PLAN began (Settings → Plans)
 *   2. `user_goals.phase_started_on` — when the current PHASE within it began
 *   3. `HELIX_CUT_START`            — the era anchor, for a device that has
 *                                     never switched either
 *
 * Plan before phase, because the toggle is labelled with the PLAN's name
 * ("Helix-5 Era") and a window that started when the cut did would be narrower
 * than the thing it claims to span. Pure so the precedence is testable.
 */
export function resolveEraStart(
  planStart: string | null | undefined,
  phaseStart: string | null | undefined,
): string {
  return planStart || phaseStart || HELIX_CUT_START
}

/** The active plan's `started_on`, or null when the table is absent/empty. */
function useActivePlanStart() {
  return useQuery({
    queryKey: ['plans', 'era_start'],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      try {
        const { data, error } = await supabase.from('plans')
          .select('started_on').eq('active', true).limit(1).maybeSingle()
        if (error) return null
        return (data as { started_on?: string | null } | null)?.started_on ?? null
      } catch {
        return null
      }
    },
  })
}

/**
 * The "[Era Name]" chart window — the whole of the currently active plan.
 *
 * ── WHY THE LABEL IS DYNAMIC ─────────────────────────────────────────────────
 * It reads `activeProgram().label`, so switching plan in Settings renames the
 * toggle. The old `PlanEraButton` hardcoded "Helix Era" and one caller passed a
 * dynamic label while the other did not, so the same control was called two
 * different things on two tabs.
 *
 * `activeProgram()` reads localStorage synchronously during render, which is
 * invisible to React — hence `useScheduleVersion()`, the same subscription every
 * other plan-reading component needs.
 *
 * ── A CAVEAT WORTH KNOWING ───────────────────────────────────────────────────
 * When the plan started recently, this window and "1 Month" are nearly the same
 * span (as of 2026-08 the plan began 2026-07-15, so ~31 days). That is not a
 * bug — they diverge as the block runs — but it is why the button carries its
 * anchor date in the title rather than leaving the reader to guess.
 */
export function useEraWindow(): { label: string; days: number; startISO: string } {
  void useScheduleVersion()
  const { data: goals } = useUserGoals()
  const { data: planStart } = useActivePlanStart()
  const startISO = resolveEraStart(
    planStart,
    (goals as { phase_started_on?: string | null } | null)?.phase_started_on,
  )
  return {
    label: `${activeProgram().label} Era`,
    days: daysBetween(startISO, logicalTodayISO()),
    startISO,
  }
}
