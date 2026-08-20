'use client'

import { useGlobalSessionNumber } from '@/lib/hooks/useDayVault'

/**
 * The report's large title — the day this session was, at the size the day
 * deserves, washed in that day's own colour.
 *
 * ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────
 * The title used to live only in the sticky command bar at `text-fluid-sm`,
 * which is roughly 13–15px — SMALLER than the volume figure 60px below it. The
 * name of the workout was the least prominent text on a page about that
 * workout. It was small because a pinned bar has to be small; the mistake was
 * asking the bar to be the title in the first place.
 *
 * So this is the iOS large-title arrangement: the real title lives in the
 * document, and the bar carries a compact copy that fades in only once this one
 * has scrolled away (see `page.tsx`). Two elements, one title — which is also
 * what resolves the duplicated date, because the date can now live here, under
 * the name, instead of being printed once in the bar and again in the metadata
 * box below.
 *
 * ── SIZE ──
 * `text-fluid-2xl`, not `3xl`. The scale's companion tokens already carry the
 * tracking (-0.016em) and leading (1.12) for this size, so large text tightens
 * on its own rather than being hand-corrected at the call site. 2xl is about
 * twice the old size and still fits the longest day label ("Legs & Core B") on
 * one line at 390px; 3xl wraps it.
 */
export function SessionTitle({ label, accent, date }: {
  /** The program day's own label — "Upper B", "Legs & Core A". */
  label: string
  /** `dayColor(dayKey, splitDay)` — steel for Upper A, gold for Upper B, and so on. */
  accent: string
  /** ISO date of the session. */
  date: string
}) {
  const { data: globalNum } = useGlobalSessionNumber(date)
  const pretty = new Date(`${date}T00:00:00`)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })

  return (
    /* Bleeds past the reading measure's gutters so the wash reaches the screen
       edges on a phone — a tint that stops 8px short of the edge reads as a
       panel behind the title rather than as the page's own colour. */
    <div className="relative -mx-2 px-4 pt-4 pb-5">
      {/* The wash, not a band. A solid block of the day's colour would compete
          with the numbers directly beneath it; a gradient that has fully
          dissolved by the time it reaches the metadata box colours the top of
          the page without claiming any of it. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{ background: `linear-gradient(180deg, ${accent}26 0%, ${accent}0a 45%, transparent 100%)` }}
      />
      <h1
        data-session-title
        className="font-heading font-bold text-fluid-2xl leading-none"
        style={{ color: accent }}
      >
        {label}
      </h1>
      {/* ── THE ONLY DATE ON THE PAGE ──
          It was rendered twice: once under the bar's title and once, computed
          from scratch with byte-identical options, on the right of the metadata
          box. Both are gone; this line is what replaced them, and it carries the
          session's number with it because "which session was this" and "when"
          are one question. */}
      <p className="mt-1.5 text-fluid-xs text-muted">
        {globalNum ? (
          <>
            <span className="helix-num">Session #{String(globalNum).padStart(2, '0')}</span>
            <span className="mx-1.5 opacity-50">·</span>
          </>
        ) : null}
        {pretty}
      </p>
    </div>
  )
}
