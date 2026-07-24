'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useSessionIntel } from '@/lib/hooks/useSessionIntel'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { isTimedExercise } from '@/lib/exercises/timed'
import { ExerciseHistorySheet } from '@/components/exercises/ExerciseHistorySheet'

const ICE = '#8AA0B8'

/**
 * The Daily Nexus workout block's exercise list (replaces the abstract volume
 * bars): every exercise, expanded, with its top set and a progression glyph vs
 * the previous same-type session — ⬆️ improved · ✅ matched · ⬇️ regressed, or a
 * "Baseline" badge the first time an exercise is logged. Tapping a row opens the
 * Hevy-style history deep-dive sheet.
 */
export function SessionExerciseList({ sessionId }: { sessionId: string }) {
  const { data: intel, isLoading } = useSessionIntel(sessionId)
  const unit = useUnitSystem()
  const [active, setActive] = useState<{ id: string; name: string } | null>(null)

  if (isLoading) return <div className="h-24 rounded-xl bg-surface-2/60 animate-pulse" aria-hidden="true" />
  if (!intel?.deltas.length) return null

  return (
    <div className="space-y-1">
      {intel.deltas.map((d) => {
        const timed = isTimedExercise(d.name)
        return (
          <button
            key={d.exerciseId || d.name}
            onClick={() => setActive({ id: d.exerciseId, name: d.name })}
            className="w-full flex items-center gap-2 rounded-lg bg-white/[0.02] border border-white/[0.05] px-3 py-2 min-h-[44px] text-left active:opacity-80 hover:border-white/[0.12]"
          >
            <span className="flex-1 min-w-0 text-sm text-text truncate">{d.name}</span>
            <span className="helix-num text-xs text-muted tabular-nums shrink-0">
              {displayWeight(d.topKg)}{unit} × {d.topReps}{timed ? 's' : ''}
            </span>
            {d.delta == null ? (
              <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-px rounded"
                style={{ color: ICE, background: `${ICE}1f`, border: `1px solid ${ICE}55` }}>Baseline</span>
            ) : (
              <span className="shrink-0 text-base leading-none"
                aria-label={d.delta === 1 ? 'improved' : d.delta === -1 ? 'regressed' : 'matched'}>
                {d.delta === 1 ? '⬆️' : d.delta === -1 ? '⬇️' : '✅'}
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-muted/60 shrink-0" aria-hidden="true" />
          </button>
        )
      })}

      <ExerciseHistorySheet
        exerciseId={active?.id ?? null}
        exerciseName={active?.name ?? ''}
        open={!!active}
        onClose={() => setActive(null)}
      />
    </div>
  )
}
