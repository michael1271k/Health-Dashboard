'use client'

import { memo, useMemo, useState } from 'react'
import { useVisibleInterval } from '@/lib/hooks/useVisibleInterval'
import { useFlash } from '@/lib/hooks/useFlash'
import { RotateCw, Check, Loader2, Timer, HeartPulse, Flame, Ruler } from 'lucide-react'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { Bar, HalfArc, Hero, MiniBars, Milestones, StatTile, Trend, vsBaseline } from './parts'
import { useAddCardio, useLastCardio, useCardioLogs, useZone2Week, ZONE2_WEEKLY_TARGET } from '@/lib/hooks/useCardio'
import { activeKcalOf, distanceKm, formatPace, paceMinPerKm } from '@/lib/cardio/metrics'
import { tapLight, tapSuccess } from '@/lib/native/haptics'
import { formatSleep } from '@/lib/utils/format'
import { logicalTodayISO } from '@/lib/utils/day'
import { stepMarks, daysAgo as daysAgoOn, stackSchedule, dueLabel, type StackSlot } from '@/lib/dashboard/tiles'
export { stepMarks, type StackSlot }
import { isTrainingDay } from '@/lib/programs'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import {
  SLOT_LABEL, fatigueDelta, fatigueLevel, latestFatigue, slotsForDay, useFatigue,
  type FatigueDay, type FatigueSlot,
} from '@/lib/hooks/useFatigue'
import { WIDGET_META, heightTier, type WidgetSize } from '@/lib/dashboard/layout'
import { SLEEP, AMETHYST, PLATINUM, STEEL, EMERALD, GOLD, OXIDE, SAPPHIRE, MUTED } from '@/lib/theme/palette'
import type { Tables } from '@/lib/supabase/types'

/* ────────────────────────────────────────────────────────────────────────────
 * SLEEP
 * ──────────────────────────────────────────────────────────────────────────── */

/** The four stages, in the order the night spends them. Mirrors `SleepStages`. */
const STAGES = [
  { key: 'deep_min', label: 'Deep', color: SLEEP.deep },
  { key: 'core_min', label: 'Core', color: SLEEP.core },
  { key: 'rem_min', label: 'REM', color: SLEEP.rem },
  { key: 'awake_min', label: 'Awake', color: SLEEP.awake },
] as const

