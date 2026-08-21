'use client'

import { weekChip } from '@/lib/phases'
import { programForDate } from '@/lib/programs'
import { PLAN_CHIP, STEEL } from '@/lib/theme/palette'

/**
 * A week's identity as TWO chips — `[ HELIX-5 ] [ Cut │ Wk 6 ]`.
 *
 * ── WHY TWO, AND NOT THE ONE TAG THIS REPLACES ───────────────────────────────
 * The session report carried a single badge reading "Helix Cut", which fuses
 * three separate facts — which programme, which phase, and how far into it —
 * into one string that answers none of them precisely. Which Helix? How many
 * weeks in? It is also the only place in the app that said it that way: the
 * dashboard has shown a plan chip and a phase-plus-week chip since the header
 * rebuild, and the timeline shows the same three segments inline.
 *
 * ── AND WHY IT IS DERIVED FROM A DATE, NOT FROM SETTINGS ─────────────────────
 * `programForDate`, not `activeProgram()`. A session from the PPL era has to
 * keep saying PPL — reading the ACTIVE plan would let the report rewrite its own
 * history every time the programme is switched, which is the same class of bug
 * as inferring a split from a weekday.
 *
 * `weekChip` already resolves plan/phase/week/colour from a week start and is
 * what `WeekChipLabel` renders inline. This is the same data in the dashboard's
 * chip shape, for surfaces that want tags rather than a breadcrumb.
 */
export function PhaseTags({ weekStart, className = '' }: {
  /** Sunday of the week being described (see `weekStartOf`). */
  weekStart: string
  className?: string
}) {
  const program = programForDate(weekStart)
  const chip = weekChip(weekStart, program.label)
  const planColor = PLAN_CHIP[program.id] ?? STEEL

  const base = 'px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider shrink-0'

  return (
    <span className={`inline-flex items-center gap-x-1.5 min-w-0 ${className}`}>
      <span
        className={base}
        style={{ color: planColor, background: `${planColor}1f`, border: `1px solid ${planColor}55` }}
      >
        {program.label}
      </span>
      {/* Phase AND week in ONE chip, divided by a hairline rather than split
          into two. "Cut" says what the block is; the week number is the part
          that moves, and separating them lets the pair drift apart on a wrap. */}
      {chip && (
        <span
          className={`${base} inline-flex items-center gap-1.5`}
          style={{ color: chip.color, background: `rgba(${chip.rgb},0.12)`, border: `1px solid rgba(${chip.rgb},0.33)` }}
        >
          {chip.phase}
          {chip.week && (
            <>
              <span className="w-px h-2.5 opacity-40" style={{ background: 'currentColor' }} aria-hidden="true" />
              <span className="helix-num tabular-nums">{chip.week}</span>
            </>
          )}
        </span>
      )}
    </span>
  )
}
