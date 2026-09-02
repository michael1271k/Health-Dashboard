'use client'

import { memo } from 'react'
import { BackLink } from '@/components/nav/NavChevron'
import { SessionClock } from './SessionClockSheet'
import { SessionElapsed } from './SessionElapsed'
import { FinishButton } from './FinishButton'
import { fmtVolume } from '@/lib/utils/units'
import { cleanSessionTitle, type SessionDraft } from '@/lib/sessions/draft'
import { EMBER, GOLD, MUTED, STEEL } from '@/lib/theme/palette'

/**
 * The collapsed bar for a live session — the second half of one title.
 *
 * ── WHY IT IS FIXED, NOT STICKY ──────────────────────────────────────────────
 * It used to be a sticky `AppBar` sitting above the hero, which meant it
 * occupied a 44px box in the document at every scroll position. At the top of
 * the page its title and its numbers are invisible, so that box held a back
 * chevron and nothing else: a strip of chrome around empty space, on the screen
 * with the least room to spare. That was the "dead zone".
 *
 * Fixed takes it out of flow entirely. At rest it is translated off the top edge
 * and inert; once the hero scrolls away it slides down over the deck. A sticky
 * element could not do this — sticky reserves its box whether or not anything is
 * drawn in it, so making it appear mid-scroll would shove the deck down under
 * the user's thumb.
 *
 * ── AND WHY IT IS TWO LINES ──────────────────────────────────────────────────
 * It was one, with the title, a date, and three stat columns competing for
 * 360px — so the title got what was left, which was an ellipsis. Two lines give
 * the name a whole line to itself and put everything that changes while you lift
 * on the line below it. It also carries the workout's own gradient, so the
 * collapsed state is still recognisably THIS session rather than generic chrome.
 *
 * ── WHY IT TAKES PRIMITIVES, NOT THE DRAFT (MOSTLY) ──────────────────────────
 * `SessionDeck` computes `draftTotals` once and hands down three numbers. Given
 * the draft, this bar would re-render on every keystroke in every set field —
 * exactly the cost `src/tests/deck-render.test*` exists to catch — to redraw two
 * figures that only move when a set is ticked. It still takes the draft for the
 * title, which is one string read once.
 *
 * ── THE CLOCK REPLACED THE MUSCLE FIGURE HERE ────────────────────────────────
 * Both were carried up from the hero on the reasoning that a control worth
 * having at the top is worth having at every scroll position. That is true of
 * one of them. "Where is this session landing" is a question you ask when you
 * open the deck and when you are deciding to finish — both of which are the
 * hero, on screen, by definition. "How long have I been resting" is a question
 * you ask THIRTY TIMES, and every one of them happens mid-deck with the hero
 * scrolled away. So the bar carries the clock, the hero carries both, and
 * neither of them carries a control nobody reaches for at that scroll position.
 */
