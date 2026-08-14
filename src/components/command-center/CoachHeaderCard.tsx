'use client'

import { useState } from 'react'
import { CalendarDays, Flag, Sparkles } from 'lucide-react'
import type { SessionDraft } from '@/lib/sessions/draft'
import { draftTotals } from '@/lib/sessions/draft'
import { fmtVolume } from '@/lib/utils/units'
import { logicalTodayISO } from '@/lib/utils/day'
import { useLoggedSessionDates } from '@/lib/hooks/useDayVault'
import { EMBER, GOLD, MUTED, STEEL, AMETHYST } from '@/lib/theme/palette'
import { DatePickerPopover } from './DatePickerPopover'

/**
 * Deck header: session identity, the date picker (late logging, blocks
 * already-logged dates), a live status rail, and coach insight / next-session
 * flag.
 *
 * ── WHAT THIS USED TO BE, AND WHY IT SHRANK ──────────────────────────────────
 * A title row, a six-cell 3×2 grid of bordered tinted badges at ~54px each, and
 * up to two tinted rounded callouts — roughly 200px before the first exercise
 * appeared, on the one screen whose entire purpose is the middle.
 *
 * Three of those six badges were Duration, Avg HR and Calories, and they are
 * facts you CANNOT KNOW UNTIL THE SESSION ENDS. They were being edited at the
 * top of the screen, throughout a workout, to hold numbers that only exist
 * afterwards. They now live in the finish sheet, at the moment you can answer
 * them (see `FinishSheet`).
 *
 * What is left is the three figures that change WHILE you lift — volume, sets,
 * records — as one 32px rail of inline values rather than three boxes. Roughly
 * 130px reclaimed, which is about two more exercise rows above the fold.
 */
export function CoachHeaderCard({ draft, recordCount = 0, onSetDate }: {
  draft: SessionDraft
  /** Distinct axis-records claimed so far this session (live, from `prEngine`). */
  recordCount?: number
  onSetDate: (dateISO: string) => void
}) {
  const totals = draftTotals(draft)
  const [pickerOpen, setPickerOpen] = useState(false)
  const { data: loggedDates } = useLoggedSessionDates()

  const dateLabel = new Date(draft.date + 'T12:00:00Z')
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading font-bold text-fluid-lg text-text leading-tight truncate">
            {draft.title ?? draft.splitDay.toUpperCase()}
          </h3>
          {(draft.week != null || draft.phase) && (
            <p className="text-[11px] text-muted mt-0.5">
              {draft.week != null && <>Week {draft.week}</>}
              {draft.week != null && draft.phase && ' · '}
              {draft.phase && (
                <span className="text-info font-semibold">{draft.phase === 'CUT' ? 'Cut' : draft.phase}</span>
              )}
            </p>
          )}
        </div>
        {/* Date chip — tap to open the custom calendar (greys logged/future dates).
            Still 44pt tall; it lost the fill, not the target. */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 min-h-[44px] rounded-xl text-[11px] font-semibold text-text
                       border border-white/[0.10] hover:border-primary/40 active:scale-[0.98] transition-[border-color,transform]"
            aria-label={`Session date: ${dateLabel}. Tap to change`}
            aria-expanded={pickerOpen}
          >
            <CalendarDays className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
            {dateLabel}
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
      </div>

      {/* The live rail. Only what moves while you lift. */}
      <div className="flex items-baseline gap-4 border-y border-white/[0.06] py-2">
        <Stat value={fmtVolume(totals.volumeKg)} unit="kg" label="Volume" color={EMBER} />
        <Stat value={String(totals.sets)} label="Sets" color={STEEL} />
        <Stat
          value={recordCount > 0 ? String(recordCount) : '—'}
          label={recordCount === 1 ? 'Record' : 'Records'}
          // Gold, and only when there is something to be gold about. A permanent
          // gold zero is how gold stops meaning a personal record.
          color={recordCount > 0 ? GOLD : MUTED}
        />
      </div>

      {/* Coach lines. A 2px rule instead of a tinted rounded block: the colour
          still says which kind of note this is, without the callout eating the
          width of the screen to say it. */}
      {draft.coachInsight && <Note text={draft.coachInsight} color={AMETHYST} icon={Sparkles} />}
      {draft.nextSessionFlag && <Note text={draft.nextSessionFlag} color={GOLD} icon={Flag} />}
    </div>
  )
}

function Stat({ value, unit, label, color }: { value: string; unit?: string; label: string; color: string }) {
  return (
    <div className="min-w-0">
      <span className="helix-num font-bold text-fluid-base tabular-nums leading-none" style={{ color }}>
        {value}
        {unit && <span className="text-[10px] font-normal ml-0.5 opacity-70">{unit}</span>}
      </span>
      <span className="ml-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{label}</span>
    </div>
  )
}

/**
 * A coach line. Collapsed to two lines by default and tapped open — these
 * arrive from a pasted report and can run to a paragraph, which at the top of
 * the logging screen is a wall between you and the first set.
 */
function Note({ text, color, icon: Icon }: { text: string; color: string; icon: typeof Flag }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="w-full flex gap-2 items-start text-left py-1 pl-2.5 active:scale-[0.995] transition-transform"
      style={{ borderLeft: `2px solid ${color}` }}
    >
      <Icon className="w-3 h-3 shrink-0 mt-[3px]" style={{ color }} aria-hidden="true" />
      <p className={`text-[11px] leading-snug text-text/90 ${open ? '' : 'line-clamp-2'}`} dir="auto">{text}</p>
    </button>
  )
}
