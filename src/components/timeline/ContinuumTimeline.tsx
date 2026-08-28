'use client'

import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { CalendarClock, Dumbbell, FolderOpen, Footprints, Moon, Repeat, Trophy } from 'lucide-react'
import { useContinuum, type ContinuumDay } from '@/lib/hooks/useContinuum'
import { getWeekPhase, phaseRgb, type WeekPhase } from '@/lib/phases'
import { WeekChipLabel } from '@/components/timeline/WeekChip'
import { eraForDate, programDayLabel, scheduleDayFor } from '@/lib/programs'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { displayWeight, useUnitSystem, fmtVolume } from '@/lib/utils/units'
import { blurOnTap } from '@/lib/utils/blurOnTap'
import { dayColor, MUTED, REST, WEEK_STATE } from '@/lib/theme/palette'

const STEEL = '#79808C'

/**
 * A day's score, as OPACITY — never as a hue.
 *
 * ── WHY THE RED BOX HAD TO GO ────────────────────────────────────────────────
 * `scoreColor` banded the score into four hues and painted the row's background,
 * its border and its dot with the result. Two things went wrong with that, both
 * visible on every screen of history.
 *
 * The bands were ember ≥80, steel ≥60, gold ≥40, oxide below — so the BEST days
 * and the WORST days were both warm reds, separated only by how red. A month of
 * good training and a month of missed sessions scanned identically. And the row
 * carried no trace of WHICH session it was: every day, whatever you trained, was
 * the same wash in one of four colours.
 *
 * Colour on this row now means identity — `dayColor`, the same hue the session
 * wears in every chart, the widget and the heatmap. Score moves to the alpha of
 * a 2px rule, so a weak day RECEDES instead of shouting. Quiet is the correct
 * visual language for a bad day; alarm is not, and the app has to be scannable
 * across months.
 */
export function scoreOpacity(score: number | null): number {
  if (score == null) return 0.1
  return 0.18 + (Math.max(0, Math.min(100, score)) / 100) * 0.72
}

/** Sunday week-start for a YYYY-MM-DD date. */
function weekStartOf(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}

/** `9240` → `9.2k`. The row has no room for six digits of steps. */
function compactSteps(n: number): string {
  return n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n))
}

/** How long a press has to last before it means "swap", not "open". */
const HOLD_MS = 480

/**
 * Day row — Apple-clean: score dot · date · calories on the top line, three
 * colored macro sliders, then the workout name + volume. The workout label
 * resolves from day_key (so a Tuesday arms day reads "Delts & Arms", never
 * "Upper"). content-visibility keeps offscreen history unrendered.
 *
 * `onSwap` opts the row into rescheduling: press and hold, or tap the ⇄ affordance.
 * Both are wired, because a long-press nobody can see is a feature nobody finds,
 * and a visible button is the only one that works with a keyboard.
 */
