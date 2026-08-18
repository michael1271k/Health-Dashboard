'use client'

import { memo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { AppBar } from '@/components/nav/AppBar'
import { BackLink } from '@/components/nav/NavChevron'
import { fmtVolume } from '@/lib/utils/units'
import { logicalTodayISO } from '@/lib/utils/day'
import { useLoggedSessionDates } from '@/lib/hooks/useDayVault'
import { EMBER, GOLD, MUTED, STEEL } from '@/lib/theme/palette'
import { DatePickerPopover } from './DatePickerPopover'

/**
 * The pinned bar for a live session.
 *
 * ── WHAT WAS THERE BEFORE ────────────────────────────────────────────────────
 * A plain `<header>` carrying the word "Log" and the sentence "Autosaves as you
 * edit — back never discards". Not sticky, no accent, no session identity, no
 * data — on the one screen in the app you spend an hour on, scrolling a deck
 * that is taller than the viewport by the third exercise. Everything that
 * actually identified the session (its name, its date, its running totals) sat
 * ~100px below it inside `CoachHeaderCard` and scrolled away with the first
 * swipe, so mid-workout there was nothing on screen saying what you were doing
 * or how far in you were.
 *
 * ── WHAT IT IS NOW ───────────────────────────────────────────────────────────
 * `AppBar` — the same pinned chrome the Nexus, the report reader and the
 * session analysis already use, so this route stops being the one document
 * surface without a command bar. Translucent (`.app-chrome` is the only thing
 * in the app still allowed to be), with a scroll-edge fade instead of a border,
 * and the deck passing underneath it.
 *
 * It carries what changes WHILE you lift — volume, sets, records — and nothing
 * that cannot change until the session ends. Duration, average HR and calories
 * belong to the finish sheet, where you can actually answer them.
 *
 * ── WHY IT TAKES PRIMITIVES, NOT THE DRAFT ───────────────────────────────────
 * `SessionDeck` computes `draftTotals` once and hands down three numbers. Given
 * the draft, this bar would re-render on every keystroke in every set field —
 * exactly the cost `src/tests/deck-render.test*` exists to catch — and it would
 * pay it to redraw two figures that only move when a set is ticked.
 */
export const LiveSessionBar = memo(function LiveSessionBar({
  title, week, phase, dateISO, accent, volumeKg, sets, recordCount, onBack, onSetDate,
}: {
  title: string
  week?: number | null
  phase?: string | null
  dateISO: string
  /** Hex for the bar's top hairline — which workout this is. */
  accent?: string
  volumeKg: number
  sets: number
  /** Distinct axis-records claimed so far this session (live, from `prEngine`). */
  recordCount: number
  onBack: () => void
  onSetDate: (dateISO: string) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const { data: loggedDates } = useLoggedSessionDates()

  const dateLabel = new Date(dateISO + 'T12:00:00Z')
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <AppBar accent={accent}>
      <BackLink onClick={onBack} label="Back — the draft autosaves" />

      <div className="min-w-0 flex-1">
        <h1 className="font-heading font-bold text-fluid-sm text-text leading-tight truncate">{title}</h1>
        {/* The date is the control, not a label beside one. A separate 44pt
            chip cost the width of three characters of the title to say the same
            thing the line already says. */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-muted leading-tight active:opacity-70 transition-opacity"
            aria-label={`Session date: ${dateLabel}. Tap to change`}
            aria-expanded={pickerOpen}
          >
            <CalendarDays className="w-3 h-3 text-primary shrink-0" aria-hidden="true" />
            <span className="truncate">
              {week != null && <>Week {week} · </>}
              {phase && <span className="text-info font-semibold">{phase === 'CUT' ? 'Cut' : phase} · </span>}
              {dateLabel}
            </span>
          </button>
          {pickerOpen && (
            <DatePickerPopover
              value={dateISO}
              max={logicalTodayISO()}
              disabledDates={loggedDates ?? new Set()}
              onSelect={onSetDate}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
      </div>

      {/* The live rail. Only what moves while you lift. */}
      <div className="flex items-baseline gap-2.5 shrink-0">
        <Stat value={fmtVolume(volumeKg)} unit="kg" label="Vol" color={EMBER} />
        <Stat value={String(sets)} label="Sets" color={STEEL} />
        <Stat
          value={recordCount > 0 ? String(recordCount) : '—'}
          label={recordCount === 1 ? 'PR' : 'PRs'}
          // Gold, and only when there is something to be gold about. A permanent
          // gold zero is how gold stops meaning a personal record.
          color={recordCount > 0 ? GOLD : MUTED}
        />
      </div>
    </AppBar>
  )
})

function Stat({ value, unit, label, color }: { value: string; unit?: string; label: string; color: string }) {
  return (
    <span className="inline-flex flex-col items-end leading-none">
      <span className="helix-num font-bold text-[13px] tabular-nums" style={{ color }}>
        {value}
        {unit && <span className="text-[9px] font-normal ml-0.5 opacity-70">{unit}</span>}
      </span>
      <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted mt-0.5">{label}</span>
    </span>
  )
}