/** `2026-08-25T23:42:00Z` → `23:42`, in the reader's own clock. */
function clockOf(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * Last night, as its stages.
 *
 * ── THE HALF-ARC AT EVERY SIZE ───────────────────────────────────────────────
 * Small used to be a duration and a bar, which is the one shape that says
 * nothing a sleep tile is for: it graded the night against the goal and threw
 * away the composition, which is the whole reason the stages are recorded. The
 * arc costs the same 70px of body and carries both — the sweep is the grade, the
 * segments are the night — so all three sizes now read as the same widget rather
 * than as a bar that grows into a dial.
 *
 * The arc's SWEEP is the night against the goal; its SEGMENTS divide that sweep
 * by stage. See `HalfArc` for why it is that way round.
 *
 * ── AND WHY THE BOTTOM STRIP EXISTS ──────────────────────────────────────────
 * A 100:56 arc beside four legend rows leaves a band of nothing under the last
 * row at medium — the shape is 66px tall in a 130px body, and centring the
 * legend in the slack is what made the tile read as airy. The strip fills it
 * with the three facts the stages cannot state: when you went down, when you
 * got up, and how much of that time was actually asleep. Efficiency is
 * `(duration − awake) ÷ duration`, the same definition the sleep drawer uses.
 *
 * It does NOT mount `SleepStages`: that component's smallest variant still
 * draws a histogram of recent nights and assumes a full-width surface.
 */
function SleepWidgetImpl({ size, onOpen, sleep, sleepMin, goalHours, nightly }: {
  size: WidgetSize
  onOpen?: () => void
  sleep: Tables<'sleep_sessions'> | null
  /** Fallback total for legacy nights that only ever pushed a duration. */
  sleepMin: number | null
  goalHours: number | null
  /** Recent nightly totals in minutes, oldest first. */
  nightly: Array<number | null>
}) {
  // The vertical room this size stands for — see `heightTier`. `w` is a
  // medium's height and `xl` is a large's; what makes them different is WIDTH,
  // and width is answered by the container queries below.
  const tier = heightTier(size)
  const total = sleep?.duration_min ?? sleepMin ?? null
  const goalMin = goalHours != null ? goalHours * 60 : null
  const parts = STAGES
    .map((s) => ({ ...s, min: (sleep?.[s.key] as number | null) ?? 0 }))
    .filter((s) => s.min > 0)
  const pct = total != null && goalMin ? (total / goalMin) * 100 : null

  // No stage breakdown pushed → one continuous arc in the tile's own hue,
  // rather than an empty ring beside four dashes.
  const segments = parts.length
    ? parts.map((p) => ({ key: p.key, value: p.min, color: p.color }))
    : [{ key: 'total', value: 1, color: AMETHYST }]

  const down = clockOf(sleep?.start_time)
  const up = clockOf(sleep?.end_time)
  const awake = sleep?.awake_min ?? null
  const efficiency = total && total > 0 && awake != null
    ? Math.round(((total - awake) / total) * 100)
    : null

  /**
   * ── THE STRIP NO LONGER PUSHES ITSELF TO THE FLOOR ─────────────────────────
   * It carried `mt-auto`, which is what opened the band of nothing under the
   * stage legend: the arc row is content-height, the strip pinned itself to the
   * bottom of the body, and every pixel the tile had spare became the gap
   * BETWEEN them. That gap is the "dead space under Awake" — it was not
   * padding, it was a deliberate push.
   *
   * Without it the strip sits directly under the legend and the slack falls
   * below the whole group, where the flex column can absorb it into the shape
   * rather than into a hole in the middle of the tile.
   */
  const strip = (down || efficiency != null || sleep?.sleep_score != null) && (
    <span className="flex items-baseline gap-2 min-w-0 pt-1 border-t border-white/[0.06]">
      {down && up && (
        <span className="helix-num text-[10px] tabular-nums text-text truncate">
          {down} <span className="text-muted">→</span> {up}
        </span>
      )}
      {efficiency != null && (
        <span className="helix-num text-[10px] font-bold tabular-nums ml-auto shrink-0" style={{ color: AMETHYST }}>
          {efficiency}<span className="text-[8px] font-normal text-muted ml-0.5">% asleep</span>
        </span>
      )}
      {sleep?.sleep_score != null && (
        <span className="helix-num text-[10px] font-bold tabular-nums shrink-0" style={{ color: SLEEP.rem }}>
          {sleep.sleep_score}<span className="text-[8px] font-normal text-muted ml-0.5">score</span>
        </span>
      )}
    </span>
  )

  return (
    <WidgetFrame {...WIDGET_META.sleep} size={size} onOpen={onOpen}>
      {total == null ? (
        <WidgetEmpty accent={AMETHYST} size={size} message="Last night is still syncing" hint="Your Watch reports it on first unlock" />
      ) : tier === 's' ? (
        /* The arc is width-driven at 100:56, so it is given the widest box that
           still fits the 70px body rather than being allowed to stretch. */
        <span className="flex-1 min-h-0 flex items-center justify-center">
          <span className="w-[112px]">
            <HalfArc pct={pct} segments={segments} width={9}>
              <span className="text-center leading-none">
                <span className="helix-num block font-bold text-[16px] tabular-nums" style={{ color: AMETHYST }}>
                  {formatSleep(total)}
                </span>
                {goalMin && <span className="block text-[7px] text-muted mt-px">of {Math.round(goalMin / 60)}h</span>}
              </span>
            </HalfArc>
          </span>
        </span>
      ) : (
        /* ── AT WIDTH, THE COLUMN BECOMES A ROW ─────────────────────────────
           `@[560px]` is a CONTAINER query on the tile, not a viewport one — so
           it fires for a four-column desktop tile and stays quiet for a
           half-width one at the same window size, which is the distinction a
           `xl:` breakpoint could not draw.

           Stacked, the month's bars sit UNDER the arc and each gets a third of
           the height. Side by side they get the tile's full height and half its
           width, which is the shape a thirty-bar chart actually wants — and the
           arc stops being a small circle with 700px of nothing beside it. */
        <span className="flex-1 min-h-0 flex flex-col gap-1 @[560px]:flex-row @[560px]:gap-4">
          {/* `flex-1 min-h-0`, so the arc ROW absorbs the tile's slack and
              centres in it. Left content-height, every spare pixel fell between
              this row and whatever came next, which is the gap under "Awake".
              At large the chart below takes twice the share, because there more
              height is more information and here it is just a bigger circle. */}
          <span className="flex-1 min-h-0 flex items-center gap-2 min-w-0 @[560px]:flex-[0_0_46%]">
            {/* Fixed width, not `flex-1`: the arc's height follows its width at
                a 100:56 ratio, so letting it stretch would make it 190px tall in
                a 130px box.

                It grows with the tile in two steps rather than continuously —
                `clamp()` on a `cqw` would scale the ring's stroke and its type
                by different amounts and stop it matching the tiles beside it. */}
            <span className={`shrink-0 @[560px]:w-[190px] @[900px]:w-[230px] ${tier === 'l' ? 'w-[136px]' : 'w-[118px]'}`}>
              <HalfArc pct={pct} segments={segments} width={10}>
                <span className="text-center leading-none">
                  {/* Two steps, matching the arc's own two widths. Type set at
                      its final size, never scaled — see `WidgetFrame`. */}
                  <span className="helix-num block font-bold text-[17px] @[560px]:text-[26px] @[900px]:text-[32px] tabular-nums" style={{ color: AMETHYST }}>
                    {formatSleep(total)}
                  </span>
                  {goalMin && <span className="block text-[8px] @[560px]:text-[11px] text-muted mt-0.5">of {Math.round(goalMin / 60)}h</span>}
                </span>
              </HalfArc>
            </span>

            {/* `justify-start`, not `justify-center`: centring four legend rows
                in a column taller than they are splits the slack above AND
                below them, so the stages floated in the middle of the tile with
                a gap at each end instead of sitting against the arc. */}
            <span className="flex-1 min-w-0 flex flex-col justify-start gap-1">
              {parts.length ? parts.map((p) => (
                <span key={p.key} className="flex items-baseline gap-1.5 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} aria-hidden="true" />
                  <span className="text-[9px] uppercase tracking-wide text-muted truncate">{p.label}</span>
                  <span className="helix-num text-[10px] font-bold tabular-nums text-text ml-auto shrink-0">
                    {formatSleep(p.min)}
                  </span>
                </span>
              )) : (
                <span className="text-[10px] text-muted leading-snug">
                  A total only — no stage breakdown was pushed for this night.
                </span>
              )}
              {/* When the body is a ROW the strip cannot span it — the month's
                  chart is where the full width goes — so it settles at the foot
                  of the legend column instead, which is where the arc's own
                  numbers already are. */}
              <span className="hidden @[560px]:block mt-auto">{strip}</span>
            </span>
          </span>

          {/* Large adds the month, as bars: a night either cleared the goal or
              did not, and thirty separate verdicts are countable as bars and not
              as a line. It sits DIRECTLY under the arc row — it used to be
              pushed to the bottom with `mt-auto`, which opened the gap it was
              supposed to be filling. */}
          {/* ── LARGE: THE CHART MOVES UP, AND IT TAKES THE SLACK ──
              It sat under the strip at the bottom of the tile. Both were
              content-height in a column with spare room, so the spare room
              landed between the legend and the chart — a 40px band of nothing
              across the middle of the largest tile on the grid.

              The chart is now the FLEXIBLE element (`flex-1 min-h-0`) and sits
              directly under the arc row, above the strip. Slack goes into the
              bars, where more height is more information, instead of into a
              gap. */}
          {/* The month comes with the WIDTH now, not only with the height: a
              full-width tile has room for it beside the arc even at `w`, where
              the equivalent narrow size (`m`) has none. */}
          <span className={`min-h-0 flex-col pt-1 border-t border-white/[0.06]
                            @[560px]:flex @[560px]:flex-1 @[560px]:border-t-0 @[560px]:pt-0
                            @[560px]:border-l @[560px]:border-white/[0.06] @[560px]:pl-4
                            ${tier === 'l' ? 'flex flex-[2]' : 'hidden'}`}>
            <span className="flex items-baseline gap-1.5 shrink-0">
              <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Nightly · 30</span>
              {goalMin && (
                <span className="helix-num text-[8px] tabular-nums text-muted ml-auto">
                  {nightly.filter((n) => n != null && n >= goalMin).length} on target
                </span>
              )}
            </span>
            {/* `h-full` rather than a fixed 70: the bars are the flexible
                element, so a taller tile buys taller bars — which is more
                information — instead of a taller gap. */}
            <span className="flex-1 min-h-0 mt-1 flex items-end">
              <MiniBars series={nightly} color={AMETHYST} goal={goalMin} height={70} />
            </span>
          </span>

          {/* Bed → wake, efficiency, score. It spans the whole tile when the
              body is a column and rides under the arc when it is a row. */}
          <span className="@[560px]:hidden">{strip}</span>
        </span>
      )}
    </WidgetFrame>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * STEPS
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Movement, and what it actually cost.
 *
 * TDEE, not the watch's active burn: active kcal alone is the half of
 * expenditure the watch happens to measure, and showing only that term is what
 * made the deficit read ~200 kcal small every day (see `tdeeKcal` — BMR +
 * active + TEF since 2026-08-07).
 *
 * The milestone track is the bar the tile already had, made countable. "62 % of
 * goal" is not a figure anybody walks to; "past six thousand" is.
 *
 * ── SMALL CARRIES TWO FACTS, NOT ONE AND A GAP ───────────────────────────────
 * It was a step count pinned to the bottom of the tile with a third of the body
 * empty above it. The active burn goes in that space: it is the one number that
 * turns a step count into a decision, because 9,000 steps that cost 300 kcal and
 * 9,000 that cost 600 are different days.
 */
function StepsWidgetImpl({ size, onOpen, steps, goal, tdee, activeKcal, series }: {
  size: WidgetSize
  onOpen?: () => void
  steps: number | null
  goal: number
  tdee: number | null
  activeKcal: number | null
  series: Array<number | null>
}) {
  // The vertical room this size stands for — see `heightTier`. `w` is a
  // medium's height and `xl` is a large's; what makes them different is WIDTH,
  // and width is answered by the container queries below.
  const tier = heightTier(size)
  /**
   * "vs 7-day" has to be seven days.
   *
   * `series` is the full 30-day window the bar chart draws, and handing all of
   * it to `vsBaseline` made the label a lie by three weeks — a heavy month of
   * walking would flatten today against twenty-nine other days and report
   * "settled" on a day that was genuinely quiet. The last EIGHT entries make
   * today the eighth and the baseline the seven before it, which is what
   * `VitalsWidget` already does for the identical label.
   */
  const delta = vsBaseline(series.slice(-8), steps)
  const marks = useMemo(() => stepMarks(goal), [goal])
  const hit = series.filter((v) => v != null && v >= goal).length
  const logged = series.filter((v) => v != null).length
  const best = series.reduce<number | null>((m, v) => (v != null && (m == null || v > m) ? v : m), null)

  return (
    <WidgetFrame {...WIDGET_META.steps} size={size} onOpen={onOpen}>
      {steps == null ? (
        <WidgetEmpty accent={PLATINUM} size={size} message="Awaiting your first step" hint={`${goal.toLocaleString()} is today's target`} />
      ) : tier === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-between gap-0.5">
          <span className="flex items-baseline gap-1 min-w-0">
            <span className="helix-num text-[10px] font-bold tabular-nums" style={{ color: SAPPHIRE }}>
              {activeKcal != null ? Math.round(activeKcal) : '—'}
              <span className="text-[8px] font-normal text-muted ml-0.5">kcal</span>
            </span>
            <span className="ml-auto shrink-0"><Trend delta={delta != null ? Math.round(delta) : null} /></span>
          </span>
          <Hero value={steps} color={PLATINUM} />
          <Bar value={steps} target={goal} color={PLATINUM} />
        </span>
      ) : (
        /* ── `gap-1` → `gap-0.5`, AND THE CHART IS THE FLEXIBLE ELEMENT ──
           Medium is a hero, a milestone track, three stat tiles and a 24px
           chart in a 130px body — five rows, four gaps. At `gap-1` the gaps
           alone were 16px of it, which is where "too much vertical padding"
           came from: no single gap is wrong, there are just five of them
           stacked. Halving the gap gives 8px back to the content.

           The chart block then takes `flex-1` rather than a fixed height, so
           the tile's remaining slack goes into the BARS. It previously sat at a
           fixed 24px (medium) or 96px (large) directly under the tiles, leaving
           whatever was left as a band under the chart — the gap between the bar
           and the data. Now there is nothing left over to leave. */
        <span className="flex-1 min-h-0 flex flex-col gap-0.5">
          <span className="flex items-baseline gap-2 min-w-0 shrink-0">
            <Hero value={steps} color={PLATINUM} tight />
            <span className="ml-auto shrink-0 flex items-baseline gap-1">
              <Trend delta={delta != null ? Math.round(delta) : null} />
              <span className="text-[8px] text-muted">vs 7-day</span>
            </span>
          </span>

          <span className="shrink-0"><Milestones value={steps} marks={marks} color={PLATINUM} /></span>

          <span className="grid grid-cols-3 gap-1.5 shrink-0">
            <StatTile label="TDEE" value={tdee != null ? Math.round(tdee) : null} unit="kcal" color={STEEL} />
            <StatTile label="Active" value={activeKcal != null ? Math.round(activeKcal) : null} unit="kcal" color={SAPPHIRE} />
            <StatTile label="On target" value={logged ? `${hit}/${logged}` : null} color={hit > 0 ? EMERALD : PLATINUM} />
          </span>

          <span className="flex-1 min-h-0 flex flex-col pt-1 border-t border-white/[0.06]">
            <span className="flex items-baseline gap-1.5 shrink-0">
              <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Daily · 30</span>
              {best != null && (
                <span className="helix-num text-[8px] tabular-nums text-muted ml-auto">
                  best {best.toLocaleString()}
                </span>
              )}
            </span>
            {/* `items-end` so the bars grow from the baseline into the space
                rather than floating in the middle of it. */}
            <span className="flex-1 min-h-0 mt-1 flex items-end">
              <MiniBars series={series} color={PLATINUM} goal={goal} height={tier === 'l' ? 96 : 24} />
            </span>
          </span>
        </span>
      )}
    </WidgetFrame>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * CARDIO — with the one-tap repeat
 * ──────────────────────────────────────────────────────────────────────────── */

const KIND_LABEL: Record<string, string> = { walk: 'Walk', run: 'Run', bike: 'Bike', row: 'Row' }

/** `2026-08-25` → `today` / `yesterday` / `4d ago`. */
export function daysAgo(iso: string, today = logicalTodayISO()): string {
  return daysAgoOn(iso, today)
}

/**
 * Today's cardio, and the fastest possible way to add today's walk.
 *
 * ── AN EMPTY DAY IS NOT AN EMPTY TILE ────────────────────────────────────────
 * Before lunchtime this tile said "No walk logged yet" and nothing else, which
 * is the least useful true statement it could make: the reader already knows
 * they have not walked. What they do not know without opening something is when
 * they LAST walked and how far — which is both the context for the empty state
 * and the argument for fixing it. So an unlogged day reports the last session,
 * dated, in the muted hue that keeps it from being mistaken for today's.
 *
 * ── FOUR FACTS, EACH WITH ITS OWN GLYPH ──────────────────────────────────────
 * Distance, time, heart rate, energy. They came as one `·`-joined run of text
 * that the eye had to parse left to right; they are four independent
 * measurements from four different places, so each gets a tile and an icon, the
 * way Health draws them. The icons are doing real work here rather than
 * decorating: at 8px a label is barely legible and a glyph is instant.
 *
 * ── WHY REPEAT-LAST AND NOT A FORM ───────────────────────────────────────────
 * The walk is the same walk. `useLastCardio` already exists to prefill the day
 * view's form with it — this skips the form entirely. It states the distance and
 * duration ON the control, so it is never a mystery write.
 *
 * Effort and heart rate are deliberately NOT copied forward. Distance and time
 * are properties of the route; how hard it felt and what your heart did are
 * properties of the day, and inventing those would be fabricating a reading.
 *
 * There is no large. Everything this widget knows fits a medium tile, and a
 * large was the same content over 120px of nothing — see `WIDGET_SIZES`.
 */
function CardioWidgetImpl({ size, onOpen }: { size: WidgetSize; onOpen?: () => void }) {
  // The vertical room this size stands for — see `heightTier`. `w` is a
  // medium's height and `xl` is a large's; what makes them different is WIDTH.
  const tier = heightTier(size)
  const today = logicalTodayISO()
  const { data: logs } = useCardioLogs(today)
  const { data: zone2 } = useZone2Week(today)
  const last = useLastCardio('walk')
  const add = useAddCardio(today)
  const [done, flashDone] = useFlash()

  /** Today, folded into one session: distance and time add, heart rate means. */
  const now = useMemo(() => {
    const rows = logs ?? []
    if (!rows.length) return null
    const meters = rows.reduce((n, c) => n + (c.distance_m ?? 0), 0)
    const minutes = rows.reduce((n, c) => n + (c.duration_min ?? 0), 0)
    const kcal = rows.reduce((n, c) => n + (activeKcalOf(c) ?? 0), 0)
    const hrs = rows.map((c) => c.avg_hr).filter((v): v is number => v != null)
    return {
      km: meters > 0 ? Math.round((meters / 1000) * 10) / 10 : null,
      minutes: minutes > 0 ? Math.round(minutes) : null,
      kcal: kcal > 0 ? Math.round(kcal) : null,
      hr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
      pace: formatPace(paceMinPerKm(meters, minutes)),
      kinds: [...new Set(rows.map((r) => KIND_LABEL[r.kind] ?? r.kind))].join(' · '),
    }
  }, [logs])

  const canRepeat = !!last && (last.distance_m != null || last.duration_min != null)
  const repeatLabel = last
    ? [
      last.distance_m != null ? `${distanceKm(last.distance_m)} km` : null,
      last.duration_min != null ? `${Math.round(last.duration_min)} min` : null,
    ].filter(Boolean).join(' · ')
    : ''

  const repeat = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!last || add.isPending) return
    void tapLight()
    add.mutate({
      kind: 'walk',
      distance_m: last.distance_m,
      duration_min: last.duration_min,
      // Energy scales with the work, so the last walk's figure is as good a
      // statement about this one as the distance is. Effort and heart rate are
      // NOT carried: those belong to the day, not to the route.
      active_kcal: last.active_kcal,
      total_kcal: last.total_kcal,
      avg_hr: null,
      effort: null,
    }, {
      onSuccess: () => { flashDone(); void tapSuccess() },
    })
  }

  const zonePips = (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className="text-[9px] text-muted truncate">Zone 2</span>
      <span className="flex gap-0.5 shrink-0" aria-hidden="true">
        {Array.from({ length: ZONE2_WEEKLY_TARGET }, (_, i) => (
          <span key={i} className="w-1 h-1 rounded-full"
            style={{ background: i < (zone2 ?? 0) ? EMERALD : 'rgba(255,255,255,0.14)' }} />
        ))}
      </span>
      <span className="helix-num text-[9px] font-bold tabular-nums ml-auto shrink-0" style={{ color: EMERALD }}>
        {zone2 ?? 0}/{ZONE2_WEEKLY_TARGET}
      </span>
    </span>
  )

  /** One measurement, its glyph and its unit. */
  const fact = (Icon: typeof Timer, value: string | number | null, unit: string, color: string) => (
    <span className="min-w-0 flex flex-col gap-0.5 rounded-lg px-1.5 py-1"
      style={{ background: `${color}12`, border: `1px solid ${color}24` }}>
      <Icon className="w-3 h-3 shrink-0" style={{ color }} aria-hidden="true" />
      <span className="helix-num text-[13px] font-bold leading-none tabular-nums truncate"
        style={{ color: value == null ? MUTED : color }}>
        {value ?? '—'}
        {value != null && <span className="text-[8px] font-normal text-muted ml-0.5">{unit}</span>}
      </span>
    </span>
  )

  return (
    <WidgetFrame {...WIDGET_META.cardio} size={size} onOpen={onOpen}>
      {now ? (
        tier === 's' ? (
          <span className="flex-1 min-h-0 flex flex-col justify-between gap-0.5">
            <span className="flex items-baseline gap-1.5 min-w-0">
              <span className="helix-num text-[10px] font-bold tabular-nums" style={{ color: OXIDE }}>
                {now.hr ?? '—'}<span className="text-[8px] font-normal text-muted ml-0.5">bpm</span>
              </span>
              <span className="helix-num text-[10px] font-bold tabular-nums ml-auto" style={{ color: SAPPHIRE }}>
                {now.kcal ?? '—'}<span className="text-[8px] font-normal text-muted ml-0.5">kcal</span>
              </span>
            </span>
            <Hero value={now.km} unit="km" color={EMERALD} decimals={1} />
            <span className="helix-num text-[9px] tabular-nums text-muted truncate">
              {now.minutes != null ? `${now.minutes}′` : '—'} · {now.pace}
            </span>
          </span>
        ) : (
          <span className="flex-1 min-h-0 flex flex-col gap-1.5">
            <span className="flex items-baseline gap-2 min-w-0">
              <Hero value={now.km} unit="km" color={EMERALD} decimals={1} tight />
              <span className="text-[9px] text-muted truncate ml-auto">{now.kinds} · {now.pace}</span>
            </span>
            <span className="grid grid-cols-4 gap-1.5">
              {fact(Ruler, now.km, 'km', EMERALD)}
              {fact(Timer, now.minutes, 'min', PLATINUM)}
              {fact(HeartPulse, now.hr, 'bpm', OXIDE)}
              {fact(Flame, now.kcal, 'kcal', SAPPHIRE)}
            </span>
            <span className="mt-auto">{zonePips}</span>
          </span>
        )
      ) : last ? (
        <span className="flex-1 min-h-0 flex flex-col gap-1">
          <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted">
            Last · {daysAgo(last.date)}
          </span>
          <span className="helix-num font-bold text-fluid-lg leading-none tabular-nums truncate text-muted">
            {last.distance_m != null
              ? <>{distanceKm(last.distance_m)}<span className="text-[10px] font-normal ml-0.5">km</span></>
              : last.duration_min != null
                ? <>{Math.round(last.duration_min)}<span className="text-[10px] font-normal ml-0.5">min</span></>
                : '—'}
          </span>
          {tier === 's' ? (
            <span className="text-[9px] text-muted truncate">
              {[
                KIND_LABEL[last.kind] ?? last.kind,
                last.duration_min != null ? `${Math.round(last.duration_min)}′` : null,
                activeKcalOf(last) != null ? `${Math.round(activeKcalOf(last) as number)} kcal` : null,
              ].filter(Boolean).join(' · ')}
            </span>
          ) : (
            <>
              <span className="grid grid-cols-4 gap-1.5">
                {fact(Ruler, last.distance_m != null ? distanceKm(last.distance_m) : null, 'km', MUTED)}
                {fact(Timer, last.duration_min != null ? Math.round(last.duration_min) : null, 'min', MUTED)}
                {fact(HeartPulse, last.avg_hr, 'bpm', MUTED)}
                {fact(Flame, activeKcalOf(last) != null ? Math.round(activeKcalOf(last) as number) : null, 'kcal', MUTED)}
              </span>
              {zonePips}
            </>
          )}

          {tier !== 's' && canRepeat && (
            <button
              type="button"
              onClick={repeat}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={add.isPending}
              aria-label={`Log another walk — ${repeatLabel}`}
              className="mt-auto inline-flex items-center justify-center gap-1.5 min-h-[32px] rounded-xl
                         text-[11px] font-bold active:scale-95 transition-transform disabled:opacity-50"
              style={{ background: `${EMERALD}24`, border: `1px solid ${EMERALD}59`, color: EMERALD }}
            >
              {add.isPending
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Logging…</>
                : done
                  ? <><Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" /> Logged</>
                  : <><RotateCw className="w-3.5 h-3.5" aria-hidden="true" /> Walk {repeatLabel}</>}
            </button>
          )}
        </span>
      ) : (
        <WidgetEmpty accent={EMERALD} size={size} message="No walk logged yet" hint="Log one on the day it happened" />
      )}
    </WidgetFrame>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * STACK
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The protocol, as the next thing to take.
 *
 * ── A COUNT IS NOT AN INSTRUCTION ────────────────────────────────────────────
 * "7/11" says how you are doing and nothing about what to do, which on a
 * schedule with named times is the wrong half of the fact. The next unticked
 * dose and the time it is due is an instruction, and the count still rides along
 * underneath for the days you want to know where you stand.
 *
 * ── AND A DOSE IS A TIME, NOT AN ITEM ────────────────────────────────────────
 * `supplement_log` is keyed by ITEM, which is correct — you tick tablets, not
 * clocks. But you TAKE them by the handful: L-citrulline and caffeine are both
 * at 11:45 because they are one act, and a tile that named only the citrulline
 * would send you back to the cupboard four minutes later for the other half of
 * the same dose. So untaken items are grouped by their EXACT due time and the
 * whole block is named at once. The count underneath stays per-ITEM, because
 * that is what you tick and what the log stores.
 *
 * ── MEDIUM SHOWS THE DAY, NOT JUST WHAT IS LEFT ──────────────────────────────
 * The forward list alone left a band of nothing under it by mid-afternoon, when
 * most of the protocol is behind you — the tile was emptiest exactly when the
 * day was going best. What fills it is the part already taken, struck through in
 * emerald: it is a genuine reading (did I take the morning block, or do I only
 * think I did) and it is the half of the protocol that was invisible.
 *
 * There is no large: one dose block and a day's ticks is a medium tile's worth.
 */
/** Minutes since local midnight. */
function minutesNow(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * ── THE MINUTE HAND LIVES HERE NOW, NOT ON THE DASHBOARD ─────────────────────
 * `page.tsx` used to hold this in state and pass it down. It was also a
 * dependency of `renderWidget` — the render prop the WHOLE grid is keyed on —
 * so the once-a-minute tick reconciled every widget on the dashboard, including
 * the ~99-path muscle atlas, to move one label inside this tile.
 *
 * Owning it here means the minute costs exactly this component. Gated on
 * visibility, because a number nobody can read does not need to be right.
 */
function useMinutesNow(enabled: boolean): number {
  const [mins, setMins] = useState(minutesNow)
  useVisibleInterval(() => setMins(minutesNow()), 60_000, enabled)
  return mins
}

function StackWidgetImpl({ size, onOpen, slots, skipped, nowMinutes }: {
  size: WidgetSize
  onOpen?: () => void
  /** Today's doses — `key`, display name, and `HH:MM` due time. */
  slots: StackSlot[]
  /**
   * Only the doses explicitly SKIPPED today.
   *
   * ── WHAT THE CLOCK NOW DECIDES ─────────────────────────────────────────────
   * This was the set of TICKED items, and "next" meant the first one without a
   * tick. That question stopped having an answer when the protocol became
   * default-taken: nothing is ticked, so every dose read as pending and the tile
   * showed the 10:30 block at 11pm.
   *
   * The clock answers it instead, which is what the reader meant all along —
   * a dose whose time has passed is behind you, one whose time has not is ahead,
   * and a skip removes it from both. That also makes the tile honest on the
   * nights this app is never opened, which is the whole reason the default
   * flipped.
   */
  skipped: ReadonlySet<string>
  /**
   * Minutes since local midnight. OPTIONAL: omit it and the tile runs its own
   * visibility-gated minute clock (`useMinutesNow`), which is what the
   * dashboard does. Pass a number to pin the clock — tests do, so "next dose"
   * is deterministic instead of depending on when the suite runs.
   */
  nowMinutes?: number
}) {
  const selfMinutes = useMinutesNow(nowMinutes == null)
  const minutes = nowMinutes ?? selfMinutes
  // The vertical room this size stands for — see `heightTier`. `w` is a
  // medium's height and `xl` is a large's; what makes them different is WIDTH,
  // and width is answered by the container queries below.
  const tier = heightTier(size)
  // The whole schedule is one pure fold — `lib/dashboard/tiles.ts`.
  const { blocks, behind, onProtocol, blockCount, next, inMin } = useMemo(
    () => stackSchedule(slots, skipped, minutes),
    [slots, skipped, minutes],
  )
  const done = useMemo(() => behind.filter((b) => !b.wasSkipped), [behind])
  // Small shows THREE, not two: a morning block is routinely three tablets and
  // a tile that named two of them plus "+1 more" was making the reader open it
  // to learn a word it had room for.
  const shown = tier === 's' ? 3 : 4

  const due = dueLabel

  return (
    <WidgetFrame {...WIDGET_META.stack} size={size} onOpen={onOpen}>
      {!slots.length ? (
        <WidgetEmpty accent={GOLD} size={size} message="No protocol for today" hint="Rest days drop the training-only doses" />
      ) : !next ? (
        /* ── COMPLETE, WITH SOMETHING TO SAY ──
           This was `9/9` over the words "protocol complete" and nothing else —
           a tile that, for the whole back half of every day, occupied a grid
           slot to report a fact you already knew, since you are the one who
           ticked it. It now says WHEN you finished and across how many doses,
           which is the thing you actually go looking for at 9pm ("did I take
           the evening batch, or am I remembering yesterday?"). */
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-1">
          <span className="helix-num font-bold text-fluid-lg leading-none" style={{ color: EMERALD }}>
            {onProtocol.length}/{slots.length}
          </span>
          <span className="text-[9px] truncate" style={{ color: EMERALD }}>protocol complete</span>
          {done[0] && (
            <span className="helix-num text-[9px] tabular-nums text-muted truncate">
              last batch {done[0].time}
              {tier !== 's' && ` · ${blockCount} dose${blockCount === 1 ? '' : 's'}`}
            </span>
          )}
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-0.5">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted">Next</span>
            <span className="text-[9px] truncate ml-auto" style={{ color: 'var(--color-muted)' }}>
              {next.time} · {due(inMin ?? 0)}
            </span>
          </span>
          {/* The whole block, named. One line each, so two things due at 11:45
              read as two things to swallow rather than one truncated string. */}
          {next.items.slice(0, shown).map((it) => (
            <span key={it.key} className="helix-num font-bold text-[13px] leading-tight truncate" style={{ color: GOLD }}>
              {it.name}
            </span>
          ))}
          {next.items.length > shown && (
            <span className="text-[9px] text-muted">+{next.items.length - shown} more in this dose</span>
          )}

          {tier !== 's' && (
            <span className="block space-y-0.5 pt-1 mt-0.5 border-t border-white/[0.06]">
              {blocks.slice(1, 3).map((b) => (
                <span key={b.time} className="flex items-baseline gap-2 min-w-0">
                  <span className="w-1 h-1 rounded-full shrink-0" style={{ background: `${GOLD}80` }} aria-hidden="true" />
                  <span className="text-[9px] text-muted truncate flex-1">
                    {b.items.map((i) => i.name).join(' · ')}
                  </span>
                  <span className="helix-num text-[9px] tabular-nums text-muted shrink-0">{b.time}</span>
                </span>
              ))}
              {behind.slice(0, 3).map((d) => (
                <span key={d.key} className="flex items-baseline gap-2 min-w-0">
                  <Check className="w-2.5 h-2.5 shrink-0" strokeWidth={3}
                    style={{ color: d.wasSkipped ? 'var(--color-muted)' : EMERALD }} aria-hidden="true" />
                  <span className="text-[9px] truncate flex-1 line-through"
                    style={{ color: d.wasSkipped ? 'var(--color-muted)' : `${EMERALD}b0` }}>
                    {d.name}
                  </span>
                  <span className="helix-num text-[9px] tabular-nums text-muted shrink-0">{d.time}</span>
                </span>
              ))}
            </span>
          )}

          <span className="flex items-center gap-1.5 pt-1 mt-auto">
            {/* Taken over SCHEDULED, not over what is left. Counting a skip as
                progress ("slots − pending") made dropping a dose look identical
                to swallowing one. */}
            <span className="flex-1"><Bar value={done.length} target={slots.length} color={GOLD} /></span>
            <span className="helix-num text-[9px] font-bold tabular-nums shrink-0" style={{ color: GOLD }}>
              {done.length}/{slots.length}
            </span>
          </span>
        </span>
      )}
    </WidgetFrame>
  )
}

export { Trend }

/* ────────────────────────────────────────────────────────────────────────────
 * FATIGUE
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * How today has gone, four times over.
 *
 * ── THE HERO IS THE LATEST SLOT, NOT THE MEAN ────────────────────────────────
 * A mean of "Fresh at 7am, Empty at 9pm" is "Worn" — a reading that describes
 * neither moment and was true at no point in the day. The figure that stands
 * for a day is where the day ended up, and the four dots beside it carry the
 * shape the single word cannot.
 *
 * ── AND IT IS NEVER GRADED ───────────────────────────────────────────────────
 * No target, no percentage, no colour that means "bad". Heavy is not a failure,
 * it is Thursday of a cut — and a tile that scolded you for it would teach you
 * to stop logging honestly, which costs the whole record. The colours are the
 * scale's own, running emerald → oxide because that is the direction fatigue
 * runs, not because the far end is a verdict.
 */
function FatigueWidgetImpl({ size, onOpen }: { size: WidgetSize; onOpen?: () => void }) {
  // The vertical room this size stands for — see `heightTier`. `w` is a
  // medium's height and `xl` is a large's; what makes them different is WIDTH.
  const tier = heightTier(size)
  const today = logicalTodayISO()
  // The slots a day asks for depend on whether it is a training day, and
  // `isTrainingDay` reads a store React cannot see — `useScheduleVersion` is the
  // subscription that makes a swap on another device reach this tile.
  const scheduleVersion = useScheduleVersion()
  const training = useMemo(() => {
    void scheduleVersion
    return isTrainingDay(today)
  }, [today, scheduleVersion])
  const slots = slotsForDay(training)
  const { data: day } = useFatigue(today, training)
  const readings = useMemo(() => day ?? {}, [day])
  const latest = latestFatigue(readings)
  const level = latest ? fatigueLevel(latest.level) : null
  const logged = slots.filter((s) => readings[s] != null).length
  const delta = fatigueDelta(readings)

  return (
    <WidgetFrame {...WIDGET_META.fatigue} size={size} onOpen={onOpen}>
      {!level ? (
        <WidgetEmpty accent={AMETHYST} size={size} message="Nothing logged today"
          hint={slots.map((s) => SLOT_LABEL[s]).join(', ')} />
      ) : tier === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-1">
          <span className="helix-num font-bold text-fluid-lg leading-none" style={{ color: level.color }}>
            {level.label}
          </span>
          <span className="text-[9px] text-muted truncate">
            {SLOT_LABEL[latest!.slot].toLowerCase()} · {logged}/{slots.length}
          </span>
          <SlotDots readings={readings} slots={slots} />
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-1.5">
          <span className="flex items-baseline gap-2 min-w-0">
            <span className="helix-num font-bold text-fluid-xl leading-none" style={{ color: level.color }}>
              {level.label}
            </span>
            {/* The session's cost sits BEFORE the count, because it is the one
                figure here a glance can act on — and it exists only on a
                training day where both ends were answered. */}
            {delta != null && (
              <span className="helix-num text-[10px] font-bold tabular-nums shrink-0 px-1 rounded"
                style={{ color: delta >= 2 ? OXIDE : delta <= 0 ? EMERALD : MUTED }}
                title="After training minus before training">
                {delta > 0 ? '+' : delta < 0 ? '−' : '±'}{Math.abs(delta)}
              </span>
            )}
            <span className="text-[9px] text-muted ml-auto shrink-0 uppercase tracking-[0.1em]">
              {logged} of {slots.length} logged
            </span>
          </span>
          {/* Every slot named, because at medium the QUESTION is how the day
              moved — and a row of dots cannot say which one is the evening. */}
          <span className="grid grid-cols-3 gap-1.5">
            {slots.map((s) => {
              const l = fatigueLevel(readings[s])
              return (
                <span key={s} className="min-w-0 flex flex-col gap-0.5">
                  <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-muted truncate">
                    {SLOT_LABEL[s]}
                  </span>
                  <span className="text-[11px] font-bold leading-none truncate"
                    style={{ color: l?.color ?? MUTED }}>
                    {l?.label ?? '—'}
                  </span>
                </span>
              )
            })}
          </span>
          <span className="block mt-auto">
            <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Today</span>
            <span className="block mt-1"><SlotDots readings={readings} slots={slots} big /></span>
          </span>
        </span>
      )}
    </WidgetFrame>
  )
}

/** One dot per slot, in its own level. Unlogged is a hollow ring, not a gap, so
 *  the row keeps its width as the day fills in. */
function SlotDots({ readings, slots, big = false }: {
  readings: FatigueDay
  /** The slots THIS day asks for — three of the vocabulary's five. */
  slots: readonly FatigueSlot[]
  big?: boolean
}) {
  const d = big ? 8 : 6
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {slots.map((s) => {
        const l = fatigueLevel(readings[s])
        return (
          <span key={s} className="rounded-full shrink-0"
            style={l
              ? { width: d, height: d, background: l.color }
              : { width: d, height: d, border: '1px solid rgba(255,255,255,0.22)' }} />
        )
      })}
    </span>
  )
}

/*
 * ── EVERY WIDGET BODY IS MEMOIZED ────────────────────────────────────────────
 * The dashboard's render prop (`renderWidget` in `app/page.tsx`) is rebuilt
 * whenever any of the page's ~20 data hooks resolves, which walks the grid and
 * calls this file's components again. Before these wrappers, that meant every
 * tile re-ran its layout maths and its charts on every unrelated data change —
 * and the comment on the dashboard claiming the widgets were "memoised where it
 * pays" described something that did not exist anywhere in this directory.
 *
 * Shallow comparison is the whole contract, so it only holds while callers pass
 * stable props: see the hoisted constants and `useMemo`s in `app/page.tsx`,
 * which exist for this reason. A fresh `.map()` or object literal at the call
 * site silently turns these back into plain components.
 */
export const SleepWidget = memo(SleepWidgetImpl)
export const StepsWidget = memo(StepsWidgetImpl)
export const CardioWidget = memo(CardioWidgetImpl)
export const StackWidget = memo(StackWidgetImpl)
export const FatigueWidget = memo(FatigueWidgetImpl)
