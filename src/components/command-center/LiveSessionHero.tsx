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

/** The phase/week chip's hue. Steel — the deck's own neutral; the phase's real
 *  colour lives on the dashboard, and a second saturated chip beside the
 *  session's accent title would be a third colour competing in one header. */
const PHASE_CHIP = STEEL

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
    <div data-live-hero className="relative -mx-3 sm:-mx-5 px-3 sm:px-5 safe-pt pt-3 pb-2">
      {/* The wash, not a band. A solid block of the day's colour would compete
          with the three figures directly beneath it; a gradient that has fully
          dissolved by the time it reaches the first exercise card colours the
          top of the screen without claiming any of it. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{ background: `linear-gradient(180deg, ${accent}26 0%, ${accent}0a 45%, transparent 100%)` }}
      />

      {/* ── ONE CONTROL BESIDE THE TITLE, AND IT IS THE COMMIT ──────────────
          The row held five things: minimise, the name, the elapsed reading, the
          overflow menu and Finish. The name was the only flexible one, so on a
          390px screen it took whatever the other four left — about 178px against
          roughly 180px of controls — and "Legs & Core A", a real workout name,
          rendered as "Legs & C…" before a single set was logged. Shrinking the
          type was tried (`2xl` → `xl`) and bought one word.

          The fix is not narrower type, it is FEWER NEIGHBOURS. The title's row
          now carries the chevron and Finish and nothing else, and the two things
          that left are the two that were never decisions:

            · the elapsed figure is a READING — its own component says so — and
              it belongs on the line with the other readings;
            · the ⋯ menu holds discard, delete and the between-sets tools, none
              of which is touched mid-set.

          Both move down one line, where there is width to spare, and the title
          gets the whole row minus a 32px chevron and the Finish button.

          ── AND IT MAY TAKE TWO LINES ────────────────────────────────────────
          `line-clamp-2`, not `truncate`. An ellipsis on this element destroys
          the one fact on the screen that cannot be recovered from anything else
          on it, and the header scrolls away within seconds of the first set —
          `LiveSessionBar` takes over from there. A second line costs about 24px
          for a few seconds; an elided name costs the name. `text-balance` keeps
          a two-line title from breaking after one word. */}
      {/* ── THE TITLE SITS IN A TWO-LINE BOX, WHETHER OR NOT IT USES BOTH ────
          `items-start` on a row whose tallest child is a 44px button pinned the
          name to the very top of the header, a couple of pixels under the status
          bar, with all of the block's air pooled underneath it — so a one-line
          title (which is most of them: "Delts & Arms", "Upper A") read as
          something that had been pushed up out of the way rather than as the
          subject of the screen.

          The row reserves the height of TWO lines and centres in it. A long name
          still wraps to two and fills the box exactly as before; a short one is
          optically centred in the same space, so the header does not change
          height between workouts and the title has the room its size implies.

          The reservation is on the title's own wrapper, NOT on the row: the
          chevron and Finish centre against it rather than being stretched by it,
          and — the part that matters — the context line below is a SIBLING of
          this row, so nothing here can push it, crowd it or wrap it. The phase,
          the maintenance chip and the date keep exactly the line they had.

          `line-clamp-2`, not `truncate`. An ellipsis destroys the one fact on
          this screen that cannot be recovered from anything else on it, and the
          header scrolls away within seconds of the first set — `LiveSessionBar`
          takes over from there. `text-balance` keeps a two-line title from
          breaking after one word. */}
      <div className="flex items-center gap-2">
        <BackLink onClick={onBack} label="Minimise — the draft keeps running" />
        <div className="flex-1 min-w-0 flex items-center min-h-[3.4rem]">
          <h1
            className="w-full font-heading font-bold text-fluid-xl leading-tight tracking-[-0.01em]
                       [text-wrap:balance] line-clamp-2"
            style={{ color: accent }}
            title={title}
          >
            {title}
          </h1>
        </div>
        <FinishButton onClick={onFinish} busy={finishBusy} disabled={sets === 0} isEdit={isEdit} />
      </div>

      {/* ── THE CONTEXT LINE, AND EVERYTHING IT ABSORBED ────────────────────
          Was: the date, alone, with the rung chip trailing it inside the same
          sentence. Now it is the header's whole second tier — where you are
          (date, week, phase, rung), how long you have been here, and the way
          into everything you are not doing right now.

          ── THE PHASE IS A CHIP, NOT A WORD IN A SENTENCE ────────────────────
          It read `Week 7 · Cut · Sun 31 Aug` — a phase set as prose between two
          other facts, in a colour, with no boundary of its own, so the eye had
          to parse a sentence to find a category. And a maintenance week said
          nothing at all beyond the rung chip trailing the line, which is the
          single most consequential fact about the week (volume, steps and
          calories all moved) arriving as its last word.

          Phase and week are chips now, in the phase's own colour, with the week
          behind a hairline — the treatment `PlanPhaseTags` uses everywhere else
          in the app, at deck scale.

          ── AND THEY COME FROM THE DRAFT, NOT FROM TODAY ─────────────────────
          `PlanPhaseTags` itself is deliberately NOT reused here, close as it
          looks. It resolves against `useLogicalDate()` — the wall clock — which
          is right on a dashboard and wrong on this screen, because this screen
          back-dates: `onSetDate` exists, and opening a finished Tuesday to edit
          it would show Friday's phase and Friday's week over Tuesday's sets.
          The draft carries `week` and `phase` for exactly this reason, so the
          header states the SESSION's block rather than the calendar's.

          `LeverTag` is the one exception and is genuinely today's — a rung is a
          nutrition fact about the day you are eating, not about the sets.

          The date keeps its own button because it is the only CONTROL on this
          line: tapping it opens the picker that back-dates the session. */}
      <div className="relative mt-1.5 ml-9 flex items-center gap-x-2 gap-y-1 flex-wrap">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="flex items-center gap-1 text-fluid-xs text-muted leading-tight active:opacity-70
                     transition-opacity min-w-0 shrink"
          aria-label={`Session date: ${dateLabel}. Tap to change`}
          aria-expanded={pickerOpen}
        >
          <CalendarDays className="w-3 h-3 text-primary shrink-0" aria-hidden="true" />
          <span className="truncate">{dateLabel}</span>
        </button>

        {(draft.phase || draft.week != null) && (
          <span
            className="shrink-0 inline-flex items-center gap-1.5 px-1.5 py-px rounded-md
                       text-[10px] font-bold uppercase tracking-wide"
            style={{ color: PHASE_CHIP, background: `${PHASE_CHIP}1a`, border: `1px solid ${PHASE_CHIP}55` }}
          >
            {draft.phase && <span>{draft.phase === 'CUT' ? 'Cut' : draft.phase}</span>}
            {draft.phase && draft.week != null && (
              <span className="w-px h-2.5 opacity-40" style={{ background: 'currentColor' }} aria-hidden="true" />
            )}
            {draft.week != null && <span className="helix-num tabular-nums">Wk {draft.week}</span>}
          </span>
        )}
        {/* The rung, and on a deload week the leaf chip that names it. */}
        <LeverTag compact />

        {/* The readings, hard right. Elapsed is still a tap target — it opens
            the Duration sheet, which is where the start time and the pause
            live — it simply is not competing with the title any more. */}
        <span className="ml-auto flex items-center gap-1 shrink-0">
          <SessionElapsed
            startedAt={draft.startedAt}
            pausedMs={draft.pausedMs}
            pausedAt={draft.pausedAt}
            accent={accent}
            size="sm"
            onOpen={onOpenDuration}
          />
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
        </span>

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
