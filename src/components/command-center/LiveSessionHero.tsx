'use client'

import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { LeverTag } from '@/components/nutrition/LeverTag'
import { BackLink } from '@/components/nav/NavChevron'
import { MuscleDistribution } from './MuscleDistribution'
import { SessionClock } from './SessionClockSheet'
import { SessionElapsed } from './SessionElapsed'
import { SessionMenu } from './SessionMenu'
import { FinishButton } from './FinishButton'
import { DatePickerPopover } from './DatePickerPopover'
import { useLoggedSessionDates } from '@/lib/hooks/useDayVault'
import { logicalTodayISO } from '@/lib/utils/day'
import { fmtVolume } from '@/lib/utils/units'
import { cleanSessionTitle, type SessionDraft } from '@/lib/sessions/draft'
import { EMBER, GOLD, MUTED, STEEL } from '@/lib/theme/palette'

/**
 * The live session's title block — the workout you are in, at the size it
 * deserves, washed in its own colour.
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────
 * The identity lived only in the pinned bar, at `text-fluid-sm` — roughly
 * 13–15px, and SMALLER than the volume figure sitting beside it. It was small
 * because a pinned bar has to be small; the mistake was asking the bar to be
 * the title. So this is the iOS large-title arrangement: the real title lives in
 * the document, and the bar carries a compact copy that slides in only once this
 * one has scrolled away (see `LiveSessionBar`). Two elements, one title.
 *
 * ── THE BACK BUTTON LIVES HERE, NOT ABOVE ────────────────────────────────────
 * There used to be a translucent 44px band above this block whose entire
 * contents, at the top of the screen, was a back chevron — the bar's title and
 * numbers are invisible until you scroll, so at rest it was a strip of chrome
 * around nothing, on the screen with the least room to spare. The chevron is a
 * title-row control now and the band is gone; the collapsed bar carries its own
 * copy, and the two are never on screen at the same time.
 *
 * ── AND WHY THE BODY IS UP HERE ──────────────────────────────────────────────
 * The muscle-distribution button used to sit in `CommitBar`, at the bottom of a
 * deck that is taller than the viewport by the third exercise — so the one
 * control that answers "where is this session actually landing" was reachable
 * only by scrolling past every set you had not done yet. It sits beside the
 * title now, tinted in the workout's own colour, and the collapsed bar carries
 * the same button once this scrolls off.
 */
