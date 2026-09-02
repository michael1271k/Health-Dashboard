'use client'

import { useGlobalSessionNumber } from '@/lib/hooks/useDayVault'
import { BackLink } from '@/components/nav/NavChevron'
import { PhaseTags } from '@/components/timeline/PhaseTags'
import { LeverTag } from '@/components/nutrition/LeverTag'
import { weekStartOf } from '@/lib/utils/week'
import { startTimeLabel } from '@/lib/utils/day'
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
export function SessionTitle({ label, accent, date, startedAt, onBack }: {
  /** The program day's own label — "Upper B", "Legs & Core A". */
  label: string
  /** `dayColor(dayKey, splitDay)` — steel for Upper A, gold for Upper B, and so on. */
  accent: string
  /** ISO date of the session. */
  date: string
  /**
   * `workout_sessions.started_at`. Rendered beside the date — see the note on
   * the metadata line below.
   */
  startedAt?: string | null
  /** The way out. Rendered in the title row — see the note above. */
  onBack?: () => void
}) {
  const { data: globalNum } = useGlobalSessionNumber(date)
  const pretty = new Date(`${date}T00:00:00`)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })
  // Same words as the live deck's Duration sheet. Empty when unparseable.
  const started = startTimeLabel(startedAt ?? null)

  return (
    /* Bleeds past the reading measure's gutters so the wash reaches the screen
       edges on a phone — a tint that stops 8px short of the edge reads as a
       panel behind the title rather than as the page's own colour. */
    /* `pb-2`, not `pb-5`. Between the title and the metadata box there were
       four separate pieces of air — this padding (20px), the page's own
       `space-y-3` (12px), the band's inset, and a "Compared with …" caption
       that has since gone (see `SessionHero`). Stacked, that was three to four
       blank lines on the one screen that opens to the numbers. Trimmed here
       because this is the only one of the four that was pure decoration: the
       wash it pads has already dissolved by the time it reaches the bottom of
       the block. */
    <div className="relative -mx-2 px-4 pt-4 pb-2">
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
      {/* ── THE ONLY DATE ON THE PAGE, AND NOW THE TIME WITH IT ──
          The date was once rendered twice — under the bar's title and again,
          computed from scratch with byte-identical options, on the right of the
          metadata box. Both are gone; this line replaced them, and it carries
          the session's number because "which session was this" and "when" are
          one question.

          The start time used to be a row of its own at the FOOT of the metric
          band, under Difficulty / Records / Avg HR / Calories, behind a
          horizontal rule, with an uppercase "START TIME" label and the figure in
          full-strength `text-text` — brighter than the date, brighter than the
          session number, and the last thing on a block of numbers it is not one
          of. It is not a metric. It is the second half of "when": a 7am session
          and an 8pm one are different sessions, which is most of why a duration
          or an average heart rate reads the way it does.

          So it joins the date, in the same muted type, separated by the same
          interpunct the session number already uses — one line that answers
          which session, what day, what time, and nothing else. `helix-num` and
          `tabular-nums` on the figure alone, so it sits on the same numeral grid
          as every other number on the page without claiming the emphasis a
          brighter colour would give it. */}
      <p className="mt-1.5 text-fluid-xs text-muted">
        {globalNum ? (
          <>
            <span className="helix-num">Session #{String(globalNum).padStart(2, '0')}</span>
            <span className="mx-1.5 opacity-50">·</span>
          </>
        ) : null}
        {pretty}
        {started && (
          <>
            <span className="mx-1.5 opacity-50">·</span>
            <span className="helix-num tabular-nums tracking-[0.01em]">{started}</span>
          </>
        )}
      </p>
      {/* Which programme, which phase, how far in — the three facts the single
          "Helix Cut" badge in the pinned bar was compressing into two words.
          They wrap rather than truncate: a week number cut in half is worse than
          a second line. */}
      {/* ── AND THE RUNG THE WEEK WAS RUN UNDER ──
          Plan, phase and week said which BLOCK this session belongs to and
          nothing about the week's own instruction. A maintenance week is the one
          rung that changes what the session itself was — the volume, the steps
          and the food all move together — and a report of a session logged
          inside one that does not say so is a report missing its most
          consequential fact.

          Resolved from THIS session's date, not from today: see `LeverTag`. The
          same chip the dashboard and the live deck already wear, so a
          maintenance day looks the same wherever it is read. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <PhaseTags weekStart={weekStartOf(date)} />
        <LeverTag date={date} compact />
      </div>
    </div>
  )
}
