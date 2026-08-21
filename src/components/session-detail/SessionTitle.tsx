'use client'

import { useGlobalSessionNumber } from '@/lib/hooks/useDayVault'
import { BackLink } from '@/components/nav/NavChevron'
import { PhaseTags } from '@/components/timeline/PhaseTags'
import { weekStartOf } from '@/lib/utils/week'
import { blurOnTap } from '@/lib/utils/blurOnTap'

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
 *
 * ── THE WAY OUT LIVES HERE NOW, AND SO DO THE TAGS ───────────────────────────
 * Above this block sat a 44px pinned bar holding a back chevron, a phase badge,
 * and a title rendered at `opacity-0` until you had scrolled past. At the top of
 * the page — where every visit starts — that is a band of chrome around a
 * chevron, and the report opened 44px lower than it needed to for no reason a
 * reader could see.
 *
 * The chevron moves into this heading row, so the band has nothing left to hold
 * and disappears at scroll-top; the bar goes `fixed` and slides in only once
 * this title has left (see `page.tsx`). Sticky would not do — it reserves its
 * box, so a bar that materialised mid-scroll would shove the document under it.
 *
 * The badge came with it, and split in two on the way. "Helix Cut" fused the
 * programme, the phase and the week into one string that answered none of them;
 * `PhaseTags` is the dashboard's own pair, resolved from this session's DATE so
 * a PPL-era report keeps saying PPL.
 */
export function SessionTitle({ label, accent, date, onBack }: {
  /** The program day's own label — "Upper B", "Legs & Core A". */
  label: string
  /** `dayColor(dayKey, splitDay)` — steel for Upper A, gold for Upper B, and so on. */
  accent: string
  /** ISO date of the session. */
  date: string
  /** The way out. Rendered in the title row — see the note above. */
  onBack?: () => void
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
      {/* Chevron and title on ONE line. `-ml-3` pulls the chevron's own padding
          back out so the glyph optically aligns with the text below it rather
          than sitting a thumb's width further in than everything else. */}
      <div className="flex items-center gap-1 min-w-0">
        {onBack && (
          <span className="-ml-3 shrink-0">
            <BackLink onClick={onBack} onPointerUp={blurOnTap} />
          </span>
        )}
        <h1
          data-session-title
          className="font-heading font-bold text-fluid-2xl leading-none min-w-0 truncate"
          style={{ color: accent }}
        >
          {label}
        </h1>
      </div>
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
      {/* Which programme, which phase, how far in — the three facts the single
          "Helix Cut" badge in the pinned bar was compressing into two words.
          They wrap rather than truncate: a week number cut in half is worse than
          a second line. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PhaseTags weekStart={weekStartOf(date)} />
      </div>
    </div>
  )
}
