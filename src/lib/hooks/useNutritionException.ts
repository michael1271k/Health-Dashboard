'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { authedFetch } from '@/lib/utils/authedFetch'
import { logicalTodayISO, hoursAwakeToday } from '@/lib/utils/day'
import { todayBundleKey, type TodayBundle } from '@/lib/hooks/useToday'
import { recomputeAndPaint } from '@/lib/scoring/applyComputedScore'
import { resolveDayPhase } from '@/lib/nutrition/phase'
import { activePhase } from '@/lib/programs'

/**
 * A day's nutrition CONTEXT — the declared exception and the estimate marker.
 *
 * Two orthogonal facts, deliberately not an enum. A restaurant birthday dinner
 * is a declared surplus AND a guess at the macros; an enum would have made the
 * day pick one of two true things to say. See `lib/nutrition/exceptionDay.ts`
 * for what each one does and, for `estimated`, the rather longer note on what
 * it emphatically does not.
 *
 * ── WHY BOTH FIELDS GO THROUGH ONE MUTATION ──────────────────────────────────
 * One upsert, one optimistic patch, one invalidation list. Two hooks would have
 * meant two of each, drifting apart at the first change — and the invalidation
 * list below is already the kind of thing that goes stale silently (it was
 * missing `weekly_export` until 2026-08-12).
 *
 * A field absent from the patch is LEFT ALONE. `{ estimated: true }` must not
 * clear a reason set ten seconds earlier, so the upsert payload is built from
 * the keys actually present, not from a fully-defaulted object. `reason: null`
 * is a real value meaning "withdraw"; `reason: undefined` means "don't touch".
 */
export interface DayNutritionContext {
  reason?: string | null
  estimated?: boolean
}

/**
 * Re-stamp `nutrition_entries.phase` after a declaration changes.
 *
 * The two facts live in different tables written by different paths: the flag on
 * `daily_logs`, the phase on `nutrition_entries`. Macros almost always land
 * FIRST — the morning HealthKit sync — so by the time an evening is declared,
 * the phase column already holds the calorie-derived answer. Without this write
 * the flag would change the score and the export while the history page went on
 * filing the day under a phase the block is not in.
 *
 * Symmetric on withdrawal: clearing the flag re-bands the day from its calories,
 * because an ordinary day IS its intake.
 *
 * Best-effort. The flag itself is already saved; a failure here leaves a stale
 * label that the read path (`useNutrition`) resolves correctly anyway.
 */
async function restampPhase(userId: string, date: string): Promise<void> {
  const { data: entry } = await supabase.from('nutrition_entries')
    .select('calories, phase')
    .eq('user_id', userId).eq('date', date).eq('meal_type', 'daily')
    .maybeSingle() as unknown as
    { data: { calories: number | null; phase: string | null } | null }
  if (!entry) return

  const { data: flags } = await supabase.from('daily_logs')
    .select('nutrition_exception, nutrition_estimated')
    .eq('user_id', userId).eq('date', date).maybeSingle() as unknown as
    { data: { nutrition_exception: string | null; nutrition_estimated: boolean | null } | null }

  const next = resolveDayPhase({
    calories: entry.calories,
    exception: flags?.nutrition_exception ?? null,
    estimated: flags?.nutrition_estimated ?? false,
    activePhase: activePhase(),
  })
  if (next === (entry.phase ?? null)) return

  await supabase.from('nutrition_entries')
    .update({ phase: next } as never)
    .eq('user_id', userId).eq('date', date).eq('meal_type', 'daily')
}

/**
 * The row may not exist yet. Today's `daily_logs` row typically arrives with the
 * morning HealthKit sync, and the whole point of this control is to flag an
 * evening BEFORE it happens, so the write is an upsert on `(user_id, date)`. A
 * row created this way is entirely null apart from the flag, which is the same
 * shape every other "no data yet" day already has.
 */
export function useSetNutritionException(date: string) {
  const qc = useQueryClient()
  const key = todayBundleKey(date)

  return useMutation({
    mutationFn: async (patch: DayNutritionContext) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      const row: Record<string, unknown> = { user_id: user.id, date }
      if ('reason' in patch) row.nutrition_exception = patch.reason
      if ('estimated' in patch) row.nutrition_estimated = patch.estimated

      const { error } = await supabase.from('daily_logs')
        // The generated types lag Supabase (schema-of-record), so neither column
        // is in `Tables<'daily_logs'>` yet.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(row as any, { onConflict: 'user_id,date' })
      if (error) throw new Error(error.message)

      // BOTH flags move the phase label, so this runs before the score's
      // exception-only early return below.
      try { await restampPhase(user.id, date) } catch { /* label only; read path resolves it */ }

      // ONLY the exception moves the score. `estimated` is a confidence marker
      // with no scoring counterpart by design, so toggling it alone must not
      // burn a forced recompute — and if this call ever becomes unconditional,
      // that is the first sign someone has given the estimate a numeric role.
      if (!('reason' in patch)) return

      // The flag only reaches the score through a recompute, and the nutrition
      // component is weight 0.30 — without `force` the day's existing row would
      // stand and the banner would claim a forgiveness the score never applied.
      // Best-effort by contract — the flag itself is already saved.
      await recomputeAndPaint(qc, date, {
        force: true, isToday: date === logicalTodayISO(),
        backfillDays: 0, hoursAwake: hoursAwakeToday(),
      }, authedFetch)
    },

    // Optimistic: the chips are toggles, and a toggle that waits for a round trip
    // plus a score recompute before it moves reads as broken.
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<TodayBundle>(key)
      if (previous?.dailyLog) {
        const next: Record<string, unknown> = { ...previous.dailyLog }
        if ('reason' in patch) next.nutrition_exception = patch.reason
        if ('estimated' in patch) next.nutrition_estimated = patch.estimated
        qc.setQueryData<TodayBundle>(key, {
          ...previous,
          dailyLog: next as TodayBundle['dailyLog'],
        })
      }
      return { previous }
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => {
      // The same cascade a `daily_logs` realtime event fires, minus the keys a
      // nutrition context flag cannot move (sleep_debt, trends).
      //
      // `weekly_export` was MISSING and is not optional: both flags are printed
      // on the export's day line, so flagging a day while the export is open
      // left it rendering a line that no longer matched the database. This is
      // the same fan-out `useMacroOverride`'s CASCADE_KEYS already performs.
      for (const k of [['daily_logs'], ['today'], ['readiness_today'], ['coach'],
        ['continuum'], ['day_vault'], ['month_activity'], ['weekly_export']]) {
        void qc.invalidateQueries({ queryKey: k })
      }
    },
  })
}