export const DayCard = memo(function DayCard({ d, unit, active, onOpen, onSwap }: {
  d: ContinuumDay
  unit: string
  active: boolean
  onOpen: (date: string) => void
  onSwap?: (date: string) => void
}) {
  const day = new Date(d.date + 'T00:00:00')

  /**
   * ── AN UNLOGGED DAY IS NOT AUTOMATICALLY A REST DAY ────────────────────────
   * This row read `d.session ? label : 'Rest'`. `d.session` is what has been
   * LOGGED, so every training day announced itself as Rest right up until the
   * moment the session was committed and then changed its mind — reported on
   * 2026-08-28, where Friday read "Rest" all morning and became "Legs & Core B"
   * only after the workout was saved. The timeline is the surface you check to
   * find out what today IS; answering from the log means it can only ever
   * describe the past.
   *
   * So when nothing is logged the row falls through to the PLAN.
   * `scheduleDayFor` is the app's one schedule rule and it already resolves
   * per-date swaps, so a moved session shows on the day it moved to.
   * `useScheduleVersion` is not optional: the plan, the phase and the overrides
   * all live behind synchronous caches React cannot observe, and without the
   * subscription this row would keep yesterday's answer forever (see
   * `sync-external-stores`).
   */
  void useScheduleVersion()
  const planned = useMemo(
    () => (d.session ? null : scheduleDayFor(d.date)),
    [d.session, d.date],
  )
  const plannedDay = planned && planned !== 'rest' ? planned : null

  // IDENTITY, not score. A rest day has no session to identify, so it takes the
  // one tone that means "no session" rather than borrowing a family's hue. A
  // PLANNED day takes its family's hue too — it is the same session, just not
  // done yet — and the row states it in muted type rather than in steel.
  const identity = d.session
    ? dayColor(d.session.dayKey, d.session.split)
    : plannedDay
      ? dayColor(plannedDay.dayKey, null)
      : REST
  const workoutLabel = d.session
    ? programDayLabel(d.session.dayKey, d.session.split)
    : plannedDay?.label ?? null
  const vol = d.session?.volumeKg != null ? fmtVolume(displayWeight(d.session.volumeKg)) : null
  const prs = d.session?.prCount ?? 0

  // A hold that fired must swallow the click it is about to produce, or the row
  // opens the Nexus underneath the sheet it just launched.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const held = useRef(false)
  const endHold = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])
  const startHold = useCallback(() => {
    if (!onSwap) return
    held.current = false
    timer.current = setTimeout(() => { held.current = true; onSwap(d.date) }, HOLD_MS)
  }, [onSwap, d.date])

  const card = (
    <button
      onClick={() => { if (held.current) { held.current = false; return } onOpen(d.date) }}
      onPointerDown={startHold} onPointerUp={(e) => { endHold(); blurOnTap(e) }}
      onPointerLeave={endHold} onPointerCancel={endHold}
      onContextMenu={(e) => { if (onSwap) e.preventDefault() }}
      aria-current={active ? 'date' : undefined}
      className={`relative w-full overflow-hidden rounded-lg py-1.5 pl-3 text-left border transition-colors active:opacity-80 ${onSwap ? 'pr-10' : 'pr-3'}`}
      style={{
        contentVisibility: 'auto', containIntrinsicSize: 'auto 46px',
        WebkitTouchCallout: 'none',
        // Near-flat. The row used to carry a score-tinted wash AND a score-tinted
        // border AND a score-tinted glowing dot — three channels saying one thing,
        // loudly, on every row at once. The surface is now quiet by default and
        // only the SELECTED row lifts.
        background: active ? `${identity}14` : 'rgba(255,255,255,0.02)',
        borderColor: active ? `${identity}66` : 'rgba(255,255,255,0.06)',
      } as React.CSSProperties}>

      {/* ── THE SCORE RULE ──
          2px down the leading edge, the day's own colour, alpha set by the
          score. A weak day recedes; it does not turn red. */}
      <span aria-hidden="true" className="absolute left-0 inset-y-0 w-[2px] rounded-r"
        style={{ background: identity, opacity: scoreOpacity(d.score) }} />

      {/* Line 1 — identity dot · date · what it was · records */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="rounded-full shrink-0 transition-transform duration-200"
          style={{ width: 8, height: 8, transform: `scale(${active ? 1.25 : 1})`, background: identity }}
          aria-hidden="true" />
        <span className="shrink-0 font-heading font-semibold text-[12px] tabular-nums" style={{ color: active ? identity : undefined }}>
          {day.toLocaleDateString('en-GB', { weekday: 'short' })} {day.getDate()}
          <span className="text-[9px] text-muted uppercase ml-1">{day.toLocaleDateString('en-GB', { month: 'short' })}</span>
        </span>
        {/* Three states, and the icon carries which one it is: a dumbbell for
            work that HAPPENED, a calendar clock for work that is scheduled and
            not logged, a moon for a genuine rest day. The planned name is muted
            so a scan still separates done from due at a glance — the label is
            not a claim that you trained. */}
        <span className="flex items-center gap-1.5 min-w-0 flex-1 text-[11px]" style={{ color: d.session ? STEEL : MUTED }}>
          {d.session
            ? <Dumbbell className="w-3 h-3 shrink-0" aria-hidden="true" />
            : plannedDay
              ? <CalendarClock className="w-3 h-3 shrink-0" aria-hidden="true" />
              : <Moon className="w-3 h-3 shrink-0" aria-hidden="true" />}
          <span className="truncate">{workoutLabel ?? 'Rest'}</span>
        </span>
        {prs > 0 && (
          <span className="flex items-center gap-0.5 shrink-0 helix-num text-[10px] font-bold tabular-nums"
            style={{ color: WEEK_STATE.pr }} title={`${prs} personal record${prs === 1 ? '' : 's'}`}>
            <Trophy className="w-3 h-3" aria-hidden="true" />{prs}
          </span>
        )}
      </div>

      {/* Line 2 — the numbers, in one muted run. Three macro sliders used to sit
          here against targets hardcoded in this file; the day sheet shows macros
          against the REAL phase goals, which is where that reading belongs. */}
      <div className="flex items-baseline gap-1.5 mt-0.5 pl-[16px] text-[10px] text-muted min-w-0">
        {vol && <span className="helix-num tabular-nums shrink-0">{vol} {unit}</span>}
        {vol && <span className="opacity-40 shrink-0" aria-hidden="true">·</span>}
        <span className="helix-num tabular-nums shrink-0">
          {d.calories != null ? `${Math.round(d.calories).toLocaleString()} kcal` : '— kcal'}
        </span>
        {d.steps != null && (
          <>
            <span className="opacity-40 shrink-0" aria-hidden="true">·</span>
            <span className="flex items-center gap-1 shrink-0">
              <Footprints className="w-2.5 h-2.5" aria-hidden="true" />
              <span className="helix-num tabular-nums">{compactSteps(d.steps)}</span>
            </span>
          </>
        )}
      </div>
    </button>
  )

  if (!onSwap) return card
  return (
    <div className="relative">
      {card}
      <button type="button" onClick={() => onSwap(d.date)} onPointerUp={blurOnTap}
        aria-label={`Reschedule ${d.date}`}
        className="absolute right-0.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-white/[0.06] transition-colors">
        <Repeat className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  )
})

