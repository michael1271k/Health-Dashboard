'use client'

import { weekChip } from '@/lib/phases'
import { programForDate } from '@/lib/programs'

/**
 * A week's identity in one glanceable line: `HELIX-5 · Cut · Wk 3`.
 *
 * Replaces "helix cut week 3" — a single run-on tag that fused the plan into
 * the phase, never said which programme was running, and rendered grey
 * regardless of what phase it named. Three separated segments, the phase
 * carrying the phase colour and the plan and week number sitting back in muted
 * type, so the eye lands on the thing that changes.
 *
 * The plan comes from `programForDate`, not the ACTIVE plan: a week from the
 * PPL era has to say PPL, or the timeline rewrites its own history every time
 * you switch programmes.
 */
export function WeekChipLabel({ weekStart, className = '' }: { weekStart: string; className?: string }) {
  const chip = weekChip(weekStart, programForDate(weekStart).label)
  if (!chip) {
    return (
      <span className={`text-[10px] font-bold uppercase tracking-[0.16em] text-muted ${className}`}>
        Week of {new Date(`${weekStart}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
      </span>
    )
  }
  return (
    <span className={`inline-flex items-baseline gap-1.5 min-w-0 ${className}`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted truncate">{chip.plan}</span>
      <Dot />
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] truncate" style={{ color: chip.color }}>
        {chip.phase}
      </span>
      {chip.week && (
        <>
          <Dot />
          <span className="helix-num text-[10px] font-bold tracking-wide shrink-0" style={{ color: chip.color }}>
            {chip.week}
          </span>
        </>
      )}
    </span>
  )
}

const Dot = () => <span aria-hidden="true" className="text-muted/50 text-[9px] shrink-0">•</span>
