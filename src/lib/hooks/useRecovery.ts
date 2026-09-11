'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'
import { programDayByKey } from '@/lib/programs'

/**
 * DOMS tracking across the whole body. Each muscle's soreness is auto-attributed
 * to the most recent session (within the 72h window) that actually TRAINED it —
 * so "moderate quads" reads back against Legs & Core B while "sore chest" points
 * at the last Upper day, filtered by the session's own muscle tags.
 *
 * Tape measurements (waist/arm/thigh) were removed entirely — see the migration
 * that drops `body_measurements`.
 */
// The vocabulary itself now lives in `lib/recovery/soreness.ts`, beside the fold
// the SCORER reads — this file is 'use client' and carries a Supabase client, and
// `computeForDate` should not have to import either to learn the ten names.
// Re-exported so every existing importer is unaffected; same split as
// `useFatigue` / `recovery/fatigue.ts`.
import type { SorenessSide } from '@/lib/body/subRegions'
export { DOMS_MUSCLES, DOMS_LEVELS, isDomsMuscle } from '@/lib/recovery/soreness'
export type { DomsMuscle } from '@/lib/recovery/soreness'
import { DOMS_MUSCLES, type DomsMuscle } from '@/lib/recovery/soreness'

/** Fold a program muscle token into one of the tracked DOMS muscles (or null). */
export function domsMuscleOf(token: string): DomsMuscle | null {
  switch (token.toLowerCase().replace(/[\s-]+/g, '_')) {
    case 'quads': case 'quadriceps': return 'Quads'
    // Glutes were folded into Hamstrings until 2026-08-02. Hip thrusts and RDLs
    // are the two biggest lifts on Legs B and they get sore independently, so
    // one rating for both could not describe an actual leg day.
    case 'glutes': case 'glute': case 'hips': return 'Glutes'
    case 'hamstrings': return 'Hamstrings'
    // Adductors and abductors report as ONE rating. They are the two halves of
    // the same complaint on a leg day and nobody rates them apart.
    case 'adductors': case 'adductor': case 'inner_thigh': case 'abductors': return 'Inner thighs'
    case 'calves': return 'Calves'
    case 'back': case 'lats': case 'upper_back': case 'lower_back': case 'traps': return 'Back'
    case 'chest': case 'pecs': return 'Chest'
    case 'biceps': case 'triceps': case 'forearms': return 'Arms'
    case 'shoulders': case 'delts': case 'side_delts': case 'rear_delts': case 'front_delts': return 'Shoulders'
    // The trunk was the one trained region with nowhere to report. Every Legs &
    // Core day tags `core`, planks and hanging raises get sore like anything
    // else, and the rating had no muscle to land on.
    case 'core': case 'abs': case 'abdominals': case 'obliques': return 'Abs'
    default: return null   // untracked tag
  }
}

/** The DOMS muscles a session trained — from its program day, else a split guess. */
function sessionDomsMuscles(dayKey: string | null, split: string): Set<DomsMuscle> {
  const out = new Set<DomsMuscle>()
  const day = dayKey ? programDayByKey(dayKey) : null
  if (day) {
    for (const ex of day.exercises) for (const t of ex.muscles) {
      const m = domsMuscleOf(t); if (m) out.add(m)
    }
    return out
  }
  // Legacy rows (no day_key): a coarse split → muscle guess.
  if (split === 'legs' || split === 'lower') { out.add('Glutes'); out.add('Quads'); out.add('Hamstrings'); out.add('Calves'); out.add('Abs') }
  else { out.add('Chest'); out.add('Back'); out.add('Shoulders'); out.add('Arms') }
  return out
}


/**
 * One row of soreness: a muscle, optionally narrowed to a sub-region and a side.
 *
 * `side` is `'both'` and `sub_region` is `''` for a whole-muscle rating, which
 * is what every row written before 2026-09-12 means and what the database
 * defaults to — so a pre-migration row reads back correctly without a backfill.
 */
export interface DomsRow {
  muscle_group: string
  severity: number
  side: SorenessSide
  sub_region: string
}

/** The row key a rating replaces. Mirrors the unique index exactly. */
export const domsRowKey = (r: Pick<DomsRow, 'muscle_group' | 'side' | 'sub_region'>) =>
  `${r.muscle_group}\u0000${r.side}\u0000${r.sub_region}`

