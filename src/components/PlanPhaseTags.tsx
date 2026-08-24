'use client'

import { useEffect, useState } from 'react'
import { LeverTag } from '@/components/nutrition/LeverTag'
import { STEEL, PLAN_CHIP } from '@/lib/theme/palette'
import { activeProgram, activePhase } from '@/lib/programs'
import { PHASE_COLORS, PHASE_META, type Phase } from '@/lib/nutrition/phase'
import { programWeekNumber } from '@/lib/reports/weekNumber'
import { useLogicalDate } from '@/lib/hooks/useLogicalDate'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'

/**
 * Which block you are training, as two tags: the plan, then the phase with its
 * week.
 *
 * ── WHY TWO TAGS AND NOT ONE STRING ──────────────────────────────────────────
 * The Progress tab rendered "HELIX · Cut · W6" as a single pill: one border,
 * one colour, three facts of different kinds welded together, with the week
 * number recovered by running a regex over a human-readable label
 * (`/Week\s+(\d+)/i`). The Dashboard had already solved the same problem
 * properly — a plan chip in the plan's own colour, a phase chip in the phase's
 * colour carrying the week behind a hairline — and the two headers disagreed
 * about the same block on the same day.
 *
 * The plan and the phase are not one fact. The plan changes rarely and names
 * the program; the phase changes on a schedule and names the direction. They
 * get a chip each, tinted by what they are, and the week rides with the phase
 * because that is the thing it counts.
 *
 * ── AND THE WEEK COMES FROM THE COUNTER ──────────────────────────────────────
 * `programWeekNumber` is THE program week — the same one Momentum labels its
 * capsules with. The block opened mid-week, so Week 0 is a real half week and
 * any second count of its own runs one ahead of the timeline forever.
 * `useLogicalDate` rather than a bare `logicalTodayISO()` call, so the tag
 * advances the instant the configured week boundary passes instead of waiting
 * for something unrelated to re-render.
 */
export function PlanPhaseTags({ lever = true, className = '' }: {
  /** The deficit-rung chip. On by default; off where space is tight. */
  lever?: boolean
  className?: string
}) {
  // Both read localStorage, so resolve AFTER mount to avoid an SSR/client
  // hydration mismatch. The version is in the deps, not `[]`: reading once
  // post-mount fixes hydration but unsubscribes forever, and the chip then
  // froze on whatever plan happened to be cached at mount.
  const planVersion = useScheduleVersion()
  const [tags, setTags] = useState<{ planLabel: string; planColor: string; phase: Phase } | null>(null)
  useEffect(() => {
    const p = activeProgram()
    setTags({ planLabel: p.label, planColor: PLAN_CHIP[p.id] ?? STEEL, phase: activePhase() as Phase })
  }, [planVersion])

  const planWeek = programWeekNumber(useLogicalDate())

  if (!tags) return null
  const phaseColor = PHASE_COLORS[tags.phase]

  return (
    <div className={`flex items-center gap-x-1.5 shrink-0 ${className}`}>
      <span
        className="px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider shrink-0"
        style={{ color: tags.planColor, background: `${tags.planColor}1f`, border: `1px solid ${tags.planColor}55` }}
      >
        {tags.planLabel}
      </span>
      {/* Phase AND week, one badge. "Cut" alone says what the block is but not
          where you are inside it; the week number is the part that changes. The
          divider keeps it one object rather than two chips that could drift
          apart. */}
      <span
        className="px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider shrink-0 inline-flex items-center gap-1.5"
        style={{ color: phaseColor, background: `${phaseColor}1f`, border: `1px solid ${phaseColor}55` }}
      >
        {PHASE_META[tags.phase].label}
        <span className="w-px h-2.5 opacity-40" style={{ background: 'currentColor' }} aria-hidden="true" />
        <span className="helix-num tabular-nums">Wk {planWeek}</span>
      </span>
      {/* Which rung of the cut is in force. It sits with the phase because it IS
          a phase fact — "Cut" says what the block is, the lever says how tight
          it is set — and because the calorie target moving by 70 overnight with
          nothing naming the cause is how a deliberate change reads as a bug. */}
      {lever && <LeverTag compact />}
    </div>
  )
}
