'use client'

import { useState, useCallback } from 'react'
import { SplitPicker } from './SplitPicker'
import { ExerciseList } from './ExerciseList'
import { WorkoutForm } from './WorkoutForm'
import { useExercises, useSaveSession, type SaveResult } from '@/lib/hooks/useLogger'
import type { SplitDay, WorkoutSet } from '@/lib/types/workout'
import { Dumbbell, Check } from 'lucide-react'

interface ActiveSessionProps {
  onSaved?: (result: SaveResult) => void
}

export function ActiveSession({ onSaved }: ActiveSessionProps) {
  const [splitDay, setSplitDay] = useState<SplitDay | null>(null)
  const [startedAt] = useState(() => new Date().toISOString())
  const [sets, setSets] = useState<WorkoutSet[]>([])
  const [notes, setNotes] = useState('')
  const [savedResult, setSavedResult] = useState<SaveResult | null>(null)

  const { data: exercises, isLoading: exercisesLoading } = useExercises(splitDay)
  const { mutate: saveSession, isPending: isSaving } = useSaveSession()

  const handleAddSet = useCallback((set: WorkoutSet) => {
    setSets((prev) => [...prev, set])
  }, [])

  function handleSave() {
    if (!splitDay || !sets.length) return
    saveSession(
      {
        splitDay,
        startedAt,
        endedAt: new Date().toISOString(),
        sets,
        notes,
      },
      {
        onSuccess: (result) => {
          setSavedResult(result)
          onSaved?.(result)
        },
      },
    )
  }

  // Post-save success view
  if (savedResult) {
    return (
      <div className="vital-card text-center space-y-4 py-8">
        <Dumbbell className="w-10 h-10 text-primary mx-auto" aria-hidden="true" />
        <h2 className="font-heading text-xl font-bold text-text">Workout Saved!</h2>
        <div className="space-y-1 text-muted-vital text-sm">
          <p>{sets.length} sets · {Math.round(savedResult.totalVolumeKg)}kg total volume</p>
          {savedResult.notionPageId && (
            <p className="text-primary text-xs flex items-center gap-1">
              <Check className="w-3 h-3" aria-hidden="true" />
              Logged to Notion
            </p>
          )}
        </div>
        {savedResult.newPRs.length > 0 && (
          <div className="bg-[#FFB020]/10 border border-[#FFB020]/30 rounded-xl px-4 py-3">
            <p className="text-[#FFB020] font-semibold text-sm mb-1">
              New PR{savedResult.newPRs.length !== 1 ? 's' : ''}! 🎉
            </p>
            {savedResult.newPRs.map((pr) => (
              <p key={pr.exerciseName} className="text-xs text-muted-vital">
                {pr.exerciseName}: {pr.est1rm}kg est. 1RM
              </p>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setSplitDay(null)
            setSets([])
            setNotes('')
            setSavedResult(null)
          }}
          className="btn-ghost text-sm"
        >
          Start new session
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-semibold text-lg text-text mb-3">Select Split</h2>
        <SplitPicker value={splitDay} onChange={setSplitDay} />
      </div>

      {splitDay && (
        <>
          <div>
            <h2 className="font-heading font-semibold text-lg text-text mb-3">Log Sets</h2>
            <ExerciseList
              exercises={exercises ?? []}
              sets={sets}
              onAddSet={handleAddSet}
              isLoading={exercisesLoading}
            />
          </div>

          <WorkoutForm
            notes={notes}
            onNotesChange={setNotes}
            onSave={handleSave}
            isSaving={isSaving}
            setsCount={sets.length}
          />
        </>
      )}
    </div>
  )
}
