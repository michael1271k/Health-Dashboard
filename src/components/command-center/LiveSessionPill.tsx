'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'framer-motion'
import { ChevronUp } from 'lucide-react'
import { SNAPPY } from '@/lib/motion/springs'
import { useHelixReducedMotion } from '@/lib/motion/useHelixReducedMotion'
import { useWakeLock } from '@/lib/hooks/useWakeLock'
import { tapLight } from '@/lib/native/haptics'
import { cleanSessionTitle, draftTotals } from '@/lib/sessions/draft'
import { getDraftServerSnapshot, getDraftSnapshot, subscribeDraft } from '@/lib/sessions/draftStore'
import { dayColor } from '@/lib/theme/palette'
import { fmtVolume } from '@/lib/utils/units'

/**
 * ── THE MINIMISED WORKOUT ────────────────────────────────────────────────────
 *
 * A live session used to be a trap. `/session` is a fullscreen takeover that
 * hides the tab bar, so between sets there was no way to look at last week's
 * numbers, check a report, or log anything else without leaving the deck — and
 * leaving it FELT like discarding it, even though the draft has autosaved to
 * localStorage since the day it was written.
 *
 * Which is the whole insight here: nothing about the state needed building. The
 * back chevron has always been "minimise" — the draft survives, and returning
 * to `/session` resumes it exactly. What was missing was any evidence of that.
 * A workout you cannot see is a workout you assume you lost.
 *
 * So this is not a new state machine. It is the state machine made visible: one
 * persistent bar, above the tab bar, on every screen except the deck itself,
 * saying "this is still running" and taking you back with one tap.
 *
 * ── WHY IT LIVES IN THE ROOT LAYOUT ──────────────────────────────────────────
 * Not in `(dashboard)/layout.tsx`, which was the first instinct. That group
 * covers the five tabs — but `/day/[date]` and `/report/[id]` sit OUTSIDE it,
 * and those are precisely where you go mid-workout ("what did I lift last
 * time?"). A pill that vanished on the two routes the feature exists to reach
 * would be worse than none. The root layout is the only tree that outlives
 * every navigation, which is exactly the requirement.
 *
 * ── THE WAKE LOCK MOVED HERE, AND THAT IS THE LOAD-BEARING PART ──────────────
 * `useWakeLock(!!draft)` used to live inside `/session`. Minimising unmounts
 * that page, which released the lock, which let the screen sleep, which is the
 * first domino in the chain that ends with iOS jetsamming the WKWebView and
 * Capacitor reloading into a black screen (see `useWakeLock`'s own header, and
 * `black-screen-and-reloads`). Shipping the pill without moving the lock would
 * have turned "you can now leave the deck" into "leaving the deck kills the
 * app".
 *
 * The lock follows the DRAFT, not the route. This component mounts on every
 * screen and holds it whenever a draft exists — including on `/session` itself,
 * where the pill is not rendered but the hook still runs. That is why the
 * `useWakeLock` call sits ABOVE the early return.
 *
 * ── AND WHY IT IS OPAQUE ─────────────────────────────────────────────────────
 * No `.app-chrome`, no `backdrop-filter`. The tab bar directly beneath it is
 * already a translucent blurred layer; stacking a second one over the same
 * content is the exact arrangement that composites to solid black on iOS, and
 * `body.helix-overlay-open .app-chrome` exists in globals.css because that has
 * already happened here once. The pill pays a flat background and keeps the
 * bug.
 */
