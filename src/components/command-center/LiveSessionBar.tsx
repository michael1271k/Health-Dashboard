'use client'

import { memo } from 'react'
import { AppBar } from '@/components/nav/AppBar'
import { BackLink } from '@/components/nav/NavChevron'
import { MuscleDistribution } from './MuscleDistribution'
import { fmtVolume } from '@/lib/utils/units'
import { EMBER, GOLD, MUTED, STEEL } from '@/lib/theme/palette'
import type { SessionDraft } from '@/lib/sessions/draft'

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
 * ── IT IS THE SECOND HALF OF A TITLE, NOT THE WHOLE OF ONE ───────────────────
 * The identity, the date control and the metrics now open the document in
 * `LiveSessionHero`, at a size a title deserves. What is here is the compact
 * copy: it starts invisible and fades in only once the hero has scrolled off
 * (`titlePassed`, driven by an IntersectionObserver in `SessionDeck`). Above the
 * fold the bar is just the way out; below it, it names the session and carries
 * the three numbers that move while you lift.
 *
 * The muscle button does NOT fade. It is a control, not a label — the whole
 * reason it left the commit bar was that it could not be reached without
 * scrolling, and hiding it above the fold would reintroduce exactly that.
 *
 * ── WHY IT TAKES PRIMITIVES, NOT THE DRAFT (MOSTLY) ──────────────────────────
 * `SessionDeck` computes `draftTotals` once and hands down three numbers. Given
 * the draft, this bar would re-render on every keystroke in every set field —
 * exactly the cost `src/tests/deck-render.test*` exists to catch — and it would
 * pay it to redraw two figures that only move when a set is ticked.
 *
 * `MuscleDistribution` genuinely needs the draft (it walks every committed set),
 * so it takes it — and it is `memo`ised at the point that matters, because its
 * own `useMemo`s are keyed on the draft object. This bar re-rendering is the
 * cost of that; it is one 36px figure, and it is why the deck's row-render
 * assertion measures rows rather than bars.
 */
export const LiveSessionBar = memo(function LiveSessionBar({
  title, accent, volumeKg, sets, recordCount, titlePassed, draft, onBack,
}: {
  title: string
  /** Hex for the bar's top hairline — which workout this is. */
  accent?: string
  volumeKg: number
  sets: number
  /** Distinct axis-records claimed so far this session (live, from `prEngine`). */
  recordCount: number
  /** The hero has scrolled off, so the bar takes over as the title. */
  titlePassed: boolean
  /** For the muscle figure only — it walks the committed sets itself. */
  draft: SessionDraft
  onBack: () => void
}) {
  return (
    <AppBar accent={accent}>
      <BackLink onClick={onBack} label="Back — the draft autosaves" />

      <div
        className={`min-w-0 flex-1 transition-opacity duration-200 ${titlePassed ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden={!titlePassed}
      >
        <h1 className="font-heading font-bold text-fluid-sm text-text leading-tight truncate">{title}</h1>
      </div>

      {/* The live rail. Only what moves while you lift. */}
      <div
        className={`flex items-baseline gap-2.5 shrink-0 transition-opacity duration-200 ${titlePassed ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden={!titlePassed}
      >
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

      {/* Always visible — see the note above. */}
      <MuscleDistribution draft={draft} />
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
