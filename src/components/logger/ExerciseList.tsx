'use client'

import type { Tables } from '@/lib/supabase/types'
import type { WorkoutSet } from '@/lib/types/workout'
import type { LastSetsMap } from '@/lib/hooks/useLogger'
import { ExerciseSlider } from './ExerciseSlider'

interface ExerciseListProps {
  exercises: Tables<'exercises'>[]
  sets: WorkoutSet[]
  onAddSet: (set: WorkoutSet) => void
  lastSets: LastSetsMap
  isLoading?: boolean
}

export function ExerciseList({ exercises, sets, onAddSet, lastSets, isLoading }: ExerciseListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-surface-2 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!exercises.length) {
    return (
      <p className="text-muted-vital text-sm py-8 text-center">
        No exercises found for this split. Run migration 007 in Supabase to seed them.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {exercises.map((ex) => {
        const exerciseSets = sets.filter((s) => s.exerciseId === ex.id)
        const prev = lastSets.get(ex.id) ?? null

        return (
          <ExerciseSlider
            key={ex.id}
            exerciseId={ex.id}
            exerciseName={ex.name}
            exerciseNameHe={ex.name_he ?? undefined}
            existingSets={exerciseSets}
            previous={prev}
            onAddSet={onAddSet}
          />
        )
      })}
    </div>
  )
}
