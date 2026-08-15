'use client'

import { useMemo } from 'react'
import { Trophy, Flame } from 'lucide-react'
import type { DetailExercise } from '@/lib/hooks/useSessionDetail'
import { prAxisLabel } from '@/lib/training/prEngine'
import { isTimedExercise } from '@/lib/exercises/timed'
import { formatSet } from '@/lib/utils/setFormat'
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
    // `prAxes` is read defensively throughout: a localStorage-persisted session
    // detail written before the field existed rehydrates without it, and a bare
    // `.length` here took the whole report down with an error boundary.
    const lead = [...won].sort((a, b) => (b.prAxes?.length ?? 0) - (a.prAxes?.length ?? 0) || b.weightKg - a.weightKg)[0]
    const axes = (lead.prAxes?.length ? lead.prAxes : ex.prAxes ?? []).map((a) => prAxisLabel(a, timed))
    out.push({
      name: ex.name,
      axes: [...new Set(axes)],
      detail: formatSet(lead.weightKg, lead.reps, { timed, unit, toDisplay }),
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

  /* ── CHIPS, NOT A PANEL ──
     A record is a FACT ABOUT the session, not a section of the report. This
     used to be a bordered panel of full-width tinted rows sitting between the
     header and Progression — so a session with one PR spent a whole card
     saying it, and a session with none left a gap where readers had learned to
     look. Inline chips inside the Progression band carry the same three facts
     (movement, axes, the set that won it) and cost one line.

     Sapphire and a flame for "strongest", gold and a trophy for records: a
     ranking within one session is not a record, and sharing gold made two
     different things look identical. */
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {highlights.map((h) => (
        <span key={h.name}
          title={`Record · ${h.axes.join(' · ')} · ${h.detail}`}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold max-w-full"
          style={{ color: GOLD, background: `${GOLD}14`, border: `1px solid ${GOLD}40` }}>
          <Trophy className="w-3 h-3 shrink-0" style={{ filter: `drop-shadow(0 0 4px ${GOLD}99)` }} aria-hidden="true" />
          <span className="truncate min-w-0 text-text">{h.name}</span>
          <span className="helix-num tabular-nums shrink-0">{h.detail}</span>
        </span>
      ))}
      {strongest && (
        <span
          title={`Strongest lift of the session · ${strongest.name}`}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold max-w-full"
          style={{ color: SAPPHIRE, background: `${SAPPHIRE}14`, border: `1px solid ${SAPPHIRE}40` }}>
          <Flame className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span className="truncate min-w-0 text-text">{strongest.name}</span>
          <span className="helix-num tabular-nums shrink-0">
            e1RM {displayWeight(strongest.bestEst1rm ?? 0)}{unit}
          </span>
        </span>
      )}
    </div>
  )
}
