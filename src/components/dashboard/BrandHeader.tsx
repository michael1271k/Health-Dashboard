'use client'

import { memo, useEffect, useState } from 'react'
import { PlanPhaseTags } from '@/components/PlanPhaseTags'
import { useLastUpdated } from '@/lib/hooks/useDashboard'
import { useMyProfile } from '@/lib/hooks/useMyProfile'

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
 * Ticking clock (client-only to avoid hydration mismatch).
 *
 * Pauses while the tab is hidden — a backgrounded PWA has no reason to keep
 * scheduling work, and it resyncs immediately on return.
 */
function useClock(intervalMs: number) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null
    const stop = () => { if (id) { clearInterval(id); id = null } }
    const start = () => {
      stop()
      setNow(new Date())
      id = setInterval(() => setNow(new Date()), intervalMs)
    }
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop())
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [intervalMs])
  return now
}

/**
 * The seconds hand, isolated.
 *
 * This used to live in `BrandHeader`, which meant the whole header — profile
 * query, plan/phase tags, greeting, brand line — re-rendered once per second
 * for as long as the dashboard was open. Only this span changes that often, so
 * only this span subscribes to a 1Hz tick.
 */
const LiveTime = memo(function LiveTime() {
  const now = useClock(1000)
  if (!now) return null
  return (
    <> · <span className="helix-num text-text/80">
      {new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now)}
    </span></>
  )
})

/** Time-of-day greeting from the device-local hour. */
function greetingFor(now: Date): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/**
 * HELIX header — one clean brand line (mark optically centered with the cap
 * height) + a live device-local date/clock line and a 24h "Updated" stamp.
 * No hardcoded timezone: everything renders in the user's actual local time.
 */
export function BrandHeader() {
  // Minute resolution: everything here derives from the DATE and the HOUR.
  const now = useClock(60_000)
  const { data: lastUpdated } = useLastUpdated()
  const { data: profile } = useMyProfile()

  const firstName = profile?.firstName ?? null
  const greeting = now ? greetingFor(now) : ''
  const dateStr = now ? new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(now) : ''
  const lu = lastUpdated ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(lastUpdated)) : null

  return (
    <header className="space-y-2">
      {/* Dedicated device-local date + live clock line */}
      <div className="flex items-center justify-between gap-3 text-fluid-xs min-h-[16px]">
        <span className="text-muted tracking-wide">
          {dateStr}<LiveTime />
        </span>
        {lu && (
          <span className="text-muted/70 flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
            Updated <span className="helix-num">{lu}</span>
          </span>
        )}
      </div>

      {/* Dynamic time-of-day greeting (device-local). Name is the first token of
          the signed-in user's profile display_name. */}
      {greeting && firstName && (
        <p className="text-fluid-sm text-muted">
          {greeting}, <span className="text-text font-semibold">{firstName}</span>
        </p>
      )}

      {/* Brand line — the HELIX wordmark anchors the FAR LEFT; the data-driven
          plan + phase tags sit flush against the FAR RIGHT, so the eye reads
          identity → context across the full width instead of a left-huddled
          cluster. Cut/Bulk/Maint colours are standardized globally (PHASE_COLORS).
          `items-baseline` hangs the chips off the wordmark's baseline; the tags
          get a hairline top rule on desktop so they read as a considered
          right-hand block rather than floating pills. */}
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-fluid-3xl leading-none shrink-0">
          <span className="helix-wordmark font-heading font-extrabold tracking-[0.22em] leading-none">HELIX</span>
        </h1>
        <PlanPhaseTags />
      </div>
    </header>
  )
}
