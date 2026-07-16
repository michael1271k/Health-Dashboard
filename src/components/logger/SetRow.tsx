'use client'

import type { WorkoutSet } from '@/lib/types/workout'

interface SetRowProps {
  set: WorkoutSet
  isPR?: boolean
}

export function SetRow({ set, isPR }: SetRowProps) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
      <span className="text-muted text-sm w-6 text-center tabular-nums">
        {set.setNumber}
      </span>
      <span className="helix-num font-semibold text-text flex-1">
        {set.weightKg}
        <span className="text-muted text-xs ml-0.5">kg</span>
        {' '}×{' '}
        {set.reps}
        <span className="text-muted text-xs ml-0.5">reps</span>
      </span>
      {set.rpe != null && (
        <span className="text-xs text-muted tabular-nums">
          RPE {set.rpe}
        </span>
      )}
      {isPR && (
        <span
          className="text-xs font-bold text-[#FFB020] bg-[#FFB020]/10 px-1.5 py-0.5 rounded-md"
          aria-label="Personal record"
        >
          PR
        </span>
      )}
    </div>
  )
}
