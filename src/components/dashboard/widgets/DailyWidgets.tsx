'use client'

import { useMemo, useState } from 'react'
import { RotateCw, Check, Loader2 } from 'lucide-react'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { Bar, HalfArc, Hero, MiniBars, Milestones, Ring, StatTile, Trend, vsBaseline } from './parts'
import { useAddCardio, useLastCardio, useCardioLogs, useZone2Week, ZONE2_WEEKLY_TARGET } from '@/lib/hooks/useCardio'
import { tapLight, tapSuccess } from '@/lib/native/haptics'
import { formatSleep } from '@/lib/utils/format'
import { logicalTodayISO } from '@/lib/utils/day'
import { WIDGET_META, type WidgetSize } from '@/lib/dashboard/layout'
import { SLEEP, AMETHYST, PLATINUM, STEEL, EMERALD, GOLD, OXIDE, SAPPHIRE } from '@/lib/theme/palette'
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

/**
 * Last night, as its stages.
 *
 * ── THE HALF-ARC, AND WHY IT REPLACED THE FULL RING ──────────────────────────
 * The tile drew a full circle, which costs a square. In a 358×172 medium tile a
 * square dial takes 172 of the 358 available px and leaves a column too narrow
 * for the four legend rows that were then squeezed into it — the shape was
 * fighting the tile, and the tile lost.
 *
 * A semicircle carries the identical "fraction of the goal" reading in half the
 * height, and the bowl underneath it is exactly where the number wants to be.
 * It is also the shape Apple's own sleep summary uses, for the same reason, so
 * the tile now reads as a sleep widget before a single label is parsed.
 *
 * The arc's SWEEP is the night against the goal; its SEGMENTS divide that sweep
 * by stage. See `HalfArc` for why it is that way round.
 *
 * It does NOT mount `SleepStages`: that component's smallest variant still
 * draws a histogram of recent nights and assumes a full-width surface.
 * Rendering it in a tile would be a scaled-down drawer, not a widget.
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

  return (
    <WidgetFrame {...WIDGET_META.sleep} size={size} onOpen={onOpen}>
      {total == null ? (
        <WidgetEmpty accent={AMETHYST} size={size} message="Last night is still syncing" hint="Your Watch reports it on first unlock" />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-1.5">
          <Hero value={formatSleep(total)} color={AMETHYST} />
          <Bar value={total} target={goalMin} color={AMETHYST} />
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-1.5">
          <span className="flex items-center gap-2 min-w-0">
            {/* Fixed width, not `flex-1`: the arc's height follows its width at
                a 100:56 ratio, so letting it stretch would make it 190px tall in
                a 130px box. */}
            <span className={`shrink-0 ${size === 'l' ? 'w-[146px]' : 'w-[124px]'}`}>
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
              as a line. Deliberately short — the drawer owns the big chart. */}
          {size === 'l' && (
            <span className="block mt-auto pt-1.5 border-t border-white/[0.06]">
              <span className="flex items-baseline gap-1.5">
                <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Nightly · 30</span>
                {goalMin && (
                  <span className="helix-num text-[8px] tabular-nums text-muted ml-auto">
                    {nightly.filter((n) => n != null && n >= goalMin).length} on target
                  </span>
                )}
              </span>
              <span className="block mt-1"><MiniBars series={nightly} color={AMETHYST} goal={goalMin} height={34} /></span>
            </span>
          )}
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
  const delta = vsBaseline(series, steps)
  const marks = useMemo(() => stepMarks(goal), [goal])
  const hit = series.filter((v) => v != null && v >= goal).length
  const logged = series.filter((v) => v != null).length

  return (
    <WidgetFrame {...WIDGET_META.steps} size={size} onOpen={onOpen}>
      {steps == null ? (
        <WidgetEmpty accent={PLATINUM} size={size} message="Awaiting your first step" hint={`${goal.toLocaleString()} is today's target`} />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-1.5">
          <Hero value={steps} color={PLATINUM} />
          <Bar value={steps} target={goal} color={PLATINUM} />
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-1.5">
          <span className="flex items-baseline gap-2 min-w-0">
            <Hero value={steps} color={PLATINUM} tight />
            <span className="ml-auto shrink-0 flex items-baseline gap-1">
              <Trend delta={delta != null ? Math.round(delta) : null} />
              <span className="text-[8px] text-muted">vs 7-day</span>
            </span>
          </span>

          <Milestones value={steps} marks={marks} color={PLATINUM} />

          <span className="grid grid-cols-3 gap-1.5 pt-0.5">
            <StatTile label="TDEE" value={tdee != null ? Math.round(tdee) : null} unit="kcal" color={STEEL} />
            <StatTile label="Active" value={activeKcal != null ? Math.round(activeKcal) : null} unit="kcal" color={SAPPHIRE} />
            <StatTile label="On target" value={logged ? `${hit}/${logged}` : null} color={hit > 0 ? EMERALD : PLATINUM} />
          </span>

          <span className="block mt-auto pt-1 border-t border-white/[0.06]">
            <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Daily · 30</span>
            <span className="block mt-1">
              <MiniBars series={series} color={PLATINUM} goal={goal} height={size === 'l' ? 46 : 26} />
            </span>
          </span>
        </span>
      )}
    </WidgetFrame>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * ENERGY / BATTERY
 * ──────────────────────────────────────────────────────────────────────────── */

/** How much charge the day has left, and the four readings that decided it. */
export function BatteryWidget({ size, onOpen, batteryPct, score, drivers }: {
  size: WidgetSize
  onOpen?: () => void
  batteryPct: number | null
  score: number | null
  drivers: Array<{ label: string; value: string; color: string }>
}) {
  const color = batteryPct == null ? STEEL : batteryPct >= 60 ? EMERALD : batteryPct >= 30 ? GOLD : OXIDE
  return (
    <WidgetFrame {...WIDGET_META.battery} size={size} onOpen={onOpen}>
      {batteryPct == null ? (
        <WidgetEmpty accent={STEEL} size={size} message="Scoring today" hint="Sleep and vitals set the charge" />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-1.5">
          <Hero value={batteryPct} unit="%" color={color} />
          <Bar value={batteryPct} target={100} color={color} />
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex items-center gap-2.5">
          <span className="relative shrink-0 h-full aspect-square max-h-[118px] grid place-items-center">
            <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
              <Ring pct={batteryPct} color={color} r={42} width={10} />
            </svg>
            <span className="absolute inset-0 grid place-items-center pointer-events-none">
              <span className="text-center leading-none">
                <span className="helix-num block font-bold text-[19px] tabular-nums" style={{ color }}>{batteryPct}</span>
                <span className="block text-[8px] text-muted mt-0.5">% left</span>
              </span>
            </span>
          </span>
          <span className="flex-1 min-w-0 flex flex-col justify-center gap-1">
            {score != null && (
              <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">
                Recovery {Math.round(score)}
              </span>
            )}
            {drivers.map((d) => (
              <span key={d.label} className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-[9px] uppercase tracking-wide text-muted truncate">{d.label}</span>
                <span className="helix-num text-[11px] font-bold tabular-nums ml-auto shrink-0" style={{ color: d.color }}>
                  {d.value}
                </span>
              </span>
            ))}
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
 * ── WHY REPEAT-LAST AND NOT A FORM ───────────────────────────────────────────
 * The walk is the same walk. `useLastCardio` already exists to prefill the day
 * view's form with it — this skips the form entirely. It states the distance and
 * duration ON the control, so it is never a mystery write, and it only appears
 * when there IS a last walk to repeat.
 *
 * Effort and heart rate are deliberately NOT copied forward. Distance and time
 * are properties of the route; how hard it felt and what your heart did are
 * properties of the day, and inventing those would be fabricating a reading.
 */
export function CardioWidget({ size, onOpen }: { size: WidgetSize; onOpen?: () => void }) {
  const today = logicalTodayISO()
  const { data: logs } = useCardioLogs(today)
  const { data: zone2 } = useZone2Week(today)
  const last = useLastCardio('walk')
  const add = useAddCardio(today)
  const [done, setDone] = useState(false)

  const km = useMemo(() => {
    const m = (logs ?? []).reduce((sum, c) => sum + (c.distance_m ?? 0), 0)
    return m > 0 ? Math.round((m / 1000) * 10) / 10 : null
  }, [logs])

  const canRepeat = !!last && (last.distance_m != null || last.duration_min != null)
  const repeatLabel = last
    ? [
      last.distance_m != null ? `${Math.round((last.distance_m / 1000) * 10) / 10} km` : null,
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

  return (
    <WidgetFrame {...WIDGET_META.cardio} size={size} onOpen={onOpen}>
      <span className="flex-1 min-h-0 flex flex-col justify-end gap-1.5">
        {km != null ? (
          <>
            <Hero value={km} unit="km" color={EMERALD} decimals={1} tight={size !== 's'} />
            {zonePips}
          </>
        ) : last ? (
          <>
            <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted">
              Last · {daysAgo(last.date)}
            </span>
            <span className="helix-num font-bold text-fluid-lg leading-none tabular-nums truncate text-muted">
              {last.distance_m != null
                ? <>{Math.round((last.distance_m / 1000) * 10) / 10}<span className="text-[10px] font-normal ml-0.5">km</span></>
                : last.duration_min != null
                  ? <>{Math.round(last.duration_min)}<span className="text-[10px] font-normal ml-0.5">min</span></>
                  : '—'}
            </span>
            <span className="text-[9px] text-muted truncate">
              {[
                KIND_LABEL[last.kind] ?? last.kind,
                last.duration_min != null && last.distance_m != null ? `${Math.round(last.duration_min)}′` : null,
                last.active_kcal != null ? `${Math.round(last.active_kcal)} kcal` : null,
              ].filter(Boolean).join(' · ')}
            </span>
            {size !== 's' && zonePips}
          </>
        ) : (
          <WidgetEmpty accent={EMERALD} size={size} message="No walk logged yet" hint="Log one on the day it happened" />
        )}

        {size !== 's' && canRepeat && (
          <button
            type="button"
            onClick={repeat}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={add.isPending}
            aria-label={`Log another walk — ${repeatLabel}`}
            className="mt-auto inline-flex items-center justify-center gap-1.5 min-h-[34px] rounded-xl
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
 * `slots` arrives already resolved for the day (training vs rest doses, custom
 * supplements folded in) — this component ranks and renders, it does not decide
 * what is in the stack.
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

  const pendingCount = blocks.reduce((n, b) => n + b.items.length, 0)
  // The next block DUE, not the next on the clock: something already overdue
  // outranks something scheduled for this evening.
  const next = blocks[0] ?? null
  const overdue = next != null && next.at < nowMinutes
  const inMin = next != null ? next.at - nowMinutes : null
  const shown = size === 's' ? 2 : 3

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
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-0.5">
          <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted">Next</span>
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
          <span className="text-[10px] truncate pt-0.5" style={{ color: overdue ? OXIDE : 'var(--color-muted)' }}>
            {next.time} · {due(inMin ?? 0)}
          </span>

          {size !== 's' && blocks.length > 1 && (
            <span className="block space-y-0.5 pt-1.5 mt-0.5 border-t border-white/[0.06]">
              {blocks.slice(1, size === 'l' ? 5 : 3).map((b) => (
                <span key={b.time} className="flex items-baseline gap-2 min-w-0">
                  <span className="text-[9px] text-muted truncate flex-1">
                    {b.items.map((i) => i.name).join(' · ')}
                  </span>
                  <span className="helix-num text-[9px] tabular-nums text-muted shrink-0">{b.time}</span>
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
