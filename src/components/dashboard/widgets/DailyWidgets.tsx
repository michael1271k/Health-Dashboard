'use client'

import { useMemo, useState } from 'react'
import { RotateCw, Check, Loader2, Timer, HeartPulse, Flame, Ruler } from 'lucide-react'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { Bar, HalfArc, Hero, MiniBars, Milestones, StatTile, Trend, vsBaseline } from './parts'
import { useAddCardio, useLastCardio, useCardioLogs, useZone2Week, ZONE2_WEEKLY_TARGET } from '@/lib/hooks/useCardio'
import { activeKcalOf, distanceKm, formatPace, paceMinPerKm } from '@/lib/cardio/metrics'
import { tapLight, tapSuccess } from '@/lib/native/haptics'
import { formatSleep } from '@/lib/utils/format'
import { logicalTodayISO } from '@/lib/utils/day'
import { WIDGET_META, type WidgetSize } from '@/lib/dashboard/layout'
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
export function SleepWidget({ size, onOpen, sleep, sleepMin, goalHours, nightly }: {
  size: WidgetSize
  onOpen?: () => void
  sleep: Tables<'sleep_sessions'> | null
  /** Fallback total for legacy nights that only ever pushed a duration. */
  sleepMin: number | null
  goalHours: number | null
  /** Recent nightly totals in minutes, oldest first. */
  nightly: Array<number | null>
}) {
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

  const strip = (down || efficiency != null || sleep?.sleep_score != null) && (
    <span className="flex items-baseline gap-2 min-w-0 pt-1 mt-auto border-t border-white/[0.06]">
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
      ) : size === 's' ? (
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
        <span className="flex-1 min-h-0 flex flex-col gap-1">
          <span className="flex items-center gap-2 min-w-0">
            {/* Fixed width, not `flex-1`: the arc's height follows its width at
                a 100:56 ratio, so letting it stretch would make it 190px tall in
                a 130px box. */}
            <span className={`shrink-0 ${size === 'l' ? 'w-[136px]' : 'w-[118px]'}`}>
              <HalfArc pct={pct} segments={segments} width={10}>
                <span className="text-center leading-none">
                  <span className="helix-num block font-bold text-[17px] tabular-nums" style={{ color: AMETHYST }}>
                    {formatSleep(total)}
                  </span>
                  {goalMin && <span className="block text-[8px] text-muted mt-0.5">of {Math.round(goalMin / 60)}h</span>}
                </span>
              </HalfArc>
            </span>

            <span className="flex-1 min-w-0 flex flex-col justify-center gap-1">
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
            </span>
          </span>

          {/* Large adds the month, as bars: a night either cleared the goal or
              did not, and thirty separate verdicts are countable as bars and not
              as a line. It sits DIRECTLY under the arc row — it used to be
              pushed to the bottom with `mt-auto`, which opened the gap it was
              supposed to be filling. */}
          {size === 'l' && (
            <span className="block pt-1 border-t border-white/[0.06]">
              <span className="flex items-baseline gap-1.5">
                <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Nightly · 30</span>
                {goalMin && (
                  <span className="helix-num text-[8px] tabular-nums text-muted ml-auto">
                    {nightly.filter((n) => n != null && n >= goalMin).length} on target
                  </span>
                )}
              </span>
              <span className="block mt-1"><MiniBars series={nightly} color={AMETHYST} goal={goalMin} height={70} /></span>
            </span>
          )}

          {strip}
        </span>
      )}
    </WidgetFrame>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * STEPS
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The waypoints a person actually reasons in, up to the goal.
 *
 * Derived from the goal rather than hardcoded at 2/4/6/8/10k: the goal is a
 * user setting, and a fixed ladder would put five marks under a 6,000-step goal
 * with three of them already past the end of the track.
 */
