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
      <div className="mx-auto w-full max-w-[80rem] px-2 sm:px-4 py-2.5 flex items-center gap-2.5">
        <BackLink onClick={onBack} label="Back — the draft autosaves" />

        <div className="min-w-0 flex-1">
          {/* Line one: the name, and only the name. */}
          <h1 className="font-heading font-bold text-fluid-base leading-tight truncate" style={{ color: accent }}>
            {cleanSessionTitle(draft)}
          </h1>
          {/* Line two: everything that moves while you lift. Inline rather than
              in columns — at this size three stacked label/value pairs is six
              lines of type in a 34px strip.

              ── AND THE INTERPUNCTS ARE GONE ──
              At 360px the worst realistic line — a five-figure tonnage, a
              two-digit set count and a PR count — needed 191px in a 168px box,
              so `truncate` ate the end of it: the PR count, which is the one
              figure on this line you would stop lifting to look at.

              Two dots and their four flanking gaps were 24px of that. Each
              Stat already ends in its own unit ("kg", "sets", "PRs"), which is
              a stronger boundary than a 4px glyph — the separator was
              decorating a distinction the type already made. What is left fits,
              with room for a six-figure tonnage. */}
          {/* ── THE FIGURES ARE PILLS NOW ──
              Three bare coloured numbers 2px under the title read as a subtitle
              that had been syntax-highlighted: no separation from the name
              above them, none from each other, and nothing to say they are
              readings rather than prose. Each one gets its own tinted chip —
              the treatment the hero's tiles already use, at bar scale — so the
              line reads as three measurements, and the row gets the breathing
              space the compression took away. */}
          {/* ── AND THE PILLS NEEDED AIR ──
              `gap-1.5` (6px) put three tinted chips a hairline apart, which at
              a glance reads as one segmented control rather than as three
              independent readings — the tonnage and the set count looked like
              two halves of the same figure. 10px is the smallest gap at which
              each chip is unambiguously its own object, and it still fits the
              worst realistic line (a six-figure tonnage, a two-digit set count
              and a PR count) inside 360px because the interpuncts that used to
              sit between them are long gone. */}
          <p className="flex items-center gap-2.5 mt-1 text-[12px] leading-none text-muted">
            <Stat value={fmtVolume(volumeKg)} unit="kg" color={EMBER} />
            <Stat value={String(sets)} unit={sets === 1 ? 'set' : 'sets'} color={STEEL} />
            <Stat
              value={recordCount > 0 ? String(recordCount) : '—'}
              unit={recordCount === 1 ? 'PR' : 'PRs'}
              // Gold, and only when there is something to be gold about. A
              // permanent gold zero is how gold stops meaning a record.
              color={recordCount > 0 ? GOLD : MUTED}
            />
            {/* ── AND THE CLOCK CLOSES THE LINE ──
                The hero states how long you have been in the session and the
                bar did not, so the one figure that moves on its own vanished at
                exactly the scroll position you spend the workout at — the
                reading you glance at between sets, gone the moment the hero
                went. It is a READING, not a control: same line as the other
                three, no box, no tap target, hard right so the three totals
                keep their left-to-right order and the thing that ticks is the
                last thing on the line.

                `SessionElapsed` and not a fourth `Stat`, because it owns the
                one behaviour that matters here — it subtracts paused time and
                swaps the hourglass for a pause glyph, so the bar and the
                Duration sheet cannot disagree about whether the clock is
                running. It also holds its own 1 Hz tick behind `memo`, which is
                why putting it here does not re-render the bar every second. */}
            <span className="ml-auto shrink-0">
              <SessionElapsed
                startedAt={draft.startedAt}
                pausedMs={draft.pausedMs}
                pausedAt={draft.pausedAt}
                accent={accent}
                size="inline"
              />
            </span>
          </p>
        </div>

        <SessionClock size="sm" />
        <FinishButton onClick={onFinish} busy={finishBusy} disabled={sets === 0} isEdit={isEdit} size="sm" />
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
