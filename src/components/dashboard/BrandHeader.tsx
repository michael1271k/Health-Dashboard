'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { PlanPhaseTags } from '@/components/PlanPhaseTags'
import { logicalTodayISO } from '@/lib/utils/day'

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
 * The way into today's Nexus, from the top of the dashboard.
 *
 * ── WHY IT IS A BUTTON AND NOT A `<Link>` ────────────────────────────────────
 * The href would be `/day/${logicalTodayISO()}`, and `logicalTodayISO()` reads
 * the DEVICE's wall clock. This page server-renders in UTC, so at 01:00 in
 * Asia/Jerusalem the server writes yesterday's date into the attribute and the
 * client rewrites it on hydration — a React mismatch warning on the first
 * element of the first screen, to save a prefetch we can ask for directly.
 * `router.prefetch` after mount buys the same warm chunk with none of that.
 *
 * ── AND WHY A CHEVRON RATHER THAN A BUTTON SHAPE ─────────────────────────────
 * `NavChevron` already settled this for the whole app: a direction is drawn as
 * a bare chevron, and only things you DO get a filled surface. This goes
 * somewhere — it is the same gesture as tapping a row — so it gets the row's
 * treatment, not a pill competing with the wordmark beside it.
 *
 * The negative margins are the 44pt target without the 44px band: `-my-2 py-2`
 * grows the hit area past the text on both sides while the element still
 * measures one line tall, so the header does not gain 20px of height to hold a
 * control that is 11px of type.
 */
function TodayLink() {
  const router = useRouter()

  // Warm the route once, after mount — the same idle-window trick the dashboard
  // uses for its sheet chunks, and the only reason not using `<Link>` costs
  // anything at all.
  useEffect(() => { router.prefetch(`/day/${logicalTodayISO()}`) }, [router])

  return (
    <button
      type="button"
      // Resolved AT THE TAP, never at render: the dashboard is left open
      // overnight on a phone that never reloads, and a date captured at mount
      // would quietly send a 00:05 tap to yesterday.
      onClick={() => router.push(`/day/${logicalTodayISO()}`)}
      className="group -my-2 py-2 -mr-1 pr-1 inline-flex items-baseline gap-0.5 shrink-0
                 text-[11px] font-semibold tracking-[0.02em] text-muted
                 transition-colors hover:text-text active:opacity-60"
    >
      Today
      {/* `self-center`, because a chevron aligned on a text baseline sits low —
          the glyph's optical centre is its middle, not its bottom. It nudges a
          hair to the right on press: the whole feedback an iOS row gives. */}
      <ChevronRight
        className="w-3.5 h-3.5 self-center -mr-0.5 transition-transform duration-200
                   group-active:translate-x-0.5"
        aria-hidden="true"
      />
    </button>
  )
}

/**
 * The dashboard's title: the wordmark, where you are in the plan, and the way
 * into today.
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
 * ── AND WHY "TODAY" LIVES BESIDE THE WORDMARK ────────────────────────────────
 * Every route into `/day/<today>` was until now the SIDE of some other gesture:
 * a double-tap on the Body tile, the Cardio tile's own opinion about where
 * cardio is logged, the Fatigue widget. All of them are discoverable only by
 * having already found them. The day page is the app's master record for a
 * single day and the dashboard is its summary, so the summary should say plainly
 * where the detail is — on the title row, which is the one band on this screen
 * that is about WHERE YOU ARE rather than what the numbers say.
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
      {/* Wordmark and shortcut travel together: when the chips wrap to a second
          line on a narrow phone, "Today" must stay on the title's line rather
          than being carried down with them. */}
      <div className="flex items-baseline gap-2.5 shrink-0">
        <h1 className="text-fluid-3xl leading-none shrink-0">
          <span className="helix-wordmark font-heading font-extrabold tracking-[0.22em] leading-none">HELIX</span>
        </h1>
        <TodayLink />
      </div>
      <PlanPhaseTags />
    </div>
  )
}
