'use client'

import { useState } from 'react'
import type { WorkoutSet } from '@/lib/types/workout'
import { ChevronDown, TrendingUp } from 'lucide-react'
import { SetRow } from './SetRow'

interface ExerciseSliderProps {
  exerciseId: string
  exerciseName: string
  exerciseNameHe?: string
  existingSets: WorkoutSet[]
  previous: { weightKg: number; reps: number } | null
  onAddSet: (set: WorkoutSet) => void
}

export function ExerciseSlider({
  exerciseId,
  exerciseName,
  exerciseNameHe,
  existingSets,
  previous,
  onAddSet,
}: ExerciseSliderProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Pre-initialize to previous values; fall back to sensible defaults
  const defaultWeight = previous?.weightKg ?? 20
  const defaultReps   = previous?.reps    ?? 10

  const [weight, setWeight] = useState(defaultWeight)
  const [reps,   setReps]   = useState(defaultReps)

  // Dynamic slider bounds centred on the default so the user can go ±reasonable
  const weightMin  = 0
  const weightMax  = Math.max(150, defaultWeight + 40)
  const repsMin    = 1
  const repsMax    = Math.max(25, defaultReps + 5)

  function handleAdd() {
    onAddSet({
      exerciseId,
      exerciseName,
      exerciseNameHe,
      setNumber: existingSets.length + 1,
      weightKg: weight,
      reps,
    })
  }

  return (
    <div className="helix-card">
      {/* ── Header — always visible */}
      <button
        type="button"
        onClick={() => setIsOpen((p) => !p)}
        aria-expanded={isOpen}
        aria-controls={`ex-slider-${exerciseId}`}
        className="w-full flex items-center justify-between cursor-pointer"
      >
        <div className="flex flex-col items-start gap-0.5 min-w-0">
          <span className="font-medium text-text leading-snug">{exerciseName}</span>
          {/* Progressive-overload memory — always visible in header */}
          <span className="text-xs text-muted-vital leading-snug flex items-center gap-1">
            {previous ? (
              <>
                <TrendingUp className="w-3 h-3 text-success shrink-0" aria-hidden="true" />
                Previous: {previous.weightKg}kg × {previous.reps}
              </>
            ) : (
              'No history yet'
            )}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-3">
          {existingSets.length > 0 && (
            <span className="text-xs text-muted-vital tabular-nums">
              {existingSets.length} set{existingSets.length !== 1 ? 's' : ''}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-muted-vital transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </div>
      </button>

      {/* ── Expanded: logged sets + sliders + Log Set button */}
      {isOpen && (
        <div
          id={`ex-slider-${exerciseId}`}
          className="mt-4 border-t border-white/[0.06] pt-4 space-y-4"
        >
          {/* Previously logged sets in this session */}
          {existingSets.length > 0 && (
            <div className="space-y-1">
              {existingSets.map((s) => (
                <SetRow key={`${s.exerciseId}-${s.setNumber}`} set={s} />
              ))}
            </div>
          )}

          {/* ── Weight slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={`w-${exerciseId}`} className="text-muted-vital font-medium">
                Weight
              </label>
              <span className="helix-num font-bold text-text text-sm tabular-nums">
                {weight.toFixed(weight % 1 === 0 ? 0 : 1)}
                <span className="text-xs text-muted-vital font-normal ml-0.5">kg</span>
              </span>
            </div>
            <input
              id={`w-${exerciseId}`}
              type="range"
              min={weightMin}
              max={weightMax}
              step={0.5}
              value={weight}
              onChange={(e) => setWeight(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer
                         bg-surface-2 accent-primary"
              aria-label={`Weight for ${exerciseName}`}
            />
            <div className="flex justify-between text-[10px] text-muted-vital tabular-nums">
              <span>{weightMin}kg</span>
              <span>{weightMax}kg</span>
            </div>
          </div>

          {/* ── Reps slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={`r-${exerciseId}`} className="text-muted-vital font-medium">
                Reps
              </label>
              <span className="helix-num font-bold text-text text-sm tabular-nums">
                {reps}
                <span className="text-xs text-muted-vital font-normal ml-0.5">reps</span>
              </span>
            </div>
            <input
              id={`r-${exerciseId}`}
              type="range"
              min={repsMin}
              max={repsMax}
              step={1}
              value={reps}
              onChange={(e) => setReps(parseInt(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer
                         bg-surface-2 accent-primary"
              aria-label={`Reps for ${exerciseName}`}
            />
            <div className="flex justify-between text-[10px] text-muted-vital tabular-nums">
              <span>{repsMin}</span>
              <span>{repsMax}</span>
            </div>
          </div>

          {/* ── Log Set button */}
          <button
            type="button"
            onClick={handleAdd}
            className="btn-primary w-full py-2.5 text-sm justify-center"
          >
            Log Set {existingSets.length + 1}
            <span className="text-xs opacity-70 ml-1">
              ({weight.toFixed(weight % 1 === 0 ? 0 : 1)}kg × {reps})
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
