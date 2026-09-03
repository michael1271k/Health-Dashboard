'use client'

import { useMemo, useState } from 'react'
import { MuscleAtlas } from '@/components/body/MuscleAtlas'
import { MuscleDistributionSheet } from './MuscleDistributionSheet'
import { setsToWorked } from '@/lib/body/atlas'
import { landmarkColor } from '@/lib/theme/muscleHue'
import { LANDMARK_MUSCLES } from '@/lib/training/landmarks'
import type { SessionDraft } from '@/lib/sessions/draft'
import { draftMuscleSets, draftPhysicalSets } from '@/lib/sessions/muscleDistribution'
import { Activity } from 'lucide-react'
import { SheetMenuRow } from './SheetMenuRow'

/**
 * Where the session you are logging is actually going.
 *
 * ── WHY IT IS A THUMBNAIL AND NOT A PANEL ────────────────────────────────────
 * The deck is a data-entry surface and every pixel it spends on analysis is a
 * pixel not spent on the set you are about to log. A 24px figure beside the set
 * count is enough to notice that the whole session is landing on one side of
 * the body; the sheet behind it is where you look when you have noticed.
 *
 * ── AND WHY IT IS NOT DRAWN PER EXERCISE ─────────────────────────────────────
 * The plan asked for an atlas inside every exercise card. Twenty-four inline
 * SVG bodies on one screen is both a rendering cost on the surface whose
 * keystroke latency was measured and fixed twice, and a worse answer: a single
 * exercise's muscles are already named on its own card, and the question
 * "am I balanced" is only meaningful across the whole session.
 */

// The two counters live in `lib/sessions/muscleDistribution.ts` now (pure, vectored,
// ported); re-exported so existing importers keep their path.
export { draftMuscleSets, draftPhysicalSets }

/**
 * ── ONE BODY, ONE COLOUR LANGUAGE ───────────────────────────────────────────
 * Every atlas that shows WHICH MUSCLES WERE TRAINED now paints each muscle in
 * its own group's hue — Chest ember, Back emerald, Shoulders amethyst, Arms
 * copper, Legs sapphire, Core steel — with each landmark a step on its family's
 * ramp and opacity carrying the set count. Three channels: hue says the group,
 * the ramp step says which muscle, alpha says how much work.
 *
 * This replaces a single day-accent tint. The accent still identifies the
 * WORKOUT everywhere else on these screens — the title, the rule, the buttons —
 * but on the body it was answering the wrong question: it said which session
 * you were in, which you already knew, and said nothing about where the work
 * landed. The soreness map is deliberately NOT converted: its colour encodes
 * severity, not identity.
 */
export function MuscleDistribution({ draft, accent, size = 'sm', variant = 'button' }: {
  draft: SessionDraft | null
  /**
   * The workout's own colour — `dayColor(dayKey, splitDay)`.
   *
   * It no longer tints the FIGURE (the body speaks group hues now); it is
   * forwarded to the sheet, whose chrome still belongs to the session. Kept as
   * a prop rather than dropped because the sheet needs it and this is the
   * component that knows it.
   */
  accent?: string
  /** `lg` is the hero's 44px target; `sm` the 36px one in the collapsed bar. */
  size?: 'sm' | 'lg'
  /**
   * `button` is the icon control; `row` is a labelled row inside the session
   * menu.
   *
   * The figure left the header for a cost reason as much as a layout one: it is
   * ~60 `<path>` elements plus gradient defs, re-rendered on every header paint
   * at 32 CSS px, to answer a question you ask between exercises rather than
   * between reps. In `row` form nothing is drawn until the sheet is opened.
   */
  variant?: 'button' | 'row'
}) {
  const [open, setOpen] = useState(false)
  const sets = useMemo(() => draftMuscleSets(draft), [draft])
  const worked = useMemo(() => setsToWorked(sets), [sets])
  const physical = useMemo(() => draftPhysicalSets(draft), [draft])
  const entries = LANDMARK_MUSCLES
    .map((m) => ({ muscle: m, sets: Math.round((sets[m] ?? 0) * 10) / 10 }))
    .filter((e) => e.sets > 0)
  const weighted = Math.round(entries.reduce((n, e) => n + e.sets, 0) * 10) / 10

  /**
   * ── IT RENDERS EVEN WITH NOTHING TO SHOW ────────────────────────────────────
   * It used to `return null` until the first set was ticked. That was fine when
   * it lived in the commit bar and nothing was above it; in the header it means
   * a control materialising mid-session and shifting the title, the date and
   * three figures sideways at the exact moment you are reaching for a tick.
   *
   * So it is always drawn, and dimmed and disabled until there is an answer —
   * which also tells you the answer is coming, rather than that the feature does
   * not exist.
   */
  const empty = !entries.length
  const box = size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'
  const fig = size === 'lg' ? 'h-8 w-8' : 'h-6 w-6'

  if (variant === 'row') {
    return (
      <>
        <SheetMenuRow
          icon={<Activity className="w-4 h-4" aria-hidden="true" />}
          label="Muscle focus"
          hint={empty
            ? 'Tick a set to see where this session is landing'
            : `Where this session is landing · ${physical} set${physical === 1 ? '' : 's'}`}
          accent={accent}
          disabled={empty}
          onClick={() => setOpen(true)}
        />
        <MuscleDistributionSheet
          open={open} onClose={() => setOpen(false)}
          entries={entries} physical={physical} weighted={weighted} accent={accent}
          layer="stacked"
        />
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={empty}
        aria-label="Muscle distribution for this session"
        title={empty ? 'Tick a set to see where this session is landing' : 'Where this session is landing'}
        className={`shrink-0 ${box} rounded-xl flex items-center justify-center transition-transform
                    ${empty ? 'opacity-40' : 'active:scale-95'}`}
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Group-tinted, not accent-tinted — see the note above the component. */}
        <span className={`${fig} block`}><MuscleAtlas view="front" worked={worked} colorFor={landmarkColor} /></span>
      </button>

      {/* The enlarged view is shared with the session report — see
          `MuscleDistributionSheet`. It used to be written inline here, which is
          why the report's body chart could not open it: this component takes a
          live draft, and a finished session has none. */}
      <MuscleDistributionSheet
        open={open}
        onClose={() => setOpen(false)}
        entries={entries}
        physical={physical}
        weighted={weighted}
        accent={accent}
      />
    </>
  )
}