export function stepMarks(goal: number): number[] {
  const step = Math.max(500, Math.round(goal / 5 / 500) * 500)
  const marks = [step, step * 2, step * 3, step * 4].filter((v) => v < goal)
  return [...marks, goal]
}

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
export function StepsWidget({ size, onOpen, steps, goal, tdee, activeKcal, series }: {
  size: WidgetSize
  onOpen?: () => void
  steps: number | null
  goal: number
  tdee: number | null
  activeKcal: number | null
  series: Array<number | null>
}) {
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
      ) : size === 's' ? (
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
        <span className="flex-1 min-h-0 flex flex-col gap-1">
          <span className="flex items-baseline gap-2 min-w-0">
            <Hero value={steps} color={PLATINUM} tight />
            <span className="ml-auto shrink-0 flex items-baseline gap-1">
              <Trend delta={delta != null ? Math.round(delta) : null} />
              <span className="text-[8px] text-muted">vs 7-day</span>
            </span>
          </span>

          <Milestones value={steps} marks={marks} color={PLATINUM} />

          <span className="grid grid-cols-3 gap-1.5">
            <StatTile label="TDEE" value={tdee != null ? Math.round(tdee) : null} unit="kcal" color={STEEL} />
            <StatTile label="Active" value={activeKcal != null ? Math.round(activeKcal) : null} unit="kcal" color={SAPPHIRE} />
            <StatTile label="On target" value={logged ? `${hit}/${logged}` : null} color={hit > 0 ? EMERALD : PLATINUM} />
          </span>

          {/* No `mt-auto`: pushing the chart to the floor is what opened the gap
              between it and the tiles above. It sits directly under them and
              takes the slack as HEIGHT instead. */}
          <span className="block pt-1 border-t border-white/[0.06]">
            <span className="flex items-baseline gap-1.5">
              <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Daily · 30</span>
              {best != null && (
                <span className="helix-num text-[8px] tabular-nums text-muted ml-auto">
                  best {best.toLocaleString()}
                </span>
              )}
            </span>
            <span className="block mt-1">
              <MiniBars series={series} color={PLATINUM} goal={goal} height={size === 'l' ? 96 : 24} />
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
  const n = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${iso}T12:00:00Z`)) / 86_400_000)
  if (n <= 0) return 'today'
  if (n === 1) return 'yesterday'
  return `${n}d ago`
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
export function CardioWidget({ size, onOpen }: { size: WidgetSize; onOpen?: () => void }) {
  const today = logicalTodayISO()
  const { data: logs } = useCardioLogs(today)
  const { data: zone2 } = useZone2Week(today)
  const last = useLastCardio('walk')
  const add = useAddCardio(today)
  const [done, setDone] = useState(false)

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
      onSuccess: () => { setDone(true); void tapSuccess(); setTimeout(() => setDone(false), 2200) },
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
        size === 's' ? (
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
          {size === 's' ? (
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

          {size !== 's' && canRepeat && (
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

export interface StackSlot { key: string; name: string; time: string }

/** `HH:MM` → minutes since midnight. An unparseable time sorts to the end. */
function parseMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 24 * 60
}

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
export function StackWidget({ size, onOpen, slots, taken, nowMinutes }: {
  size: WidgetSize
  onOpen?: () => void
  /** Today's doses — `key`, display name, and `HH:MM` due time. */
  slots: StackSlot[]
  taken: ReadonlySet<string>
  /** Minutes since local midnight, so "next" is decided by the caller's clock. */
  nowMinutes: number
}) {
  /** Untaken items, collapsed into the time blocks they are actually taken in. */
  const blocks = useMemo(() => {
    const byTime = new Map<string, StackSlot[]>()
    for (const s of slots) {
      if (taken.has(s.key)) continue
      const list = byTime.get(s.time)
      if (list) list.push(s)
      else byTime.set(s.time, [s])
    }
    return [...byTime.entries()]
      .map(([time, items]) => ({ time, items, at: parseMin(time) }))
      .sort((a, b) => a.at - b.at)
  }, [slots, taken])

  /** What is already behind you, most recent first. */
  const done = useMemo(
    () => slots.filter((s) => taken.has(s.key)).sort((a, b) => parseMin(b.time) - parseMin(a.time)),
    [slots, taken],
  )

  const pendingCount = blocks.reduce((n, b) => n + b.items.length, 0)
  // The next block DUE, not the next on the clock: something already overdue
  // outranks something scheduled for this evening.
  const next = blocks[0] ?? null
  const overdue = next != null && next.at < nowMinutes
  const inMin = next != null ? next.at - nowMinutes : null
  // Small shows THREE, not two: a morning block is routinely three tablets and
  // a tile that named two of them plus "+1 more" was making the reader open it
  // to learn a word it had room for.
  const shown = size === 's' ? 3 : 4

  const due = (mins: number): string => {
    if (mins < 0) return `${Math.abs(mins) < 60 ? `${Math.abs(mins)} min` : `${Math.floor(Math.abs(mins) / 60)}h`} overdue`
    if (mins < 1) return 'now'
    if (mins < 60) return `in ${mins} min`
    return `in ${Math.floor(mins / 60)}h ${mins % 60 ? `${mins % 60}m` : ''}`.trim()
  }

  return (
    <WidgetFrame {...WIDGET_META.stack} size={size} onOpen={onOpen}>
      {!slots.length ? (
        <WidgetEmpty accent={GOLD} size={size} message="No protocol for today" hint="Rest days drop the training-only doses" />
      ) : !next ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-1">
          <span className="helix-num font-bold text-fluid-lg leading-none" style={{ color: EMERALD }}>
            {slots.length}/{slots.length}
          </span>
          <span className="text-[9px] truncate" style={{ color: EMERALD }}>protocol complete</span>
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-0.5">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted">Next</span>
            <span className="text-[9px] truncate ml-auto" style={{ color: overdue ? OXIDE : 'var(--color-muted)' }}>
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

          {size !== 's' && (
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
              {done.slice(0, 3).map((d) => (
                <span key={d.key} className="flex items-baseline gap-2 min-w-0">
                  <Check className="w-2.5 h-2.5 shrink-0" strokeWidth={3} style={{ color: EMERALD }} aria-hidden="true" />
                  <span className="text-[9px] truncate flex-1 line-through" style={{ color: `${EMERALD}b0` }}>
                    {d.name}
                  </span>
                  <span className="helix-num text-[9px] tabular-nums text-muted shrink-0">{d.time}</span>
                </span>
              ))}
            </span>
          )}

          <span className="flex items-center gap-1.5 pt-1 mt-auto">
            <span className="flex-1"><Bar value={slots.length - pendingCount} target={slots.length} color={GOLD} /></span>
            <span className="helix-num text-[9px] font-bold tabular-nums shrink-0" style={{ color: GOLD }}>
              {slots.length - pendingCount}/{slots.length}
            </span>
          </span>
        </span>
      )}
    </WidgetFrame>
  )
}

export { Trend }
