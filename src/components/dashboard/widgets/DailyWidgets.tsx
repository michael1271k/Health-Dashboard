'use client'

import { useMemo, useState } from 'react'
import { Moon, Footprints, BatteryMedium, Activity, Pill, RotateCw, Check, Loader2 } from 'lucide-react'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { Bar, Cell, Hero, Ring, Spark, Trend, vsBaseline } from './parts'
import { useAddCardio, useLastCardio, useCardioLogs, useZone2Week, ZONE2_WEEKLY_TARGET } from '@/lib/hooks/useCardio'
import { tapLight, tapSuccess } from '@/lib/native/haptics'
import { formatSleep } from '@/lib/utils/format'
import { logicalTodayISO } from '@/lib/utils/day'
import { SLEEP } from '@/lib/theme/palette'
import { AMETHYST, PLATINUM, STEEL, EMERALD, GOLD, OXIDE, SAPPHIRE } from '@/lib/theme/palette'
import type { WidgetSize } from '@/lib/dashboard/layout'
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
 * ── THE HALF-RING IS THE SAME IDEA AS THE DRAWER'S ARC ───────────────────────
 * `SleepStages` renders a full arc, a stage ribbon and a histogram — the whole
 * night, on a surface that has room for it. A tile does not, so this draws the
 * same quantity in the same vocabulary at tile scale: one arc against the goal,
 * with the stage split as the ribbon underneath. Same `SLEEP` hues, same stage
 * order, so the tile and the drawer are recognisably one thing.
 *
 * It does NOT mount `SleepStages` itself: that component's own smallest variant
 * still draws a histogram of recent nights and assumes a full-width surface.
 * Rendering it in a 2×2 would be a scaled-down drawer, not a widget.
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
  const ribbon = parts.reduce((n, p) => n + p.min, 0)
  const pct = total != null && goalMin ? (total / goalMin) * 100 : null

  return (
    <WidgetFrame icon={Moon} label="Sleep" accent={AMETHYST} size={size} onOpen={onOpen}>
      {total == null ? (
        <WidgetEmpty accent={AMETHYST} message="Last night is still syncing" hint="Your Watch reports it on first unlock" />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-1">
          <Hero value={formatSleep(total)} color={AMETHYST} />
          <Bar value={total} target={goalMin} color={AMETHYST} />
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex items-center gap-3">
          <span className="relative shrink-0 h-full aspect-square max-h-[104px] grid place-items-center">
            <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
              <Ring pct={pct} color={AMETHYST} r={42} width={9} />
            </svg>
            <span className="absolute inset-0 grid place-items-center pointer-events-none">
              <span className="text-center leading-none">
                <span className="helix-num block font-bold text-[15px] tabular-nums" style={{ color: AMETHYST }}>
                  {formatSleep(total)}
                </span>
                {goalMin && (
                  <span className="block text-[8px] text-muted mt-0.5">of {Math.round(goalMin / 60)}h</span>
                )}
              </span>
            </span>
          </span>

          <span className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
            {ribbon > 0 ? (
              <>
                {/* The stage ribbon — one bar, four shares, in the order the
                    night spends them. */}
                <span className="flex h-1.5 w-full rounded-full overflow-hidden" aria-hidden="true">
                  {parts.map((p) => (
                    <span key={p.key} style={{ width: `${(p.min / ribbon) * 100}%`, background: p.color }} />
                  ))}
                </span>
                {parts.map((p) => (
                  <span key={p.key} className="flex items-baseline gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} aria-hidden="true" />
                    <span className="text-[9px] uppercase tracking-wide text-muted truncate">{p.label}</span>
                    <span className="helix-num text-[10px] font-bold tabular-nums text-text ml-auto shrink-0">
                      {formatSleep(p.min)}
                    </span>
                  </span>
                ))}
              </>
            ) : (
              <span className="text-[10px] text-muted leading-snug">
                A total only — no stage breakdown was pushed for this night.
              </span>
            )}
          </span>
        </span>
      )}

      {size === 'l' && total != null && (
        <span className="block pt-2 mt-1 border-t border-white/[0.06]">
          <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Nightly · 21 days</span>
          <Spark series={nightly} color={AMETHYST} height={34} />
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
  return (
    <WidgetFrame icon={Footprints} label="Steps" accent={PLATINUM} size={size} onOpen={onOpen}>
      {steps == null ? (
        <WidgetEmpty accent={PLATINUM} message="Awaiting your first step" hint={`${goal.toLocaleString()} is today's target`} />
      ) : (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-1.5">
          <Hero value={steps} color={PLATINUM} tight={size !== 's'} />
          <Bar value={steps} target={goal} color={PLATINUM} />
          {size === 's' ? (
            <span className="text-[9px] text-muted truncate">
              {tdee != null ? `${Math.round(tdee)} kcal TDEE` : activeKcal != null ? `${Math.round(activeKcal)} active` : 'movement'}
            </span>
          ) : (
            <span className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
              <Cell label="Goal" value={goal.toLocaleString()} color={PLATINUM} />
              <Cell label="vs 7-day" value={delta != null ? (delta > 0 ? `+${Math.round(delta)}` : Math.round(delta)) : null} color={delta != null && delta >= 0 ? EMERALD : OXIDE} />
              <Cell label="TDEE" value={tdee != null ? Math.round(tdee) : null} unit="kcal" color={STEEL} />
              <Cell label="Active" value={activeKcal != null ? Math.round(activeKcal) : null} unit="kcal" color={SAPPHIRE} />
            </span>
          )}
          {size === 'l' && <Spark series={series} color={PLATINUM} height={34} />}
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
    <WidgetFrame icon={BatteryMedium} label="Energy" accent={STEEL} size={size} onOpen={onOpen}>
      {batteryPct == null ? (
        <WidgetEmpty accent={STEEL} message="Scoring today" hint="Sleep and vitals set the charge" />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-1">
          <Hero value={batteryPct} unit="%" color={color} />
          <Bar value={batteryPct} target={100} color={color} />
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex items-center gap-3">
          <span className="relative shrink-0 h-full aspect-square max-h-[104px] grid place-items-center">
            <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
              <Ring pct={batteryPct} color={color} r={42} width={9} />
            </svg>
            <span className="absolute inset-0 grid place-items-center pointer-events-none">
              <span className="text-center leading-none">
                <span className="helix-num block font-bold text-[17px] tabular-nums" style={{ color }}>{batteryPct}</span>
                <span className="block text-[8px] text-muted mt-0.5">% left</span>
              </span>
            </span>
          </span>
          <span className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
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

/**
 * Today's cardio, and the fastest possible way to add today's walk.
 *
 * ── WHY REPEAT-LAST AND NOT A FORM ───────────────────────────────────────────
 * The walk is the same walk. `useLastCardio` already exists to prefill the day
 * view's form with it, on the reasoning that "repeating yesterday's loop is the
 * common case and re-typing 3.2 km every time is the friction" — this takes the
 * same fact one step further and skips the form entirely. A form in a 2-column
 * tile would be three cramped fields and a keyboard; a button that says exactly
 * what it will write is one tap and no ambiguity.
 *
 * It states the distance and duration ON the control, so it is never a mystery
 * write — and it only appears when there IS a last walk to repeat, because a
 * button that writes an unknown quantity is worse than no button.
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
      last.duration_min != null ? `${last.duration_min} min` : null,
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

  return (
    <WidgetFrame icon={Activity} label="Cardio" accent={EMERALD} size={size} onOpen={onOpen}>
      <span className="flex-1 min-h-0 flex flex-col justify-end gap-1.5">
        {km == null ? (
          size === 's'
            ? <WidgetEmpty accent={EMERALD} message="No walk logged yet" />
            : <span className="flex-1 min-h-0 flex items-center"><WidgetEmpty accent={EMERALD} message="No walk logged yet" hint={canRepeat ? 'One tap repeats your last one' : 'Log one on the day it happened'} /></span>
        ) : (
          <>
            <Hero value={km} unit="km" color={EMERALD} decimals={1} tight={size !== 's'} />
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
          </>
        )}

        {size !== 's' && canRepeat && (
          <button
            type="button"
            onClick={repeat}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={add.isPending}
            aria-label={`Log another walk — ${repeatLabel}`}
            className="mt-1 inline-flex items-center justify-center gap-1.5 min-h-[36px] rounded-xl
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

/**
 * The protocol, as the next thing to take.
 *
 * ── A COUNT IS NOT AN INSTRUCTION ────────────────────────────────────────────
 * "7/11" says how you are doing and nothing about what to do, which on a
 * schedule with named times is the wrong half of the fact. The next unticked
 * slot and the time it is due is an instruction, and the count still rides
 * along underneath for the days you want to know where you stand.
 *
 * `slots` arrives already resolved for the day (training vs rest doses, custom
 * supplements folded in) — this component ranks and renders, it does not decide
 * what is in the stack.
 */
export function StackWidget({ size, onOpen, slots, taken, nowMinutes }: {
  size: WidgetSize
  onOpen?: () => void
  /** Today's slots — `key`, display name, and `HH:MM` due time. */
  slots: Array<{ key: string; name: string; time: string }>
  taken: ReadonlySet<string>
  /** Minutes since local midnight, so "next" is decided by the caller's clock. */
  nowMinutes: number
}) {
  const parseMin = (t: string): number => {
    const [h, m] = t.split(':').map(Number)
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 24 * 60
  }

  const pending = useMemo(
    () => slots
      .filter((s) => !taken.has(s.key))
      .map((s) => ({ ...s, at: parseMin(s.time) }))
      .sort((a, b) => a.at - b.at),
    [slots, taken],
  )

  // The next one DUE, not the next one on the clock: something already overdue
  // outranks something scheduled for this evening.
  const next = pending[0] ?? null
  const overdue = next != null && next.at < nowMinutes
  const inMin = next != null ? next.at - nowMinutes : null

  const due = (mins: number): string => {
    if (mins < 0) return `${Math.abs(mins) < 60 ? `${Math.abs(mins)} min` : `${Math.floor(Math.abs(mins) / 60)}h`} overdue`
    if (mins < 1) return 'now'
    if (mins < 60) return `in ${mins} min`
    return `in ${Math.floor(mins / 60)}h ${mins % 60 ? `${mins % 60}m` : ''}`.trim()
  }

  return (
    <WidgetFrame icon={Pill} label="Stack" accent={GOLD} size={size} onOpen={onOpen}>
      {!slots.length ? (
        <WidgetEmpty accent={GOLD} message="No protocol for today" hint="Rest days drop the training-only doses" />
      ) : !next ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-1">
          <span className="helix-num font-bold text-fluid-lg leading-none" style={{ color: EMERALD }}>
            {slots.length}/{slots.length}
          </span>
          <span className="text-[9px] truncate" style={{ color: EMERALD }}>protocol complete</span>
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">Next</span>
          <span className="helix-num font-bold text-[15px] leading-tight truncate" style={{ color: GOLD }}>
            {next.name}
          </span>
          <span className="text-[10px] truncate" style={{ color: overdue ? OXIDE : 'var(--color-muted)' }}>
            {next.time} · {due(inMin ?? 0)}
          </span>

          {size !== 's' && pending.length > 1 && (
            <span className="block space-y-0.5 pt-1.5 mt-0.5 border-t border-white/[0.06]">
              {pending.slice(1, size === 'l' ? 6 : 3).map((s) => (
                <span key={s.key} className="flex items-baseline gap-2 min-w-0">
                  <span className="text-[9px] text-muted truncate flex-1">{s.name}</span>
                  <span className="helix-num text-[9px] tabular-nums text-muted shrink-0">{s.time}</span>
                </span>
              ))}
            </span>
          )}

          <span className="flex items-center gap-1.5 pt-1">
            <span className="flex-1"><Bar value={slots.length - pending.length} target={slots.length} color={GOLD} /></span>
            <span className="helix-num text-[9px] font-bold tabular-nums shrink-0" style={{ color: GOLD }}>
              {slots.length - pending.length}/{slots.length}
            </span>
          </span>
        </span>
      )}
    </WidgetFrame>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * TRAIN — today's session as it stands
 * ──────────────────────────────────────────────────────────────────────────── */

/** Today's training, or the last one, with its tonnage. */
export function TrainWidget({ size, onOpen, title, status, volumeKg, unit, done }: {
  size: WidgetSize
  onOpen?: () => void
  title: string
  status: string
  volumeKg: number | null
  unit: string
  done: boolean
}) {
  return (
    <WidgetFrame icon={Activity} label="Train" accent={EMERALD} size={size} onOpen={onOpen}>
      <span className="flex-1 min-h-0 flex flex-col justify-end gap-1">
        <span className="helix-num font-bold text-fluid-lg leading-tight truncate" style={{ color: EMERALD }}>
          {title}
        </span>
        <span className="text-[9px] truncate" style={{ color: done ? EMERALD : 'var(--color-muted)' }}>{status}</span>
        {size !== 's' && volumeKg != null && (
          <span className="flex items-baseline gap-1.5 pt-1 mt-0.5 border-t border-white/[0.06]">
            <span className="text-[9px] uppercase tracking-wide text-muted">Volume</span>
            <span className="helix-num text-[13px] font-bold tabular-nums ml-auto" style={{ color: EMERALD }}>
              {volumeKg}<span className="text-[9px] font-normal text-muted ml-0.5">{unit}</span>
            </span>
          </span>
        )}
      </span>
    </WidgetFrame>
  )
}

export { Trend }
