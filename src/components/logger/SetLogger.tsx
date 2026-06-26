'use client'

import { useState } from 'react'
import type { WorkoutSet } from '@/lib/types/workout'

interface SetLoggerProps {
  exerciseId: string
  exerciseName: string
  exerciseNameHe?: string
  existingSetsCount: number
  onAddSet: (set: WorkoutSet) => void
}

export function SetLogger({
  exerciseId,
  exerciseName,
  exerciseNameHe,
  existingSetsCount,
  onAddSet,
}: SetLoggerProps) {
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [rpe, setRpe] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const wkg = parseFloat(weight)
    const r = parseInt(reps)
    if (!wkg || !r) return

    onAddSet({
      exerciseId,
      exerciseName,
      exerciseNameHe,
      setNumber: existingSetsCount + 1,
      weightKg: wkg,
      reps: r,
      rpe: rpe ? parseFloat(rpe) : undefined,
    })
    setWeight('')
    setReps('')
    setRpe('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 mt-2">
      <div className="flex flex-col gap-0.5 flex-1">
        <label htmlFor={`weight-${exerciseId}`} className="text-xs text-muted-vital">
          Weight (kg)
        </label>
        <input
          id={`weight-${exerciseId}`}
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="80"
          required
          className="vital-number bg-surface-2 border border-border rounded-xl px-3 py-3
                     text-text placeholder:text-muted-vital focus:outline-none focus:ring-2
                     focus:ring-primary/60 w-full"
        />
      </div>
      <div className="flex flex-col gap-0.5 w-20">
        <label htmlFor={`reps-${exerciseId}`} className="text-xs text-muted-vital">
          Reps
        </label>
        <input
          id={`reps-${exerciseId}`}
          type="number"
          inputMode="numeric"
          min="1"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          placeholder="8"
          required
          className="vital-number bg-surface-2 border border-border rounded-xl px-3 py-3
                     text-text placeholder:text-muted-vital focus:outline-none focus:ring-2
                     focus:ring-primary/60 w-full"
        />
      </div>
      <div className="flex flex-col gap-0.5 w-20">
        <label htmlFor={`rpe-${exerciseId}`} className="text-xs text-muted-vital">
          RPE
        </label>
        <input
          id={`rpe-${exerciseId}`}
          type="number"
          inputMode="decimal"
          min="1"
          max="10"
          step="0.5"
          value={rpe}
          onChange={(e) => setRpe(e.target.value)}
          placeholder="8"
          className="vital-number bg-surface-2 border border-border rounded-xl px-3 py-3
                     text-text placeholder:text-muted-vital focus:outline-none focus:ring-2
                     focus:ring-primary/60 w-full"
        />
      </div>
      <button
        type="submit"
        className="btn-primary h-11 px-4 shrink-0"
        aria-label="Add set"
      >
        + Set
      </button>
    </form>
  )
}
