'use client'

import { memo, useEffect, useState } from 'react'
import { STEEL } from '@/lib/theme/palette'
import { useLastUpdated, useUserGoals } from '@/lib/hooks/useDashboard'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { HELIX_CUT_START, activeProgram, activePhase } from '@/lib/programs'
import { PHASE_COLORS, PHASE_META, type Phase } from '@/lib/nutrition/phase'
import { planWeekNumber } from '@/lib/reports/weekNumber'
import { logicalTodayISO } from '@/lib/utils/day'
import { useLogicalDate } from '@/lib/hooks/useLogicalDate'

/** Per-plan chip colour — Helix-5 gets a premium iridescent violet of its own. */
const PLAN_CHIP_COLOR: Record<string, string> = {
  apex51: '#8B7CF6', // Helix-5 — premium violet
  axis4: '#5FB8E8',  // Helix-4 — aqua
  ppl: '#79808C',    // legacy — muted
}

/** Days elapsed since the program start (2026-07-15), inclusive — the streak. */
export function programStreak(): number {
  const start = Date.parse(`${HELIX_CUT_START}T00:00:00Z`)
  const today = Date.parse(`${logicalTodayISO()}T00:00:00Z`)
  return Math.max(1, Math.floor((today - start) / 86_400_000) + 1)
}

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
  const { data: goals } = useUserGoals()

  // Plan + phase tags read localStorage (activeProgram/activePhase), so resolve
  // them AFTER mount to avoid an SSR/client hydration mismatch.
  const [tags, setTags] = useState<{ planLabel: string; planColor: string; phase: Phase } | null>(null)
  useEffect(() => {
    const p = activeProgram()
    setTags({ planLabel: p.label, planColor: PLAN_CHIP_COLOR[p.id] ?? STEEL, phase: activePhase() as Phase })
  }, [])

  // Weeks INTO the active plan, counted from `user_goals.phase_started_on` — the
  // same source the analytics header uses, so "Week 3" means one thing app-wide.
  // Picking a plan in Settings stamps that column, which puts you in Week 1;
  // until then it counts from the block start (see `planWeekNumber`).
  //
  // `useLogicalDate` rather than a bare `logicalTodayISO()` call: the badge has
  // to advance the instant the configured week boundary passes, and a value read
  // during render only updates when something else happens to re-render.
  const today = useLogicalDate()
  const planWeek = planWeekNumber(
    (goals as { phase_started_on?: string | null } | null)?.phase_started_on,
    today,
  )

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
        <div className="flex items-center gap-x-1.5 shrink-0">
          {tags && (
            <span
              className="px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider shrink-0"
              style={{ color: tags.planColor, background: `${tags.planColor}1f`, border: `1px solid ${tags.planColor}55` }}
            >
              {tags.planLabel}
            </span>
          )}
          {/* Phase AND week, one badge. "Cut" alone says what the block is but
              not where you are inside it; the week number is the part that
              changes, and it was only ever visible on the analytics page. The
              divider keeps it one object rather than two chips that could drift
              apart. */}
          {tags && (
            <span
              className="px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider shrink-0 inline-flex items-center gap-1.5"
              style={{ color: PHASE_COLORS[tags.phase], background: `${PHASE_COLORS[tags.phase]}1f`, border: `1px solid ${PHASE_COLORS[tags.phase]}55` }}
            >
              {PHASE_META[tags.phase].label}
              <span className="w-px h-2.5 opacity-40" style={{ background: 'currentColor' }} aria-hidden="true" />
              <span className="helix-num tabular-nums">Wk {planWeek}</span>
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
