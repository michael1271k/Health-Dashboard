'use client'

import { useState } from 'react'
import { Star, ChevronRight, Dumbbell } from 'lucide-react'
import type { DetailExercise } from '@/lib/hooks/useSessionDetail'
import { useSessionIntel } from '@/lib/hooks/useSessionIntel'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { isTimedExercise } from '@/lib/exercises/timed'
import { GROUP_COLOR } from '@/lib/hooks/useMuscleAnalytics'
import { ExerciseHistorySheet } from '@/components/exercises/ExerciseHistorySheet'

const GOLD = '#F5C15A', ROSE = '#FB7185', TEAL = '#34D399', ICE = '#38BDF8'

function SetTypeBadge({ type }: { type: string }) {
  if (type === 'warmup') return <span className="text-[8px] font-bold uppercase px-1 py-px rounded" style={{ color: TEAL, background: `${TEAL}1f` }}>WU</span>
  if (type === 'failure') return <span className="text-[8px] font-bold uppercase px-1 py-px rounded" style={{ color: ROSE, background: `${ROSE}1f` }}>Fail</span>
  return null
}

/** vs-last-same-type glyph: ⬆️ improved · ✅ matched · ⬇️ regressed · 🆕 baseline. */
function deltaGlyph(delta: -1 | 0 | 1 | null | undefined): string | null {
  if (delta === undefined) return null
  if (delta == null) return '🆕'
  return delta === 1 ? '⬆️' : delta === -1 ? '⬇️' : '✅'
}

/**
 * Every exercise of the session, fully expanded: each set's weight × reps, RPE,
 * warm-up / to-failure tag, PR star and estimated 1RM. The exercise header
 * carries its muscle-group chips and a progression glyph vs the previous same-
 * type session; tapping it opens the Hevy-style history sheet.
 */
export function ExerciseBreakdown({ sessionId, exercises }: { sessionId: string; exercises: DetailExercise[] }) {
  const unit = useUnitSystem()
  const { data: intel } = useSessionIntel(sessionId)
  const [active, setActive] = useState<{ id: string; name: string } | null>(null)
  const deltaFor = new Map((intel?.deltas ?? []).map((d) => [d.exerciseId, d.delta]))

  return (
    <div className="space-y-3">
      <h2 className="font-heading text-fluid-base font-bold text-text px-1 flex items-center gap-2">
        <Dumbbell className="w-4 h-4" style={{ color: ICE }} aria-hidden="true" /> Exercises
      </h2>
      {exercises.map((ex) => {
        const timed = isTimedExercise(ex.name)
        const glyph = deltaGlyph(deltaFor.get(ex.exerciseId))
        return (
          <section key={ex.exerciseId} className="helix-card space-y-2.5" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <button onClick={() => setActive({ id: ex.exerciseId, name: ex.name })}
              className="w-full flex items-center gap-2 text-left active:opacity-80" aria-label={`${ex.name} history`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-heading font-semibold text-fluid-sm text-text truncate">{ex.name}</span>
                  {ex.isCompound && <span className="text-[8px] font-bold uppercase px-1 py-px rounded shrink-0" style={{ color: ICE, background: `${ICE}1f` }}>Compound</span>}
                  {glyph && <span className="text-sm shrink-0" aria-hidden="true">{glyph}</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {ex.muscleGroups.map((g) => (
                    <span key={g} className="text-[9px] font-semibold px-1.5 py-px rounded-full"
                      style={{ color: GROUP_COLOR[g] ?? '#8B97B2', background: `${GROUP_COLOR[g] ?? '#8B97B2'}18` }}>{g}</span>
                  ))}
                  <span className="text-[9px] text-muted helix-num">
                    {ex.workingSets} set{ex.workingSets !== 1 ? 's' : ''} · {Math.round(displayWeight(ex.volumeKg) ?? 0).toLocaleString()}{unit}
                    {ex.bestEst1rm != null && ` · e1RM ${displayWeight(ex.bestEst1rm)}${unit}`}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted/60 shrink-0" aria-hidden="true" />
            </button>

            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <table className="w-full text-fluid-xs">
                <tbody>
                  {ex.sets.map((set, i) => (
                    <tr key={i} className="border-b border-white/[0.05] last:border-0" style={set.setType === 'warmup' ? { opacity: 0.6 } : undefined}>
                      <td className="px-2.5 py-2 text-muted helix-num w-8">{set.setType === 'warmup' ? '·' : set.setNumber}</td>
                      <td className="px-2 py-2 text-text helix-num tabular-nums">
                        {displayWeight(set.weightKg)}{unit} × {set.reps}{timed ? 's' : ''}
                      </td>
                      <td className="px-2 py-2 text-right text-muted helix-num">{set.rpe != null ? `RPE ${set.rpe}` : ''}</td>
                      <td className="px-2 py-2 text-right"><SetTypeBadge type={set.setType} /></td>
                      <td className="px-2.5 py-2 text-right w-6">{set.isPr && <Star className="inline w-3.5 h-3.5" style={{ color: GOLD, filter: `drop-shadow(0 0 3px ${GOLD})` }} aria-label="PR" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
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