export function LiveSessionHero({ draft, accent, volumeKg, sets, recordCount, onBack, onSetDate, onFinish, finishBusy, isEdit, deleting, onDiscard, onCancelEdit, onDelete }: {
  draft: SessionDraft
  /** `dayColor(dayKey, splitDay)` — steel for Upper A, gold for Upper B. */
  accent: string
  volumeKg: number
  sets: number
  /** Distinct axis-records claimed so far this session (live, from `prEngine`). */
  recordCount: number
  onBack: () => void
  onSetDate: (dateISO: string) => void
  /**
   * ── FINISH LIVES AT THE TOP NOW ────────────────────────────────────────────
   * It used to be the full-width primary in `CommitBar`, pinned to the BOTTOM of
   * a deck that is taller than the viewport by the third exercise. That put the
   * one irreversible action of the session directly under the thumb that is
   * ticking sets, and put it at the far end of the document from the title,
   * the date and the totals it is a decision about.
   *
   * Up here it sits beside the muscle figure — the two controls that answer
   * "where is this landing" and "am I done" — and the collapsed bar carries the
   * same pair once this scrolls off, so both are one tap away at any scroll
   * position. The bottom bar keeps discard/delete, which are the actions you
   * should have to travel to.
   */
  onFinish: () => void
  finishBusy?: boolean
  /** Edit mode says "Save", not "Finish" — it is not ending anything. */
  isEdit?: boolean
  /**
   * ── DISCARD MOVED UP HERE TOO, BUT ONE LEVEL DOWN ──────────────────────────
   * The sticky `CommitBar` at the foot of the deck is gone: once Finish left it
   * the bar held one button and was still paying for a 52px control, two
   * stacked bottom paddings and a fade gradient, permanently, at the bottom of
   * every screen. That was most of the dead space under the last exercise.
   *
   * Its contents live behind the header's overflow — near the other session
   * controls, but not ADJACENT to Finish, because discarding a draft and
   * deleting a committed workout are the two actions on this screen that
   * destroy something. See `SessionMenu`.
   */
  deleting?: boolean
  onDiscard: () => void
  onCancelEdit?: () => void
  onDelete?: () => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const { data: loggedDates } = useLoggedSessionDates()

  // The NAME, never the strapline — see `cleanSessionTitle`.
  const title = cleanSessionTitle(draft)
  const dateLabel = new Date(draft.date + 'T12:00:00Z')
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    /* Bleeds past the deck's gutters so the wash reaches the screen edges on a
       phone — a tint that stops 12px short of the edge reads as a panel behind
       the title rather than as the session's own colour. `safe-pt` because
       nothing sits above this any more. */
    <div data-live-hero className="relative -mx-3 sm:-mx-5 px-3 sm:px-5 safe-pt pt-2 pb-3">
      {/* The wash, not a band. A solid block of the day's colour would compete
          with the three figures directly beneath it; a gradient that has fully
          dissolved by the time it reaches the first exercise card colours the
          top of the screen without claiming any of it. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{ background: `linear-gradient(180deg, ${accent}26 0%, ${accent}0a 45%, transparent 100%)` }}
      />

      {/* ── THE TITLE ROW HOLDS THE TITLE AND THE TWO LIVE ACTIONS ──
          It used to hold three controls, and "Legs & Core A" — a real workout
          name, not a pathological one — ellipsized at 390px before the first
          set was logged. The name is the one thing on this screen that cannot
          be recovered from anywhere else on it, so it wins the width.

          Two changes buy it back. `text-fluid-xl` instead of `2xl` (the step is
          about 4px at phone widths and the title is still the largest type on
          the screen by a clear margin), and the muscle figure moves down to the
          date row, which was carrying a date and nothing else across the whole
          right half.

          ── AND THEN THE ROW WAS SORTED BY WHAT THE CONTROLS ARE ──
          It held Back, the title, the clock and Finish — a navigation, a title,
          a tool and a commit, in that order, all at the same weight. Four
          different KINDS of thing reading as one undifferentiated strip of
          buttons is what made it look like a toolbar rather than a title.

          Now the row holds only what belongs to the SESSION AS A WHOLE:
          minimise on the left, the name, then the two session-level controls —
          overflow (which is where discard and delete went) and Finish, which is
          the only primary on the screen and therefore the only filled control
          in the row. The tools you reach for between sets — the clock and the
          muscle figure — moved down to the metadata line, which is where your
          eye already is when you look up from a set. */}
      <div className="flex items-center gap-2">
        <BackLink onClick={onBack} label="Minimise — the draft keeps running" />
        <h1
          className="flex-1 min-w-0 font-heading font-bold text-fluid-xl leading-tight truncate tracking-[-0.01em]"
          style={{ color: accent }}
        >
          {title}
        </h1>
        <SessionMenu
          isEdit={!!isEdit}
          deleting={deleting}
          onDiscard={onDiscard}
          onCancelEdit={onCancelEdit}
          onDelete={onDelete}
        />
        <FinishButton onClick={onFinish} busy={finishBusy} disabled={sets === 0} isEdit={isEdit} />
      </div>

      {/* The date is the CONTROL, not a label beside one — a separate chip cost
          the width of three characters of the title to say the same thing the
          line already says. Indented to the title's own left edge, past the
          chevron, so the two read as one block. */}
      <div className="relative mt-1.5 ml-9 flex items-start gap-2">
        <div className="min-w-0 flex-1">
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
        {/* Which rung of the cut you are training under. It lives here rather
            than only in Settings because the deck is where the day is spent — a
            target that moved by 70 kcal overnight should be readable without
            leaving the session. */}
        <span className="flex mt-1"><LeverTag compact /></span>
        </div>
        {/* ── THE TWO BETWEEN-SETS TOOLS, TOGETHER ──
            Where this session is landing, and how long you have been standing
            still. Both sat in the title row at one point and cost the name
            44px each; here they fill space the date line never used, stay above
            the fold, and are still one tap. Grouped because they are the same
            kind of thing — neither changes the session, both answer a question
            you have while you are resting. */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Total session time first: it is the reading, and the two controls
              beside it are things you DO. It renders nothing on a back-dated or
              edited deck, where "now minus started" is not a real duration. */}
          <SessionElapsed startedAt={draft.startedAt} />
          <SessionClock />
          <MuscleDistribution draft={draft} accent={accent} size="lg" />
        </div>
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
 * Label ABOVE value, matching every other metric grid in the app. Solid surface,
 * no `backdrop-filter`: this sits under the collapsed bar's blur, and stacking
 * one translucent layer on another is the one thing the material rules forbid.
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