export const LiveSessionBar = memo(function LiveSessionBar({
  draft, accent, volumeKg, sets, recordCount, shown, onBack, onFinish, finishBusy, isEdit,
}: {
  draft: SessionDraft
  /** Hex — the workout's own colour. Hairline and gradient both. */
  accent: string
  volumeKg: number
  sets: number
  /** Distinct axis-records claimed so far this session (live, from `prEngine`). */
  recordCount: number
  /** The hero has scrolled off, so the bar takes over as the title. */
  shown: boolean
  onBack: () => void
  /** The hero's own pair of controls, carried here — see `FinishButton`. */
  onFinish: () => void
  finishBusy?: boolean
  isEdit?: boolean
}) {
  return (
    <header
      className={`app-chrome app-chrome--top fixed inset-x-0 top-0 z-30 safe-pt
                  transition-transform duration-200 ease-out
                  ${shown ? 'translate-y-0' : '-translate-y-full pointer-events-none'}`}
      aria-hidden={!shown}
      data-edge="on"
    >
      {/* The accent hairline along the top edge, and the workout's wash behind
          the whole bar. Same recipe as the hero, at half strength — this one
          sits over content rather than over the page. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{ background: `linear-gradient(180deg, ${accent}1f 0%, ${accent}0a 100%)` }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}b3, transparent)` }}
      />

      {/* ── AND WHY IT IS NO LONGER TINY ──
          Collapsed did not have to mean illegible. The title was `text-fluid-sm`
          (13–15px) and the three figures `text-[10px]` — smaller than any other
          text in the app, on the element that IS the title for most of the time
          you spend on this screen. Once the hero has gone this bar is the only
          thing naming the session and the only thing reporting its totals, so it
          is sized to be read at arm's length between sets: the name at
          `text-fluid-base`, the numbers at 12px, and the same Focus/Finish pair
          the hero carries. It costs about 8px of height. */}
      {/* ── TWO FULL-WIDTH ROWS, NOT ONE ROW WITH A COLUMN IN IT ──
          This was `[chevron] [title + stats] [clock] [Finish]` on a single
          flex line, and it broke in the one way a flex line breaks: the stats
          were `whitespace-nowrap` spans inside a `min-w-0` column with no
          `overflow` of its own, so once the tonnage gained a digit the line
          overflowed its own box and painted UNDER the two controls to its
          right. That is what "the rest timer is rendering on top of the
          stopwatch" was — the elapsed reading, pushed out of its column, landing
          on the clock button. And because `SessionElapsed` was `ml-auto` inside
          that column while `SessionClock` and `FinishButton` sat immediately
          after it, the stopwatch and the commit had no gap between them even
          when nothing overflowed.

          Splitting it into two rows removes the failure mode rather than
          budgeting around it. Nothing on row one can push anything on row two,
          the three readings get a line they cannot outgrow, and the two clocks
          and Finish get one with real space in it. It costs about 10px of
          height, which is what "give it breathing room" is spelled in.

          ── AND THE TITLE IS STILL FIRST ──
          The bar IS the title once the hero has gone, so the name keeps the top
          line with only the chevron beside it — the same arrangement the hero
          uses, at bar scale. */}
      <div className="mx-auto w-full max-w-[80rem] px-2 sm:px-4 py-2 flex flex-col gap-1.5">
        {/* Row 1 — who, and how it is going. */}
        <div className="flex items-center gap-2.5 min-w-0">
          <BackLink onClick={onBack} label="Back — the draft autosaves" />
          <h1 className="min-w-0 flex-1 font-heading font-bold text-fluid-base leading-tight truncate"
            style={{ color: accent }}>
            {cleanSessionTitle(draft)}
          </h1>
          {/* ── THE FIGURES ARE PILLS ──
              Three bare coloured numbers under the title read as a subtitle that
              had been syntax-highlighted: no separation from the name, none from
              each other, and nothing to say they are readings rather than prose.
              Each gets its own tinted chip — the treatment the hero's tiles
              already use, at bar scale.

              `shrink-0` on the group and `min-w-0 truncate` on the title: when
              the line runs out it is the NAME that gives way, because the bar is
              also carrying a compact copy of it and the numbers have nowhere
              else on screen to be. */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Stat value={fmtVolume(volumeKg)} unit="kg" color={EMBER} />
            <Stat value={String(sets)} unit={sets === 1 ? 'set' : 'sets'} color={STEEL} />
            <Stat
              value={recordCount > 0 ? String(recordCount) : '—'}
              unit={recordCount === 1 ? 'PR' : 'PRs'}
              // Gold, and only when there is something to be gold about. A
              // permanent gold zero is how gold stops meaning a record.
              color={recordCount > 0 ? GOLD : MUTED}
            />
          </div>
        </div>

        {/* Row 2 — the two clocks, and the way out.

            The session clock is a READING (`SessionElapsed`, no box, no tap
            target beyond the Duration sheet) and the rest clock is a CONTROL
            (`SessionClock`, a 38px button). They sit together on the left
            because they are the two time facts, in the order you ask them —
            how long have I been here, how long until the next set — and Finish
            takes the far right with the whole rest of the line between them, so
            the control that ENDS the session is never a thumb-width from the
            control that starts a rest. */}
        <div className="flex items-center gap-2 pl-9">
          <SessionElapsed
            startedAt={draft.startedAt}
            pausedMs={draft.pausedMs}
            pausedAt={draft.pausedAt}
            accent={accent}
            size="inline"
          />
          <SessionClock size="sm" />
          <span className="ml-auto shrink-0">
            <FinishButton onClick={onFinish} busy={finishBusy} disabled={sets === 0} isEdit={isEdit} size="sm" />
          </span>
        </div>
      </div>
    </header>
  )
})

function Stat({ value, unit, color }: { value: string; unit: string; color: string }) {
  return (
    <span
      className="helix-num font-bold tabular-nums whitespace-nowrap rounded-md px-1.5 py-1"
      style={{
        color,
        // The same recipe as every other tinted chip in the app (`1f` fill,
        // `40` hairline), plus a 1px top highlight so the pill catches light
        // from the same direction the deck's other raised controls do.
        background: `${color}1f`,
        border: `1px solid ${color}40`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
      }}
    >
      {value}<span className="font-normal opacity-70 ml-0.5">{unit}</span>
    </span>
  )
}