/**
 * Today's soreness rows, one per (muscle, side, sub-region).
 *
 * Degrades twice, because this hook has to work against three shapes of the
 * table: fully migrated, `side`/`sub_region` missing, and missing entirely.
 * A tracker that throws takes the whole day page with it.
 */
export function useDomsRows(date = logicalTodayISO()) {
  return useQuery({
    queryKey: ['doms_logs', date],
    staleTime: 30_000,
    queryFn: async (): Promise<DomsRow[]> => {
      const wide = await supabase.from('doms_logs')
        .select('muscle_group, severity, side, sub_region').eq('date', date)
      if (!wide.error) return (wide.data ?? []).map(normaliseDomsRow)
      // Pre-migration: the two v2 columns do not exist yet. Every row is a
      // whole-muscle, both-sides rating, which is exactly the default.
      const narrow = await supabase.from('doms_logs')
        .select('muscle_group, severity').eq('date', date)
      if (narrow.error) return []   // table not migrated at all → degrade quietly
      return (narrow.data ?? []).map(normaliseDomsRow)
    },
  })
}

function normaliseDomsRow(r: unknown): DomsRow {
  const row = r as Partial<DomsRow>
  return {
    muscle_group: String(row.muscle_group ?? ''),
    severity: Number(row.severity ?? 0),
    side: (row.side ?? 'both') as SorenessSide,
    sub_region: row.sub_region ?? '',
  }
}

/**
 * Today's DOMS ratings, muscle → severity — the PEAK across that muscle's sides
 * and sub-regions.
 *
 * The figure paints one intensity per muscle and the summary row counts sore
 * muscles, so both need the same collapse the scorer applies (`foldDomsSeverity`
 * in `lib/recovery/soreness.ts`). Rating a left bicep severe must light the arm,
 * and rating the right one mild must not dim it back down.
 *
 * Same query key as `useDomsRows`, selected down — one fetch, one cache entry,
 * and no way for the two readings to disagree.
 */
export function useDoms(date = logicalTodayISO()) {
  return useQuery({
    queryKey: ['doms_logs', date],
    staleTime: 30_000,
    queryFn: async (): Promise<DomsRow[]> => {
      const wide = await supabase.from('doms_logs')
        .select('muscle_group, severity, side, sub_region').eq('date', date)
      if (!wide.error) return (wide.data ?? []).map(normaliseDomsRow)
      const narrow = await supabase.from('doms_logs')
        .select('muscle_group, severity').eq('date', date)
      if (narrow.error) return []
      return (narrow.data ?? []).map(normaliseDomsRow)
    },
    select: (rows): Record<string, number> => {
      const out: Record<string, number> = {}
      for (const r of rows) {
        out[r.muscle_group] = Math.max(out[r.muscle_group] ?? 0, r.severity)
      }
      return out
    },
  })
}

/** The row key, and the key one column narrower — the v1 shape. */
const WIDE_CONFLICT = 'user_id,date,muscle_group,side,sub_region'
const NARROW_CONFLICT = 'user_id,date,muscle_group'

/** The leg session a day's soreness is attributable to, and how long ago it was. */
export interface DomsSource {
  sessionId: string
  dayKey: string | null
  /** "Legs & Core B" — resolved from the program, falling back to the split. */
  label: string
  date: string
  /** 0 = same day as the session, 1 = next day, 2 = two days later. */
  dayOffset: number
}

/** How many days after a session DOMS is still worth rating. */
export const DOMS_WINDOW_DAYS = 3   // the session day + the following two

const dayDiff = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

/**
 * Per-muscle DOMS attribution: each tracked muscle → the most recent session in
 * the 72h window that actually trained it (filtered by the session's muscle tags).
 *
 * DOMS peaks at 24–48h and is usually gone by 72h, so a rating on Sunday is
 * reporting on Friday's session. Sore quads point at the last leg day; a sore
 * chest points at the last Upper day — each muscle to the workout that caused it.
 */
