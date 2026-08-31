'use client'

import { memo } from 'react'

import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { ReadinessOrb } from '@/components/dashboard/ReadinessOrb'
import { StatTile } from './parts'
import { WIDGET_META, heightTier, type WidgetSize } from '@/lib/dashboard/layout'
import { formatSleep } from '@/lib/utils/format'
import { EMBER, AMETHYST, OXIDE, SAPPHIRE, STEEL } from '@/lib/theme/palette'
import type { Tables } from '@/lib/supabase/types'

/**
 * Readiness, as a tile.
 *
 * ── WHY IT IS A WIDGET NOW ───────────────────────────────────────────────────
 * This was the dashboard's fixed hero: a 300px band above the grid holding the
 * orb and, beside it on desktop, four driver readings. It was fixed on the
 * argument that it is the one question the dashboard exists to answer and
 * therefore should not be arrangeable — which is a good argument for putting it
 * FIRST and a bad one for putting it outside the system everything else lives
 * in. It meant the one tile you might genuinely want at a different size on a
 * different day was the only one that could not be resized, moved, or stacked.
 *
 * So the band is gone and the grid runs edge to edge. Readiness is the first
 * entry in the catalogue and the only one that opens at large, which is the part
 * of "hero" worth keeping: it leads, and it is big, and now it does so because
 * of a default anyone can change rather than because of a hard-coded band.
 *
 * ── THE DRIVERS COME WITH IT ─────────────────────────────────────────────────
 * The old panel — sleep, resting heart rate, HRV, energy left — rendered only at
 * `md` and above, so on the phone this app is actually used on, the four numbers
 * BEHIND the score did not exist. They are the large face here, which means they
 * are reachable on a 390px screen for the first time.
 *
 * ── AND THE ORB IS THE ORB ───────────────────────────────────────────────────
 * `ReadinessOrb` is reused rather than reimplemented at tile scale. It draws a
 * breathing pulse and an ECG trace keyed to the score, and a second smaller
 * rendering of the same idea is how one number ends up with two personalities.
 * It is given a definite height to letterbox into — the same reason the muscle
 * atlas takes one (see `bodyHeightPx`).
 */
function RecoveryWidgetImpl({ size, onOpen, score, isLoading, sleepMin, restingHr, hrvMs }: {
  size: WidgetSize
  onOpen?: () => void
  score: Tables<'daily_scores'> | null
  isLoading?: boolean
  sleepMin: number | null
  restingHr: number | null
  hrvMs: number | null
}) {
  // The vertical room this size stands for — see `heightTier`. `w` is a
  // medium's height and `xl` is a large's; what makes them different is WIDTH,
  // and width is answered by the container queries below.
  const tier = heightTier(size)
  const value = score?.score ?? null

  return (
    <WidgetFrame {...WIDGET_META.recovery} size={size} onOpen={onOpen}>
      {value == null && !isLoading ? (
        <WidgetEmpty
          accent={EMBER}
          size={size}
          message="Today has not been scored yet"
          hint="It lands once your Watch reports the night"
        />
      ) : (
        /* ── AT WIDTH, THE DRIVERS MOVE BESIDE THE ORB ────────────────────
           This is the panel the deleted 300px hero used to carry, and it never
           worked as a row under the orb on a wide tile: four stat tiles across
           1,200px are four numbers with a hand's width of nothing between them,
           and the orb above them is a circle in a landscape box.

           Beside it, the orb keeps the tile's full height — which is what it is
           for, a shape read at a glance — and the drivers become a column of
           four rows that the eye reads down. Same four readings, the shape a
           wide tile actually has room for. */
        <span className="flex-1 min-h-0 flex flex-col gap-1.5 @[560px]:flex-row @[560px]:items-stretch @[560px]:gap-4">
          {/* The orb takes the slack at every size; the drivers below it are
              fixed-height, so growing the tile grows the shape rather than
              opening a band of nothing under it. */}
          <span className="flex-1 min-h-0 flex items-center justify-center overflow-hidden @[560px]:flex-[0_0_46%]">
            <ReadinessOrb score={score} isLoading={isLoading} />
          </span>

          {/* ── LARGE ADDS THE WHY, AND SO DOES WIDTH ──
              Four readings, the same four the desktop-only panel carried. Not at
              a narrow medium: at 358×172 the orb already fills the body, and a
              row of stat tiles under it would squeeze the shape rather than add
              to it. A WIDE medium has the room beside the orb, so the container
              query lets it in where the height alone would not. */}
          <span className={`shrink-0 grid grid-cols-4 gap-1.5
                            @[560px]:flex @[560px]:flex-1 @[560px]:flex-col @[560px]:justify-center @[560px]:gap-2
                            ${tier === 'l' ? 'grid' : 'hidden @[560px]:flex'}`}>
            <StatTile label="Sleep" value={sleepMin != null ? formatSleep(sleepMin) : null} color={AMETHYST} />
            <StatTile label="Rest HR" value={restingHr} unit="bpm" color={OXIDE} />
            <StatTile label="HRV" value={hrvMs != null ? Math.round(hrvMs) : null} unit="ms" color={SAPPHIRE} />
            <StatTile label="Energy" value={score?.battery_pct ?? null} unit="%" color={STEEL} />
          </span>
        </span>
      )}
    </WidgetFrame>
  )
}

/*
 * ── EVERY WIDGET BODY IS MEMOIZED ────────────────────────────────────────────
 * The dashboard's render prop (`renderWidget` in `app/page.tsx`) is rebuilt
 * whenever any of the page's ~20 data hooks resolves, which walks the grid and
 * calls this file's components again. Before these wrappers, that meant every
 * tile re-ran its layout maths and its charts on every unrelated data change —
 * and the comment on the dashboard claiming the widgets were "memoised where it
 * pays" described something that did not exist anywhere in this directory.
 *
 * Shallow comparison is the whole contract, so it only holds while callers pass
 * stable props: see the hoisted constants and `useMemo`s in `app/page.tsx`,
 * which exist for this reason. A fresh `.map()` or object literal at the call
 * site silently turns these back into plain components.
 */
export const RecoveryWidget = memo(RecoveryWidgetImpl)
