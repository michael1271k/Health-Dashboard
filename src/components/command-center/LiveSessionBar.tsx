'use client'

import { memo } from 'react'
import { BackLink } from '@/components/nav/NavChevron'
import { MuscleDistribution } from './MuscleDistribution'
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
 * figures that only move when a set is ticked. `MuscleDistribution` genuinely
 * needs the draft (it walks every committed set), so it takes it.
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
      <div className="mx-auto w-full max-w-[80rem] px-2 sm:px-4 py-2 flex items-center gap-2">
        <BackLink onClick={onBack} label="Back — the draft autosaves" />

        <div className="min-w-0 flex-1">
          {/* Line one: the name, and only the name. */}
          <h1 className="font-heading font-bold text-fluid-base leading-tight truncate" style={{ color: accent }}>
            {cleanSessionTitle(draft)}
          </h1>
          {/* Line two: everything that moves while you lift. Inline rather than
              in columns — at this size three stacked label/value pairs is six
              lines of type in a 34px strip. */}
          <p className="flex items-center gap-2 text-[12px] leading-tight text-muted truncate">
            <Stat value={fmtVolume(volumeKg)} unit="kg" color={EMBER} />
            <Dot />
            <Stat value={String(sets)} unit={sets === 1 ? 'set' : 'sets'} color={STEEL} />
            <Dot />
            <Stat
              value={recordCount > 0 ? String(recordCount) : '—'}
              unit={recordCount === 1 ? 'PR' : 'PRs'}
              // Gold, and only when there is something to be gold about. A
              // permanent gold zero is how gold stops meaning a record.
              color={recordCount > 0 ? GOLD : MUTED}
            />
          </p>
        </div>

        <MuscleDistribution draft={draft} accent={accent} />
        <FinishButton onClick={onFinish} busy={finishBusy} disabled={sets === 0} isEdit={isEdit} size="sm" />
      </div>
    </header>
  )
})

function Stat({ value, unit, color }: { value: string; unit: string; color: string }) {
  return (
    <span className="helix-num font-bold tabular-nums whitespace-nowrap" style={{ color }}>
      {value}<span className="font-normal opacity-70 ml-0.5">{unit}</span>
    </span>
  )
}

function Dot() {
  return <span className="opacity-30" aria-hidden="true">·</span>
}
