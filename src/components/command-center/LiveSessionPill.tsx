'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'framer-motion'
import { ChevronUp } from 'lucide-react'
import { SNAPPY } from '@/lib/motion/springs'
import { useHelixReducedMotion } from '@/lib/motion/useHelixReducedMotion'
import { useWakeLock } from '@/lib/hooks/useWakeLock'
import { useExerciseBaselines } from '@/lib/hooks/useExerciseBaselines'
import { computeLivePrs, livePrDigest } from '@/lib/sessions/livePrs'
import { tapLight } from '@/lib/native/haptics'
import { cleanSessionTitle, draftTotals } from '@/lib/sessions/draft'
import { getDraftServerSnapshot, getDraftSnapshot, subscribeDraft } from '@/lib/sessions/draftStore'
import { dayColor, EMBER, GOLD, MUTED, STEEL } from '@/lib/theme/palette'
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
 *
 * ── WHAT IT REPORTS, AND WHY TIME IS NOT ON THE LIST ─────────────────────────
 * Sets, volume, records — the three figures that answer "how is this session
 * going". Elapsed time answered a different question ("how long have I been
 * here"), one nothing on this bar acts on, and it cost a 20 s interval that
 * re-rendered a fixed element on every screen in the app for a number that
 * moves once a minute. Removing it removes the timer with it: this component
 * now re-renders only when the draft itself changes.
 *
 * The record count comes from the SAME query key and the SAME engine the deck
 * uses (`useExerciseBaselines` + `computeLivePrs`), so the gold figure here and
 * the gold figure on the hero can never disagree — and returning from the deck
 * is a cache hit, not a second fetch.
 */
export function LiveSessionPill() {
  const router = useRouter()
  const pathname = usePathname()
  const reduce = useHelixReducedMotion()

  const draft = useSyncExternalStore(subscribeDraft, getDraftSnapshot, getDraftServerSnapshot)

  // Above the early return, deliberately — see the wake-lock note above.
  // The second argument is what stops an abandoned draft from holding the
  // screen awake forever; `touchedAt` moves only on a real edit, so a phone
  // locked between sets does not keep extending it. See `useWakeLock`.
  useWakeLock(!!draft, draft?.touchedAt ?? draft?.startedAt ?? null)

  // `/session` is the deck AND `/session/[id]` is the finished-session report.
  // Neither wants a "return to your workout" bar: on the first it is where you
  // already are, and on the second it would sit under the summary of the very
  // session you just finished, in the half-second before the draft clears.
  const open = !!draft && !pathname.startsWith('/session')

  // Records, judged exactly as the deck judges them. `names`/`prKey` are cheap
  // string walks; the query is keyed identically to the deck's, so this is the
  // same cache entry rather than a second request.
  const names = useMemo(
    () => draft?.exercises.filter((ex) => ex.kind !== 'cardio').map((ex) => ex.name) ?? [],
    [draft],
  )
  const { data: baselines } = useExerciseBaselines(names, draft?.date)
  const prKey = livePrDigest(draft)
  // `draft` is deliberately not a dependency — `prKey` already covers every
  // field the answer can depend on, and including it defeats the memo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recordCount = useMemo(() => computeLivePrs(draft, baselines).count, [prKey, baselines])

  // Tell the shell to reserve room, the same way `BottomNav` does. Without it
  // the last element on every page hides behind the pill.
  useEffect(() => {
    document.documentElement.dataset.livePill = open ? 'true' : 'false'
    return () => { document.documentElement.dataset.livePill = 'false' }
  }, [open])

  const accent = draft ? dayColor(draft.dayKey, draft.splitDay) : undefined
  const totals = draft ? draftTotals(draft) : null

  return (
    <AnimatePresence>
      {open && draft && totals && accent && (
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
            className="pointer-events-auto relative w-full min-h-[62px] rounded-2xl overflow-hidden
                       flex items-center gap-2.5 pl-0 pr-2.5 py-2.5 text-left
                       border border-white/[0.10] shadow-[0_10px_28px_rgba(0,0,0,0.5)]"
            style={{
              // Opaque. See the header — this may never become a second
              // backdrop-filter layer over the tab bar.
              backgroundColor: '#1A1D23',
            }}
          >
            {/* ── THE WASH ──
                Three stops, not two. A single diagonal ramp from `accent26` to
                the surface put all of the colour in one corner and left the
                right two-thirds flat, which is what read as "a solid bar with a
                tint bolted on". This lays a broad diagonal that keeps a trace of
                the hue the whole way across, then a soft radial bloom behind the
                title where the eye actually lands. Both are painted as an inert
                layer under the content rather than as the button's own
                `background`, so `overflow-hidden` clips them to the radius and
                neither can bleed over the text. */}
            <span
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  `radial-gradient(120% 180% at 4% 50%, ${accent}3d 0%, ${accent}14 38%, transparent 72%),` +
                  `linear-gradient(100deg, ${accent}1f 0%, ${accent}0f 46%, rgba(255,255,255,0.03) 100%)`,
              }}
            />
            {/* The light catching the top edge of the material — the same
                hairline the hero and the collapsed bar both wear. */}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px pointer-events-none"
              style={{ background: `linear-gradient(90deg, transparent, ${accent}66, transparent)` }}
            />

            {/* The day's own colour as a rule, not a fill. Same 3px hue
                language the deck and the day cards already speak, so the pill
                reads as THIS workout rather than as generic chrome. */}
            <span
              aria-hidden="true"
              className="relative self-stretch w-[3px] shrink-0 rounded-r"
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

            <span className="relative min-w-0 flex-1">
              <span className="block font-heading font-bold text-[15px] leading-tight truncate text-text tracking-[-0.01em]">
                {cleanSessionTitle(draft)}
              </span>
              {/* ── THREE COLUMNS, NOT AN INLINE RUN ──
                  Inline with interpuncts, the three figures bunched at the left
                  and left a ragged gap before the chevron whose width changed
                  every time the tonnage gained a digit. An equal three-column
                  grid gives each figure the same third of the line, so the row
                  is stable as the numbers grow and there is no dead space to
                  leave. */}
              <span className="grid grid-cols-3 gap-1.5 mt-1 pr-1">
                <Stat value={String(totals.sets)} unit={totals.sets === 1 ? 'set' : 'sets'} color={STEEL} />
                <Stat value={totals.volumeKg > 0 ? fmtVolume(totals.volumeKg) : '—'} unit="kg" color={EMBER} />
                <Stat
                  value={recordCount > 0 ? String(recordCount) : '—'}
                  unit={recordCount === 1 ? 'PR' : 'PRs'}
                  // Gold, and only when there is something to be gold about. A
                  // permanent gold zero is how gold stops meaning a record.
                  color={recordCount > 0 ? GOLD : MUTED}
                />
              </span>
            </span>

            {/* Not a close button. There is no "dismiss" for a live workout —
                the way out is to finish it or discard it, and both live in the
                deck. This chevron says "expand", which is the only thing a tap
                here does. */}
            <ChevronUp className="relative w-4 h-4 shrink-0" style={{ color: accent }} aria-hidden="true" />
          </m.button>
        </m.div>
      )}
    </AnimatePresence>
  )
}

function Stat({ value, unit, color }: { value: string; unit: string; color: string }) {
  return (
    <span className="helix-num font-bold tabular-nums text-[12px] leading-tight truncate" style={{ color }}>
      {value}<span className="font-normal opacity-70 ml-0.5">{unit}</span>
    </span>
  )
}
