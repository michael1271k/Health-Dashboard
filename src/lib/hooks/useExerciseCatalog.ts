'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { resolveMovers } from '@/lib/exercises/muscleMap'
import { canonicalExerciseName } from '@/lib/exercises/aliases'
import { MUSCLE_MAP, MUSCLE_GROUPS } from '@/lib/charts/muscleAggregate'

/** The six display groups the charts already use — derived, not re-declared. */
type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export interface CatalogExercise {
  id: string
  name: string
  /** How many sets have ever been logged. Doubles as the "has history" filter. */
  setCount: number
  isCompound: boolean
  group: MuscleGroup | 'Other'
}

export interface ExerciseCatalog {
  /** Groups in MUSCLE_GROUPS order, each alphabetical, empty groups omitted. */
  groups: Array<{ group: MuscleGroup | 'Other'; exercises: CatalogExercise[] }>
  /** The same exercises, flattened in exactly the order they render.
   *  This is what makes prev/next free — an index into an array we already have. */
  flat: CatalogExercise[]
}

const EMPTY: ExerciseCatalog = { groups: [], flat: [] }

/**
 * Which display group an exercise belongs to.
 *
 * Resolved by NAME first (`resolveMovers`), because the `muscle_groups` column
 * is a cache that has gone stale — and stale rows are exactly why half this
 * table is junk. The column is only a fallback.
 */
function groupOf(name: string, stored: string[] | null): MuscleGroup | 'Other' {
  const primary = resolveMovers(name, stored ?? undefined).primary
  for (const token of primary) {
    const g = MUSCLE_MAP[token]
    if (g) return g as MuscleGroup
  }
  return 'Other'
}

/**
 * Every exercise the user has ACTUALLY trained, grouped for the library.
 *
 * ── THE FILTER IS THE POINT ──────────────────────────────────────────────────
 * The `exercises` table holds 59 rows and 29 of them have never had a single
 * set logged against them: legacy duplicates left behind by renames and merges
 * — `Calf Press` beside `Calf Press (Machine)`, `Lat Pulldown` beside
 * `Lat Pulldown (Cable)`. A library that lists all 59 is half empty shells, and
 * the shells are indistinguishable from the real ones until you open them.
 *
 * The count comes from a PostgREST embedded aggregate, so it is one round trip
 * and Postgres does the counting. It is kept rather than thrown away: "12
 * sessions" is a useful subtitle and it cost nothing.
 *
 * Never throws — an empty library is a bad screen, a crashed one is worse.
 */
export function useExerciseCatalog() {
  return useQuery({
    queryKey: ['exercises', 'catalog'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ExerciseCatalog> => {
      const { data, error } = await supabase
        .from('exercises')
        .select('id, name, muscle_groups, is_compound, workout_sets(count)')
      if (error || !data) return EMPTY

      const rows = data as unknown as Array<{
        id: string
        name: string
        muscle_groups: string[] | null
        is_compound: boolean | null
        workout_sets: Array<{ count: number }> | null
      }>

      const all: CatalogExercise[] = rows
        .map((r) => ({
          id: r.id,
          name: canonicalExerciseName(r.name),
          setCount: r.workout_sets?.[0]?.count ?? 0,
          isCompound: r.is_compound ?? false,
          group: groupOf(r.name, r.muscle_groups),
        }))
        .filter((e) => e.setCount > 0)
        .sort((a, b) => a.name.localeCompare(b.name))

      const order: Array<MuscleGroup | 'Other'> = [...MUSCLE_GROUPS, 'Other']
      const groups = order
        .map((group) => ({ group, exercises: all.filter((e) => e.group === group) }))
        .filter((g) => g.exercises.length > 0)

      return { groups, flat: groups.flatMap((g) => g.exercises) }
    },
  })
}
