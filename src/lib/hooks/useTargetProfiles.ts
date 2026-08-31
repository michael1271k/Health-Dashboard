'use client'

/**
 * The named day-shapes, read from `target_profiles`.
 *
 * The reasoning — what a profile is, why it is not a lever, and why applying one
 * SNAPSHOTS its numbers rather than resolving them at read time — lives in
 * `@/lib/nutrition/profiles`, which is pure so `computeForDate` can share the
 * layer it feeds. This file is only the client plumbing.
 *
 * Every read falls back to `BUILTIN_PROFILES` if the table is absent, the same
 * courtesy `useCustomSupplements` and `useDailyTargets` extend: an app running
 * against a database that has not had the DDL applied still shows Home and
 * Restaurant with the numbers they ship with, and applying one still writes a
 * perfectly ordinary `daily_targets` row.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { BUILTIN_PROFILES, profileToDailyTarget, type TargetProfile } from '@/lib/nutrition/profiles'
import { dailyTargetKey } from '@/lib/hooks/useDailyTargets'

const KEY = 'target_profiles'

/**
 * Surfaces that must refresh when a day's profile moves. Identical to
 * `useDailyTargets`' cascade, because applying a profile IS writing a day
 * target: the ring is graded against a number that just changed, and the weekly
 * export caches its rendered markdown.
 */
const CASCADE_KEYS: readonly (readonly string[])[] = [
  ['daily_targets'], ['daily_scores'], ['weekly_export'], ['nutrition'],
]

/** Row shape as stored. Snake case here, camel in `TargetProfile`. */
interface ProfileRow {
  key: string
  label: string
  summary: string | null
  sort: number | null
  kcal: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  steps_goal: number | null
}

function fromRow(r: ProfileRow): TargetProfile {
  return {
    key: r.key,
    label: r.label,
    summary: r.summary ?? '',
    sort: r.sort ?? 0,
    kcal: r.kcal ?? 0,
    proteinG: r.protein_g ?? 0,
    // Null IS the reading, not a missing one — see the third-state note in
    // `dailyTargets.ts`. A profile with no carbohydrate figure does not grade it.
    carbsG: r.carbs_g,
    fatG: r.fat_g,
    stepsGoal: r.steps_goal,
  }
}

/** Every profile, in picker order. Never empty — see the note on the fallback. */
export function useTargetProfiles() {
  return useQuery({
    queryKey: [KEY] as const,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TargetProfile[]> => {
      const { data, error } = await supabase.from('target_profiles')
        .select('key, label, summary, sort, kcal, protein_g, carbs_g, fat_g, steps_goal')
        .order('sort', { ascending: true })
      // An absent table and an empty table mean the same thing to the picker:
      // nothing has been configured, so show what the app ships with. Returning
      // [] would leave the day with no way to say it was a restaurant day.
      if (error || !data?.length) return [...BUILTIN_PROFILES]
      return (data as unknown as ProfileRow[]).map(fromRow)
    },
  })
}

/**
 * Stamp a day with a profile — or clear the stamp.
 *
 * Writes the profile's SNAPSHOT into `daily_targets`, replacing whatever the day
 * held. Replacing, not merging: applying "Restaurant" over a day someone had
 * hand-edited must not leave that day's old carbohydrate target sitting
 * underneath, silently graded.
 *
 * `null` clears — the day drops its override entirely and goes back to whatever
 * rung is in force, which is exactly what `useClearDailyTarget` does and is
 * spelled here so the picker needs one mutation rather than two.
 */
export function useApplyProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ date, profile }: { date: string; profile: TargetProfile | null }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')

      if (!profile) {
        const { error } = await supabase.from('daily_targets').delete()
          .eq('user_id', session.user.id).eq('date', date)
        if (error) throw error
        return
      }

      const t = profileToDailyTarget(profile, date)
      const row = {
        user_id: session.user.id,
        date,
        kcal: t.kcal, protein_g: t.protein_g, carbs_g: t.carbs_g, fat_g: t.fat_g,
        steps_goal: t.steps_goal, note: t.note,
        profile_key: t.profile_key, track_carbs: t.track_carbs, track_fat: t.track_fat,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('daily_targets')
        .upsert(row as unknown as never, { onConflict: 'user_id,date' })
      if (!error) return

      /* ── THE PRE-MIGRATION PATH ───────────────────────────────────────────
         The three profile columns are the newest thing in this table, and an
         upsert naming a column that does not exist fails the whole statement —
         so on a database whose paste-SQL has not run, applying a profile would
         do nothing at all rather than doing most of it.

         The retry writes the figures without the stamp. The day then gets the
         right targets and simply cannot say which profile gave them to it,
         which is a smaller loss than the day getting no targets. It is the same
         strip-and-retry the ingest path keeps for the pinned Shortcut, bounded
         to one known set of columns rather than parsing an error string. */
      const legacy: Record<string, unknown> = { ...row }
      delete legacy.profile_key
      delete legacy.track_carbs
      delete legacy.track_fat
      const retry = await supabase.from('daily_targets')
        .upsert(legacy as unknown as never, { onConflict: 'user_id,date' })
      if (retry.error) throw retry.error
    },
    onSuccess: (_r, v) => {
      void qc.invalidateQueries({ queryKey: dailyTargetKey(v.date) })
      for (const k of CASCADE_KEYS) void qc.invalidateQueries({ queryKey: k })
    },
  })
}

/**
 * Edit a profile's own numbers — Settings, not a day.
 *
 * Days already stamped keep their snapshot. That is the point of the snapshot:
 * "Restaurant is 2,500 from now on" must not mean "every restaurant day you have
 * ever eaten was a 2,500 day".
 */
export function useSaveTargetProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (profile: TargetProfile) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const { error } = await supabase.from('target_profiles').upsert({
        user_id: session.user.id,
        key: profile.key,
        label: profile.label,
        summary: profile.summary,
        sort: profile.sort,
        kcal: profile.kcal,
        protein_g: profile.proteinG,
        carbs_g: profile.carbsG,
        fat_g: profile.fatG,
        steps_goal: profile.stepsGoal,
        updated_at: new Date().toISOString(),
      } as unknown as never, { onConflict: 'user_id,key' })
      if (error) throw error
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: [KEY] }) },
  })
}
