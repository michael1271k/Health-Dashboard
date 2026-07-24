'use client'

import { useEffect, useState } from 'react'
import { useLastUpdated } from '@/lib/hooks/useDashboard'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { HELIX_CUT_START } from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'

/** Days elapsed since the program start (2026-07-15), inclusive — the streak. */
function programStreak(): number {
  const start = Date.parse(`${HELIX_CUT_START}T00:00:00Z`)
  const today = Date.parse(`${logicalTodayISO()}T00:00:00Z`)
  return Math.max(1, Math.floor((today - start) / 86_400_000) + 1)
}

/** Ticking clock (client-only to avoid hydration mismatch). */
function useClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

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
  const now = useClock()
  const { data: lastUpdated } = useLastUpdated()
  const { data: profile } = useMyProfile()

  const firstName = profile?.firstName ?? null
  const greeting = now ? greetingFor(now) : ''
  const dateStr = now ? new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(now) : ''
  const timeStr = now ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now) : ''
  const lu = lastUpdated ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(lastUpdated)) : null

  return (
    <header className="space-y-2">
      {/* Dedicated device-local date + live clock line */}
      <div className="flex items-center justify-between gap-3 text-fluid-xs min-h-[16px]">
        <span className="text-muted tracking-wide">
          {dateStr}{timeStr && <> · <span className="helix-num text-text/80">{timeStr}</span></>}
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

      {/* Brand line — no icon; the wordmark is spaced out and left-aligned, with
          the daily-streak counter pushed to the right. */}
      <div className="flex items-center gap-x-3">
        <h1 className="text-fluid-3xl leading-none">
          <span className="helix-wordmark font-heading font-extrabold tracking-[0.22em] leading-none">HELIX</span>
        </h1>
        <span
          className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider self-center"
          style={{ color: '#9AA6B8', background: '#9AA6B81f', border: '1px solid #9AA6B855', boxShadow: '0 0 10px #9AA6B844' }}
        >
          HELIX-5
        </span>
        <span
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full self-center shrink-0"
          style={{ color: '#E2683A', background: '#E2683A1a', border: '1px solid #E2683A55', boxShadow: '0 0 12px #E2683A33' }}
          aria-label={`Daily streak: ${programStreak()} days`}
        >
          <span aria-hidden="true" className="text-fluid-sm leading-none">🔥</span>
          <span className="helix-num text-fluid-sm font-extrabold leading-none">{programStreak()}</span>
          <span className="text-[10px] font-bold uppercase tracking-wide leading-none">Day Streak</span>
        </span>
      </div>
    </header>
  )
}
