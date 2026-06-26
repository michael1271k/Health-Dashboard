'use client'

import { useState } from 'react'
import type { Tables } from '@/lib/supabase/types'
import type { WorkoutSet } from '@/lib/types/workout'
import { SetRow } from './SetRow'
import { SetLogger } from './SetLogger'
import { ChevronDown } from 'lucide-react'

interface ExerciseListProps {
  exercises: Tables<'exercises'>[]
  sets: WorkoutSet[]
  onAddSet: (set: WorkoutSet) => void
  isLoading?: boolean
}

export function ExerciseList({ exercises, sets, onAddSet, isLoading }: ExerciseListProps) {
  const [openId, setOpenId] = useState<string | null>(null)

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
        No exercises found for this split. Add some in Supabase seed data.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {exercises.map((ex) => {
        const exerciseSets = sets.filter((s) => s.exerciseId === ex.id)
        const isOpen = openId === ex.id

        return (
          <div key={ex.id} className="vital-card">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : ex.id)}
              aria-expanded={isOpen}
              aria-controls={`exercise-sets-${ex.id}`}
              className="w-full flex items-center justify-between cursor-pointer py-3"
            >
              <div className="flex flex-col items-start gap-0.5">
                <span className="font-medium text-text">{ex.name}</span>
                {ex.name_he && (
                  <span className="text-xs text-muted-vital" dir="rtl" lang="he">
                    {ex.name_he}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {exerciseSets.length > 0 && (
                  <span className="text-xs text-muted-vital tabular-nums">
                    {exerciseSets.length} set{exerciseSets.length !== 1 ? 's' : ''}
                  </span>
                )}
                <ChevronDown
                  className={`w-4 h-4 text-muted-vital transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </div>
            </button>

            {isOpen && (
              <div id={`exercise-sets-${ex.id}`} className="mt-3 border-t border-border pt-3">
                {exerciseSets.length > 0 && (
                  <div className="mb-3">
                    {exerciseSets.map((s) => (
                      <SetRow key={`${s.exerciseId}-${s.setNumber}`} set={s} />
                    ))}
                  </div>
                )}
                <SetLogger
                  exerciseId={ex.id}
                  exerciseName={ex.name}
                  exerciseNameHe={ex.name_he ?? undefined}
                  existingSetsCount={exerciseSets.length}
                  onAddSet={onAddSet}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
