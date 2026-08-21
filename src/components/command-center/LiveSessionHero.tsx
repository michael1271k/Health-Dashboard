'use client'

import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { LeverTag } from '@/components/nutrition/LeverTag'
import { MuscleDistribution } from './MuscleDistribution'
import { DatePickerPopover } from './DatePickerPopover'
import { useLoggedSessionDates } from '@/lib/hooks/useDayVault'
import { logicalTodayISO } from '@/lib/utils/day'
import { fmtVolume } from '@/lib/utils/units'
import { EMBER, GOLD, MUTED, STEEL } from '@/lib/theme/palette'
import type { SessionDraft } from '@/lib/sessions/draft'

/**
 * The live session's title block — the workout you are in, at the size it
 * deserves, washed in its own colour.
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────
 * The identity lived only in the pinned bar, at `text-fluid-sm` — roughly
 * 13–15px, and SMALLER than the volume figure sitting beside it. It was small
 * because a pinned bar has to be small; the mistake was asking the bar to be
 * the title. So this is the iOS large-title arrangement, the same one the
 * session report uses: the real title lives in the document, and the bar
 * carries a compact copy that fades in only once this one has scrolled away
 * (see `SessionDeck`). Two elements, one title.
 *
 * ── AND WHY THE BODY IS UP HERE ──────────────────────────────────────────────
 * The muscle-distribution button used to sit in `CommitBar`, at the bottom of a
 * deck that is taller than the viewport by the third exercise — so the one
 * control that answers "where is this session actually landing" was reachable
 * only by scrolling past every set you had not done yet. It sits beside the
 * title now, and a second copy rides in the pinned bar, so the answer is one
 * tap away at any scroll position.
 */
export function LiveSessionHero({ draft, accent, volumeKg, sets, recordCount, onSetDate }: {
  draft: SessionDraft
  /** `dayColor(dayKey, splitDay)` — steel for Upper A, gold for Upper B. */
  accent: string
  volumeKg: number
  sets: number
  /** Distinct axis-records claimed so far this session (live, from `prEngine`). */
  recordCount: number
  onSetDate: (dateISO: string) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const { data: loggedDates } = useLoggedSessionDates()

  const title = draft.title ?? draft.splitDay.toUpperCase()
  const dateLabel = new Date(draft.date + 'T12:00:00Z')
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    /* Bleeds past the deck's gutters so the wash reaches the screen edges on a
       phone — a tint that stops 12px short of the edge reads as a panel behind
       the title rather than as the session's own colour. */
    <div data-live-hero className="relative -mx-3 sm:-mx-5 px-3 sm:px-5 pt-3 pb-3">
      {/* The wash, not a band. A solid block of the day's colour would compete
          with the three figures directly beneath it; a gradient that has fully
          dissolved by the time it reaches the first exercise card colours the
          top of the screen without claiming any of it. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{ background: `linear-gradient(180deg, ${accent}26 0%, ${accent}0a 45%, transparent 100%)` }}
      />

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1
            className="font-heading font-bold text-fluid-2xl leading-none truncate"
            style={{ color: accent }}
          >
            {title}
          </h1>
          {/* The date is the CONTROL, not a label beside one — a separate chip
              cost the width of three characters of the title to say the same
              thing the line already says. */}
          <div className="relative mt-1.5">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="flex items-center gap-1 text-fluid-xs text-muted leading-tight active:opacity-70 transition-opacity max-w-full"
              aria-label={`Session date: ${dateLabel}. Tap to change`}
              aria-expanded={pickerOpen}
            >
              <CalendarDays className="w-3 h-3 text-primary shrink-0" aria-hidden="true" />
              <span className="truncate">
                {draft.week != null && <>Week {draft.week} · </>}
                {draft.phase && <span className="text-info font-semibold">{draft.phase === 'CUT' ? 'Cut' : draft.phase} · </span>}
                {dateLabel}
              </span>
            </button>
            {pickerOpen && (
              <DatePickerPopover
                value={draft.date}
                max={logicalTodayISO()}
                disabledDates={loggedDates ?? new Set()}
                onSelect={onSetDate}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </div>
          {/* Which rung of the cut you are training under. It lives here rather
              than only in Settings because the deck is where the day is spent —
              a target that moved by 70 kcal overnight should be readable
              without leaving the session. */}
          <span className="flex mt-1"><LeverTag compact /></span>
        </div>

        <MuscleDistribution draft={draft} size="lg" />
      </div>

      {/* The live rail. Only what moves while you lift — duration, average HR
          and calories belong to the finish sheet, where you can answer them. */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <Tile label="Volume" value={fmtVolume(volumeKg)} unit="kg" color={EMBER} />
        <Tile label="Sets" value={String(sets)} color={STEEL} />
        <Tile
          label={recordCount === 1 ? 'Record' : 'Records'}
          value={recordCount > 0 ? String(recordCount) : '—'}
          // Gold, and only when there is something to be gold about. A permanent
          // gold zero is how gold stops meaning a personal record.
          color={recordCount > 0 ? GOLD : MUTED}
        />
      </div>
    </div>
  )
}

/**
 * One metric tile.
 *
 * Label ABOVE value, matching every other metric grid in the app (the session
 * report, the exercise record strip, the finish sheet). Solid surface, no
 * `backdrop-filter`: this sits under the pinned bar's blur, and stacking one
 * translucent layer on another is the one thing the material rules forbid.
 */
function Tile({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return (
    <div className="rounded-xl px-2.5 py-2 min-w-0"
      style={{ background: 'rgba(13,18,32,0.55)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] truncate" style={{ color }}>{label}</div>
      <div className="helix-num font-bold text-fluid-lg tabular-nums leading-none mt-1 text-text whitespace-nowrap">
        {value}
        {unit && <span className="text-[10px] font-normal text-muted ml-0.5">{unit}</span>}
      </div>
    </div>
  )
}