export function LiveSessionPill() {
  const router = useRouter()
  const pathname = usePathname()
  const reduce = useHelixReducedMotion()

  const draft = useSyncExternalStore(subscribeDraft, getDraftSnapshot, getDraftServerSnapshot)

  // Above the early return, deliberately — see the wake-lock note above.
  useWakeLock(!!draft)

  /**
   * Elapsed time, at the resolution it is displayed. A 1 Hz interval to redraw
   * a figure that changes once a minute is 59 wasted renders of a fixed element
   * on every screen in the app; 20 s is fine for a minute counter and keeps the
   * worst-case staleness under a third of a tick.
   */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!draft) return
    const id = setInterval(() => setNow(Date.now()), 20_000)
    return () => clearInterval(id)
  }, [draft])

  // `/session` is the deck AND `/session/[id]` is the finished-session report.
  // Neither wants a "return to your workout" bar: on the first it is where you
  // already are, and on the second it would sit under the summary of the very
  // session you just finished, in the half-second before the draft clears.
  const open = !!draft && !pathname.startsWith('/session')

  // Tell the shell to reserve room, the same way `BottomNav` does. Without it
  // the last element on every page hides behind the pill.
  useEffect(() => {
    document.documentElement.dataset.livePill = open ? 'true' : 'false'
    return () => { document.documentElement.dataset.livePill = 'false' }
  }, [open])

  const accent = draft ? dayColor(draft.dayKey, draft.splitDay) : undefined
  const totals = draft ? draftTotals(draft) : null
  const elapsed = draft?.startedAt ? elapsedLabel(draft.startedAt, now) : null

  return (
    <AnimatePresence>
      {open && draft && totals && (
        <m.div
          key="live-session-pill"
          // Enter and exit are the SAME transform, so an interrupted dismissal
          // reverses from wherever it got to rather than snapping. Under
          // reduced motion the travel is dropped and only the fade survives —
          // the element still appears and disappears, it just does not move.
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
          transition={SNAPPY}
          className="fixed inset-x-0 z-40 md:hidden px-3 pointer-events-none"
          style={{ bottom: 'calc(var(--nav-height) + var(--safe-bottom) + 0.375rem)' }}
        >
          <m.button
            type="button"
            onPointerDown={() => { void tapLight() }}
            onClick={() => router.push('/session')}
            whileTap={reduce ? undefined : { scale: 0.97 }}
            transition={SNAPPY}
            aria-label={`Return to your live workout — ${cleanSessionTitle(draft)}`}
            className="pointer-events-auto w-full min-h-[52px] rounded-2xl overflow-hidden
                       flex items-center gap-2.5 pl-0 pr-3 py-2 text-left
                       border border-white/[0.10] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
            style={{
              // Opaque. See the header — this may never become a second
              // backdrop-filter layer over the tab bar.
              background: `linear-gradient(100deg, ${accent}26 0%, var(--color-surface, #1A1D23) 62%)`,
              backgroundColor: '#1A1D23',
            }}
          >
            {/* The day's own colour as a rule, not a fill. Same 3px hue
                language the deck and the day cards already speak, so the pill
                reads as THIS workout rather than as generic chrome. */}
            <span
              aria-hidden="true"
              className="self-stretch w-[3px] shrink-0 rounded-r"
              style={{ background: accent }}
            />

            {/* The live dot. A workout in progress is the one thing in this app
                allowed to pulse — and it stops pulsing under reduced motion,
                where the dot alone still carries the meaning. */}
            <span className="relative flex w-2 h-2 shrink-0 ml-0.5" aria-hidden="true">
              {!reduce && (
                <span
                  className="absolute inline-flex w-full h-full rounded-full animate-ping opacity-60"
                  style={{ background: accent }}
                />
              )}
              <span className="relative inline-flex w-2 h-2 rounded-full" style={{ background: accent }} />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block font-heading font-bold text-[13px] leading-tight truncate text-text">
                {cleanSessionTitle(draft)}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] leading-tight text-muted tabular-nums">
                {elapsed && <><span className="helix-num">{elapsed}</span><Dot /></>}
                <span className="helix-num">
                  {totals.sets} {totals.sets === 1 ? 'set' : 'sets'}
                </span>
                {totals.volumeKg > 0 && (
                  <><Dot /><span className="helix-num">{fmtVolume(totals.volumeKg)} kg</span></>
                )}
              </span>
            </span>

            {/* Not a close button. There is no "dismiss" for a live workout —
                the way out is to finish it or discard it, and both live in the
                deck. This chevron says "expand", which is the only thing a tap
                here does. */}
            <ChevronUp className="w-4 h-4 shrink-0" style={{ color: accent }} aria-hidden="true" />
          </m.button>
        </m.div>
      )}
    </AnimatePresence>
  )
}

function Dot() {
  return <span className="opacity-30" aria-hidden="true">·</span>
}

/**
 * "42 min" / "1:07". Minutes until the hour, then h:mm — the same shape a timer
 * on a watch face uses, and it never needs more than five characters.
 *
 * Clamped at zero: a draft that survived a clock change (or a device whose time
 * moved backwards over a sync) must not render "-3 min".
 */
function elapsedLabel(startedAt: string, now: number): string | null {
  const started = Date.parse(startedAt)
  if (!Number.isFinite(started)) return null
  const mins = Math.max(0, Math.floor((now - started) / 60_000))
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
}