export function useDomsSources(date = logicalTodayISO()) {
  return useQuery({
    queryKey: ['doms_sources', date],
    staleTime: 60_000,
    queryFn: async (): Promise<Partial<Record<DomsMuscle, DomsSource>>> => {
      const from = new Date(`${date}T00:00:00Z`)
      from.setUTCDate(from.getUTCDate() - (DOMS_WINDOW_DAYS - 1))
      const end = new Date(`${date}T00:00:00Z`)
      end.setUTCDate(end.getUTCDate() + 1)
      const { data, error } = await supabase.from('workout_sessions')
        .select('id, started_at, split_day, day_key')
        .gte('started_at', from.toISOString())
        .lt('started_at', end.toISOString())
        .order('started_at', { ascending: false })   // newest first → first match wins
      if (error) return {}
      const rows = (data ?? []) as Array<{ id: string; started_at: string; split_day: string; day_key: string | null }>
      const byMuscle: Partial<Record<DomsMuscle, DomsSource>> = {}
      for (const r of rows) {
        const sessionDate = r.started_at.slice(0, 10)
        const programDay = r.day_key ? programDayByKey(r.day_key) : null
        const src: DomsSource = {
          sessionId: r.id,
          dayKey: r.day_key,
          label: programDay
            ? (programDay.sub ? `${programDay.label} · ${programDay.sub}` : programDay.label)
            : r.split_day[0].toUpperCase() + r.split_day.slice(1),
          date: sessionDate,
          dayOffset: Math.max(0, dayDiff(sessionDate, date)),
        }
        for (const m of sessionDomsMuscles(r.day_key, r.split_day)) {
          if (!byMuscle[m]) byMuscle[m] = src   // newest-first, so first is most recent
        }
      }
      return byMuscle
    },
  })
}

/**
 * Rate (or re-rate) a muscle, optionally one side of it or one sub-region.
 *
 * Upserts on (user_id, date, muscle_group, side, sub_region) — the full row key —
 * so a rating stays editable all day while a left and a right rating coexist.
 * Under the old three-column key the second side simply overwrote the first,
 * which is why laterality needed a migration and not just a column.
 *
 * `source` ties the rating to the session that caused it. The write self-heals
 * against an unmigrated database TWICE: without `side`/`sub_region` (narrow
 * conflict key, v1 behaviour), and without `source_session_id`/`source_day_key`.
 * Ratings keep working until the SQL is run; they just lose the detail the
 * columns would have carried.
 */
export function useLogDoms(date = logicalTodayISO()) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ muscle, severity, source, side = 'both', subRegion = '' }: {
      muscle: string; severity: number; source?: DomsSource | null
      side?: SorenessSide; subRegion?: string
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const narrow = { user_id: user.id, date, muscle_group: muscle, severity }
      const withSource = source
        ? { ...narrow, source_session_id: source.sessionId, source_day_key: source.dayKey }
        : narrow
      const full = { ...withSource, side, sub_region: subRegion }

      const { error } = await supabase.from('doms_logs').upsert(
        full as never, { onConflict: WIDE_CONFLICT },
      )
      if (!error) return

      // Unmigrated database. A left/right distinction cannot be stored, so the
      // rating lands as a whole-muscle one rather than being lost — and the
      // caller is told, because silently recording a different fact is worse
      // than failing.
      if (/side|sub_region|column|schema cache|PGRST204|constraint|conflict/i.test(error.message)) {
        const { error: retry } = await supabase.from('doms_logs').upsert(
          withSource as never, { onConflict: NARROW_CONFLICT },
        )
        if (!retry) return
        if (source && /source_session_id|source_day_key|column|schema cache|PGRST204/i.test(retry.message)) {
          const { error: bare } = await supabase.from('doms_logs').upsert(
            narrow as never, { onConflict: NARROW_CONFLICT },
          )
          if (bare) throw new Error(bare.message)
          return
        }
        throw new Error(retry.message)
      }
      throw new Error(error.message)
    },
    onMutate: async ({ muscle, severity, side = 'both', subRegion = '' }) => {
      const key = ['doms_logs', date]
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<DomsRow[]>(key)
      const next: DomsRow = { muscle_group: muscle, severity, side, sub_region: subRegion }
      const rest = (prev ?? []).filter((r) => domsRowKey(r) !== domsRowKey(next))
      qc.setQueryData(key, [...rest, next])
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['doms_logs', date], ctx.prev) },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['doms_logs', date] })
      // The weekly export reads `doms_logs` directly and caches the rendered
      // markdown for 60 s, so rating soreness and immediately tapping "Export
      // Week" pasted the severities the edit had just replaced. Same failure
      // mode `useMacroOverride` documents for nutrition.
      qc.invalidateQueries({ queryKey: ['weekly_export'] })
    },
  })
}
