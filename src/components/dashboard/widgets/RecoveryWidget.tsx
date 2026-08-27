'use client'

import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { ReadinessOrb } from '@/components/dashboard/ReadinessOrb'
import { StatTile } from './parts'
import { WIDGET_META, type WidgetSize } from '@/lib/dashboard/layout'
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
export function RecoveryWidget({ size, onOpen, score, isLoading, sleepMin, restingHr, hrvMs }: {
  size: WidgetSize
  onOpen?: () => void
  score: Tables<'daily_scores'> | null
  isLoading?: boolean
  sleepMin: number | null
  restingHr: number | null
  hrvMs: number | null
}) {
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
        <span className="flex-1 min-h-0 flex flex-col gap-1.5">
          {/* The orb takes the slack at every size; the drivers below it are
              fixed-height, so growing the tile grows the shape rather than
              opening a band of nothing under it. */}
          <span className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
            <ReadinessOrb score={score} isLoading={isLoading} />
          </span>

          {/* ── LARGE ADDS THE WHY ──
              Four readings, the same four the desktop-only panel carried. Not
              at medium: at 358×172 the orb already fills the body, and a row of
              stat tiles under it would squeeze the shape rather than add to it. */}
          {size === 'l' && (
            <span className="grid grid-cols-4 gap-1.5 shrink-0">
              <StatTile label="Sleep" value={sleepMin != null ? formatSleep(sleepMin) : null} color={AMETHYST} />
              <StatTile label="Rest HR" value={restingHr} unit="bpm" color={OXIDE} />
              <StatTile label="HRV" value={hrvMs != null ? Math.round(hrvMs) : null} unit="ms" color={SAPPHIRE} />
              <StatTile label="Energy" value={score?.battery_pct ?? null} unit="%" color={STEEL} />
            </span>
          )}
        </span>
      )}
    </WidgetFrame>
  )
}
