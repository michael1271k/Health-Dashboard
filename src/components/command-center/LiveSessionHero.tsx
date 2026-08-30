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
import { GOLD, MUTED, STEEL } from '@/lib/theme/palette'

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
 * ── AND WHAT IS *NOT* UP HERE ANY MORE ───────────────────────────────────────
 * The rest timer and the muscle figure. Both were 44px controls in a row that
 * also held a chevron, the workout's name, an overflow menu and Finish, and the
 * name — the one thing on this screen that cannot be recovered from anything
 * else on it — was ellipsizing at 390px before the first set was logged.
 *
 * Neither is used mid-set. You reach for a rest timer between exercises, and
 * the body figure answers "where did this land", which is a review question;
 * drawing its ~60 SVG paths at 32 CSS px on every header paint to have it
 * permanently visible was paying for a glance nobody takes. They are rows in
 * the session menu now — labelled, one tap, and the figure is not rendered at
 * all until the sheet asks for it.
 *
 * What is left is what the header is FOR: which workout, how long you have been
 * here, and the button that ends it.
 */
export function LiveSessionHero({ draft, accent, volumeKg, sets, recordCount, onBack, onSetDate, onFinish, onOpenDuration, finishBusy, isEdit, deleting, onDiscard, onCancelEdit, onDelete }: {
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
   * Up here it closes the title row — the name, how long you have been at it,
   * the overflow, and the commit — and the collapsed bar carries its own copy
   * once this scrolls off, so it is one tap away at any scroll position. The
   * menu keeps discard/delete, which are the actions you should have to travel
   * to.
   */
  onFinish: () => void
  /** Opens `DurationSheet` — start time, and the pause. Owned by the deck, which
   *  is the only place that can also read the clock at commit. */
  onOpenDuration: () => void
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
    <div data-live-hero className="relative -mx-3 sm:-mx-5 px-3 sm:px-5 safe-pt pt-2 pb-2">
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
          the screen by a clear margin), and the two between-sets tools left the
          header entirely — see the note at the top of this file.

          ── AND THE ROW IS SORTED BY WHAT THE CONTROLS ARE ──
          It held Back, the title, the clock and Finish — a navigation, a title,
          a tool and a commit, in that order, all at the same weight. Four
          different KINDS of thing reading as one undifferentiated strip of
          buttons is what made it look like a toolbar rather than a title.

          Now: minimise, the name, the elapsed READING, then the two decisions —
          overflow (where discard, delete and the two tools live) and Finish,
          which is the only primary on the screen and therefore the only filled
          control in the row. Nothing between the name and the commit that you
          press during a set. */}
      <div className="flex items-center gap-2">
        <BackLink onClick={onBack} label="Minimise — the draft keeps running" />
        <h1
          className="flex-1 min-w-0 font-heading font-bold text-fluid-xl leading-tight truncate tracking-[-0.01em]"
          style={{ color: accent }}
        >
          {title}
        </h1>
        {/* ── THE READING SITS WITH THE COMMIT ──
            How long you have been here is the one number in this header you
            glance at without deciding anything, and Finish is the decision it
            informs. It reads as a bare figure rather than a tile: the tinted
            box, the border and the "DURATION" caps label were 44px of chrome
            around four characters, on the row with the least width in the app.
            Still the same tap target, still opens the same sheet. */}
        <SessionElapsed
          startedAt={draft.startedAt}
          pausedMs={draft.pausedMs}
          pausedAt={draft.pausedAt}
          accent={accent}
          onOpen={onOpenDuration}
        />
        {/* ── AND THE TOOLS WENT IN HERE ──
            The clock and the muscle figure were two more 44px controls in a
            header that already held five things. Neither is used mid-set: you
            reach for a rest timer between exercises, and the body figure is a
            review artefact (~60 SVG paths, redrawn at 32px on every header
            paint) answering "where did this land". One level deeper, labelled,
            and the figure is not drawn at all until it is asked for. */}
        <SessionMenu
          isEdit={!!isEdit}
          deleting={deleting}
          tools={(
            <>
              <SessionClock variant="row" />
              <MuscleDistribution draft={draft} accent={accent} variant="row" />
            </>
          )}
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
      {/* ── AND THE LINE CARRIES ONLY CONTEXT NOW ──
          It used to be a two-column row: the date on the left, and on the right
          three ~44px controls whose height set the row's. With the tools moved
          into the menu the second column is gone, so this is one line of text
          about which session this is — week, phase, date, rung — and nothing
          you have to aim at except the date itself. */}
      <div className="relative mt-1 ml-9">
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
        {/* Which rung of the cut you are training under. Inline with the date
            rather than on a line of its own: it is one more fact about this
            session's context, and it was costing a whole row to say so. */}
        <span className="shrink-0 ml-1"><LeverTag compact /></span>
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

      {/* The live rail. Only what moves while you lift — duration, average HR
          and calories belong to the finish sheet, where you can answer them. */}
      <div className="grid grid-cols-3 gap-2 mt-2">
        {/* Volume wears the SESSION'S colour, not a fixed ember. Ember is the
            Chest family now, so a hardcoded ember rail said "chest day" on a leg
            day — and on an Upper A deck it said it twice. The tile that carries
            the session's headline number should be the session's colour. */}
        <Tile label="Volume" value={fmtVolume(volumeKg)} unit="kg" color={accent} />
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
 * Label ABOVE value, matching every other metric grid in the app.
 *
 * ── WHY IT IS LIT AND NOT FLAT ───────────────────────────────────────────────
 * It was one opaque slab, `rgba(13,18,32,0.55)` with a white hairline, for all
 * three metrics — the colour appeared only in nine pixels of uppercase label, so
 * the rail read as three grey boxes on the screen you look at most. It now takes
 * the same two-layer treatment as `WidgetFrame`: a corner-anchored radial plus a
 * directional wash in the metric's own colour, and a lit top edge. Same idea as
 * the dashboard, so the deck and the grid look like one app.
 *
 * Still no `backdrop-filter`: this sits under the collapsed bar's blur, and
 * stacking one translucent layer on another is the one thing the material rules
 * forbid.
 */
function Tile({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl px-2.5 py-2 min-w-0"
      style={{ backgroundColor: 'rgba(13,18,32,0.55)', border: `1px solid ${color}2e` }}>
      <span
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            `radial-gradient(120% 120% at 0% 0%, ${color}24 0%, ${color}0d 44%, transparent 76%),`
            + `linear-gradient(140deg, ${color}12 0%, ${color}06 55%, transparent 100%)`,
        }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${color}4d, transparent)` }}
      />
      <div className="relative text-[9px] font-bold uppercase tracking-[0.14em] truncate" style={{ color }}>{label}</div>
      <div className="relative helix-num font-bold text-fluid-lg tabular-nums leading-none mt-1 text-text whitespace-nowrap">
        {value}
        {unit && <span className="text-[10px] font-normal text-muted ml-0.5">{unit}</span>}
      </div>
    </div>
  )
}