const WeekHeader = memo(function WeekHeader({ weekStart, phase, onOpenWeek }: {
  weekStart: string
  phase: WeekPhase | null
  onOpenWeek: (weekStart: string) => void
}) {
  // The header used to colour itself by ERA — grey for Helix, grey for PPL — so
  // a Cut week and a Bulk week were visually identical. It reads the phase now.
  const rgb = phase ? phaseRgb(phase.kind, phase.era) : null
  const color = rgb ? `rgb(${rgb})` : STEEL
  const label = phase?.label ?? `Week of ${new Date(weekStart + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
  return (
    <div className="flex items-center gap-2 pt-3 pb-1">
      <span className="h-2 w-2 rounded-full border-2 shrink-0"
        style={{ borderColor: color, boxShadow: rgb ? `0 0 8px rgba(${rgb},0.45)` : undefined }} aria-hidden="true" />
      <WeekChipLabel weekStart={weekStart} className="min-w-0" />
      <span className="h-px flex-1" style={{ background: rgb ? `rgba(${rgb},0.22)` : `${STEEL}30` }} />
      <button onClick={() => onOpenWeek(weekStart)} onPointerUp={blurOnTap} className="p-1.5 rounded-lg hover:bg-white/[0.06] min-h-[32px]" style={{ color }}
        aria-label={`Open files for ${label}`}>
        <FolderOpen className="w-3.5 h-3.5" />
      </button>
    </div>
  )
})

/**
 * The Continuum — Journey's primary surface. A unified, day-first
 * timeline: every day is one card (score · macros · session/recovery · core
 * trio), grouped under slim era-aware week nodes. Tap a day → its Daily Nexus;
 * tap a week's folder → that week's reports.
 */
export const ContinuumTimeline = memo(function ContinuumTimeline({ era, onOpenWeek, onOpenDay, activeDate }: {
  era: 'all' | 'ppl' | 'axis'
  onOpenWeek: (weekStart: string) => void
  onOpenDay: (date: string) => void
  activeDate: string | null
}) {
  const [fullHistory, setFullHistory] = useState(false)
  const { data, isLoading } = useContinuum(fullHistory)
  const unit = useUnitSystem()

  const groups = useMemo(() => {
    const out: Array<{ weekStart: string; phase: WeekPhase | null; days: ContinuumDay[] }> = []
    for (const d of data ?? []) {
      // Filter DAYS by the unified date boundary (eraForDate), not the week
      // phase — the boundary week (12–18 Jul) straddles both eras, and its
      // PPL days must not leak into the Helix view (or vice versa). Week
      // headers still carry their getWeekPhase label.
      if (era !== 'all' && eraForDate(d.date) !== era) continue
      const ws = weekStartOf(d.date)
      const phase = getWeekPhase(ws)
      const last = out[out.length - 1]
      if (last?.weekStart === ws) last.days.push(d)
      else out.push({ weekStart: ws, phase, days: [d] })
    }
    return out
  }, [data, era])

  if (isLoading) {
    return (
      <div className="space-y-2.5">
        {[0, 1, 2, 3].map((i) => <div key={i} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-[74px] animate-pulse" />)}
      </div>
    )
  }
  if (!groups.length) {
    return <p className="text-fluid-sm text-muted py-8 text-center">No logged days in this era yet.</p>
  }

  return (
    <div>
      {groups.map((g) => (
        <div key={g.weekStart}>
          <WeekHeader weekStart={g.weekStart} phase={g.phase} onOpenWeek={onOpenWeek} />
          <div className="space-y-1.5">
            {g.days.map((d) => <DayCard key={d.date} d={d} unit={unit} active={activeDate === d.date} onOpen={onOpenDay} />)}
          </div>
        </div>
      ))}
      {!fullHistory && (
        <button onClick={() => setFullHistory(true)} onPointerUp={blurOnTap}
          className="btn-glass w-full justify-center min-h-[44px] mt-3">
          Load full history
        </button>
      )}
    </div>
  )
})
