'use client'

import { useMemo } from 'react'
import { Trophy, Flame } from 'lucide-react'
import type { DetailExercise } from '@/lib/hooks/useSessionDetail'
import { prAxisLabel } from '@/lib/training/prEngine'
import { isTimedExercise } from '@/lib/exercises/timed'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { GOLD, SAPPHIRE } from '@/lib/theme/palette'

/** The highest est-1RM of the session — a ranking, not a record. */
export function strongestOf(exercises: readonly DetailExercise[]): DetailExercise | null {
  let best: DetailExercise | null = null
  for (const e of exercises) {
    const v = e.bestEst1rm ?? 0
    if (v > 0 && (!best || v > (best.bestEst1rm ?? 0))) best = e
  }
  return best
}

interface Highlight { name: string; axes: string[]; detail: string }

/** Every record in the session, one line each, resolved from the set that won it. */
export function highlightsOf(exercises: readonly DetailExercise[], toDisplay: (kg: number) => number | null, unit: string): Highlight[] {
  const out: Highlight[] = []
  for (const ex of exercises) {
    const timed = isTimedExercise(ex.name)
    const won = ex.sets.filter((s) => s.isPr)
    if (!won.length) continue
    // Collapse to ONE line per exercise: the set that carries the most axes,
    // then the heaviest. Two trophy rows for one movement reads as two records.
    const lead = [...won].sort((a, b) => b.prAxes.length - a.prAxes.length || b.weightKg - a.weightKg)[0]
    const axes = (lead.prAxes.length ? lead.prAxes : ex.prAxes).map((a) => prAxisLabel(a, timed))
    out.push({
      name: ex.name,
      axes: [...new Set(axes)],
      detail: timed ? `${lead.reps}s` : `${toDisplay(lead.weightKg)}${unit} × ${lead.reps}`,
    })
  }
  return out
}

/**
 * Records and the session's strongest lift, lifted OUT of the exercise list and
 * pinned to the top.
 *
 * They used to be discoverable only by scrolling: a gold chip somewhere in one
 * exercise header, a sapphire border on another card. The two facts you most
 * want from a finished session — did I set anything, and what was the heaviest
 * thing I did — took a full scroll to answer.
 *
 * Renders nothing when there is nothing to say. A "0 PRs" panel is noise.
 */
export function SessionHighlights({ exercises }: { exercises: DetailExercise[] }) {
  const unit = useUnitSystem()
  const highlights = useMemo(
    () => highlightsOf(exercises, (kg) => displayWeight(kg), unit),
    [exercises, unit],
  )
  const strongest = useMemo(() => strongestOf(exercises), [exercises])

  if (!highlights.length && !strongest) return null

  return (
    <section className="rounded-2xl border overflow-hidden"
      style={{ borderColor: highlights.length ? `${GOLD}3d` : 'rgba(255,255,255,0.08)' }}>
      {highlights.map((h, i) => (
        <div key={h.name}
          className="flex items-center gap-2 px-3 py-2 text-fluid-xs"
          style={{
            background: `${GOLD}0d`,
            borderTop: i ? '1px solid rgba(255,255,255,0.06)' : undefined,
          }}>
          <Trophy className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD, filter: `drop-shadow(0 0 4px ${GOLD}99)` }} aria-hidden="true" />
          <span className="text-text font-semibold truncate min-w-0">{h.name}</span>
          {h.axes.map((a) => (
            <span key={a} className="text-[8px] font-bold uppercase px-1 py-px rounded shrink-0"
              style={{ color: GOLD, background: `${GOLD}1f`, border: `1px solid ${GOLD}4d` }}>{a}</span>
          ))}
          <span className="helix-num ml-auto shrink-0 font-bold tabular-nums" style={{ color: GOLD }}>{h.detail}</span>
        </div>
      ))}

      {strongest && (
        <div className="flex items-center gap-2 px-3 py-2 text-fluid-xs"
          style={{
            background: `${SAPPHIRE}0d`,
            borderTop: highlights.length ? '1px solid rgba(255,255,255,0.06)' : undefined,
          }}>
          {/* Sapphire, and a flame rather than a trophy. "Strongest" is a
              ranking within one session, not a record — sharing gold and a
              trophy with the rows above made two different things identical. */}
          <Flame className="w-3.5 h-3.5 shrink-0" style={{ color: SAPPHIRE }} aria-hidden="true" />
          <span className="text-muted shrink-0">Strongest</span>
          <span className="text-text font-semibold truncate min-w-0">{strongest.name}</span>
          <span className="helix-num ml-auto shrink-0 font-bold tabular-nums" style={{ color: SAPPHIRE }}>
            e1RM {displayWeight(strongest.bestEst1rm ?? 0)}{unit}
          </span>
        </div>
      )}
    </section>
  )
}
