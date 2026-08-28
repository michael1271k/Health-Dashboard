'use client'

import { PlanPhaseTags } from '@/components/PlanPhaseTags'

/*
 * `programDay()` lived here and is GONE.
 *
 * It counted calendar days since the cut began (2026-07-15) and never went
 * down. Renamed once already — it was `programStreak`, rendered as "Day Streak"
 * — and even under the honest label "Program Day" it sat under a flame beside a
 * widget showing the real streak, twenty-two against thirty-two. Two numbers,
 * one glyph, and no way for anyone glancing at a phone to know which question
 * either was answering.
 *
 * One number now: `streakFrom` in lib/training/streak.ts, read by the app
 * through `useStreak()` and by the widget through the payload route. If a
 * "days since the cut started" figure is ever wanted again it is a phase fact,
 * belongs beside the phase chip, and must not take the flame with it.
 */

/**
 * The dashboard's title: the wordmark, and where you are in the plan.
 *
 * ── WHAT CAME BACK, AND WHAT DID NOT ─────────────────────────────────────────
 * This header was deleted wholesale in `3a42351` and the component left
 * orphaned. Two of the things it carried are genuinely wanted at the top of the
 * screen — the HELIX wordmark and the plan/phase tags — so those return.
 *
 * Three do not, and they are the three that commit was right about:
 *
 *   · a live clock, six pixels below the one in the status bar
 *   · a "Good evening, Michael" greeting, on a single-user app
 *   · an "Updated HH:MM" stamp, which needed its own query to say a thing that
 *     changes nothing about what you would do next
 *
 * Between them they cost a `useMyProfile` query, a `useLastUpdated` query and a
 * 1 Hz interval, at the top of a screen whose entire job is the widget grid
 * directly beneath. What is left is static, queryless, and one line tall:
 * `PlanPhaseTags` does its own data fetching and already renders in the
 * Pathfinder header, so this adds no request the app was not already making.
 *
 * The band is deliberately NOT a `<header>` landmark. The dashboard's heading
 * is this h1; a landmark wrapping one heading and one chip row adds a stop for
 * a screen reader without adding a region worth navigating to.
 */
export function BrandHeader() {
  return (
    /* `items-baseline`, so the chips hang off the wordmark's baseline rather
       than centring against a 3xl cap height and floating high. */
    <div className="flex items-baseline justify-between gap-3 flex-wrap">
      <h1 className="text-fluid-3xl leading-none shrink-0">
        <span className="helix-wordmark font-heading font-extrabold tracking-[0.22em] leading-none">HELIX</span>
      </h1>
      <PlanPhaseTags />
    </div>
  )
}
