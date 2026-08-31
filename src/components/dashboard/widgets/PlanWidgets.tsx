'use client'

import { memo, useMemo } from 'react'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { BalanceBars, Hero, Heatmap, StatTile, type ConsistencyDay } from './parts'
import { useEnergyBalance, weeklyRateKg, KCAL_PER_KG } from '@/lib/hooks/useEnergyBalance'
import { useSessionHistory } from '@/lib/hooks/useSessionHistory'
import { useNextTraining } from '@/lib/hooks/useNextTraining'
import { useExerciseBaselines } from '@/lib/hooks/useExerciseBaselines'
import { baselineIndex } from '@/lib/training/prEngine'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { scheduleDayFor } from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'
import { isoAddDays } from '@/lib/utils/week'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { dayColor, EMERALD, OXIDE, GOLD, MUTED, REST, STEEL } from '@/lib/theme/palette'
import { phaseSpanFor } from '@/lib/phases'
import { exerciseColor } from '@/lib/theme/muscleHue'
import { WIDGET_META, type WidgetSize } from '@/lib/dashboard/layout'

/* ────────────────────────────────────────────────────────────────────────────
 * DEFICIT LEDGER
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The shortest window the ledger will report a rate from.
 *
 * A rate computed from three days is a rate computed from three days, and on a
 * cut those three days routinely include a refeed. Below this the arithmetic is
 * still arithmetic but the answer is noise wearing a decimal point.
 */
const LEDGER_FLOOR_DAYS = 14

/** The most it will ever sum. Beyond a month the early days describe a body that
 *  no longer exists. */
const LEDGER_MAX_DAYS = 30

/**
 * How many days this ledger should weigh, and how many of them belong to the
 * current phase.
 *
 * ── WHY A FLAT 30 DAYS WAS WRONG ─────────────────────────────────────────────
 * The tile summed a rolling month regardless of what had happened in it. On the
 * day a phase turns — a cut becoming a maintenance week, which happens on
 * 2026-08-30 — that window is 29 days of one calorie target and 1 of another,
 * averaged into a single "kg/wk" presented as the slope you are on. It is not:
 * it is the slope you WERE on, dragged one day toward the new one, and it stays
 * wrong for a month.
 *
 * ── AND WHY IT DOES NOT JUST USE THE PHASE ───────────────────────────────────
 * Because a phase that started on Tuesday would then report a two-day rate, and
 * a two-day rate on a cut is mostly water. So the window is phase-to-date, and
 * when the phase is younger than the floor it reaches BACK past the boundary to
 * make up the difference — those days are drawn dimmed, so the chart says which
 * part of the number belongs to the regime you are actually in.
 */
export function ledgerWindow(todayISO: string): { days: number; inPhase: number; label: string | null } {
  const span = phaseSpanFor(todayISO)
  if (!span) return { days: LEDGER_MAX_DAYS, inPhase: LEDGER_MAX_DAYS, label: null }
  const inPhase = Math.min(span.dayIndex + 1, LEDGER_MAX_DAYS)
  return {
    days: Math.min(LEDGER_MAX_DAYS, Math.max(inPhase, LEDGER_FLOOR_DAYS)),
    inPhase,
    label: `${span.def.short ?? span.def.name} · day ${span.dayIndex + 1}`,
  }
}

/**
 * What the last month of eating is actually worth, as a rate.
 *
 * ── A RATE, NOT A DATE ───────────────────────────────────────────────────────
 * "Goal weight by 14 November" is a projection built on a chain of assumptions —
 * that the deficit holds, that expenditure does not fall as mass does, that the
 * target is still the target — and it is wrong every single day in a way the
 * reader can check. `−0.42 kg/wk` claims only what the arithmetic supports: this
 * is the slope you are on. It also degrades honestly, because a rate computed
 * from nine days is still a rate, whereas a date computed from nine days is a
 * fabrication with a calendar attached.
 *
 * ── TWO RATES, BECAUSE THEY DISAGREE AND THAT IS THE POINT ───────────────────
 * The LEDGER rate is what the energy balance predicts: mean daily balance × 7 ÷
 * 7,700. The SCALE rate is the least-squares slope of what you actually weighed.
 * They come apart constantly — water, glycogen and gut content move faster than
 * fat can — and a tile that showed only one of them would be either a model
 * pretending to be a measurement or a measurement pretending to be a trend.
 * Shown side by side, the gap between them is itself the reading: a ledger far
 * ahead of the scale usually means the intake figures are optimistic.
 *
 * Days with a hole in them are counted OUT, not counted as zero — see
 * `useEnergyBalance`. The tile says how many days it summed for that reason.
 */
function DeficitWidgetImpl({ size, onOpen }: { size: WidgetSize; onOpen?: () => void }) {
  const today = logicalTodayISO()
  const window = useMemo(() => ledgerWindow(today), [today])
  const { data: days } = useEnergyBalance(window.days)
  const rows = useMemo(() => days ?? [], [days])

  const ledger = useMemo(() => {
    const scored = rows.filter((r) => r.balance != null)
    if (!scored.length) return null
    const total = scored.reduce((n, r) => n + (r.balance ?? 0), 0)
    const perDay = total / scored.length
    return {
      counted: scored.length,
      total: Math.round(total),
      perDay: Math.round(perDay),
      kgPerWeek: Math.round(((perDay * 7) / KCAL_PER_KG) * 100) / 100,
    }
  }, [rows])

  const scaleRate = useMemo(() => weeklyRateKg(rows), [rows])
  const today_ = rows[rows.length - 1] ?? null
  const unit = weightUnit()

  // A deficit is a NEGATIVE balance, so the good direction is down. Both rates
  // wear the same rule, which is why neither carries its own opinion about it.
  const rateColor = (v: number | null) => (v == null ? MUTED : v < 0 ? EMERALD : OXIDE)
  const fmtRate = (v: number | null) => (v == null ? null : `${v > 0 ? '+' : ''}${displayWeight(v)?.toFixed(2) ?? v.toFixed(2)}`)

  const balances = rows.map((r) => r.balance)

  return (
    <WidgetFrame {...WIDGET_META.deficit} size={size} onOpen={onOpen}>
      {!ledger ? (
        <WidgetEmpty accent={MACRO_COLORS.calories} size={size} message="No complete day to weigh yet"
          hint="A day needs BMR, active energy and an intake before it counts" />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-0.5">
          <Hero value={fmtRate(ledger.kgPerWeek)} unit={`${unit}/wk`} color={rateColor(ledger.kgPerWeek)} />
          <span className="helix-num text-[9px] tabular-nums truncate">
            {/* TODAY, in the verdict colour. The small tile showed only the
                trailing mean, so the one figure you can still act on before
                midnight was the one figure it did not carry. */}
            <span style={{ color: today_?.balance != null ? (today_.balance < 0 ? EMERALD : OXIDE) : MUTED }}>
              {today_?.balance != null ? `${today_.balance > 0 ? '+' : ''}${today_.balance} today` : '— today'}
            </span>
            <span className="text-muted"> · {ledger.perDay > 0 ? '+' : ''}{ledger.perDay}/day · {ledger.counted}d</span>
          </span>
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-1.5">
          <span className="flex items-baseline gap-2 min-w-0">
            <Hero value={fmtRate(ledger.kgPerWeek)} unit={`${unit}/wk`} color={rateColor(ledger.kgPerWeek)} tight />
            <span className="ml-auto shrink-0 text-[8px] text-muted uppercase tracking-[0.1em]">
              {/* The phase AND the count. The count is not decoration: days
                  with a hole are left OUT of the mean rather than zeroed, and
                  this is the only place the tile admits how many that was.
                  Replacing it with the phase name hid a real caveat. */}
                  {window.label && <>{window.label} · </>}
                  {ledger.counted} of {window.days} days
            </span>
          </span>

          <span className="grid grid-cols-3 gap-1.5">
            <StatTile label="Today" value={today_?.balance ?? null} unit="kcal"
              color={today_?.balance != null && today_.balance < 0 ? EMERALD : OXIDE} />
            <StatTile label="Per day" value={ledger.perDay} unit="kcal" color={rateColor(ledger.perDay)} />
            <StatTile label="Scale" value={fmtRate(scaleRate)} unit={`${unit}/wk`} color={rateColor(scaleRate)} />
          </span>

          <span className="block mt-auto">
            <span className="flex items-baseline gap-1.5">
              <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">
                Balance · {size === 'l' ? window.days : Math.min(14, window.days)} days
              </span>
              <span className="helix-num text-[8px] tabular-nums text-muted ml-auto">
                {ledger.total > 0 ? '+' : ''}{ledger.total.toLocaleString()} kcal banked
              </span>
            </span>
            <span className="block mt-1">
              <BalanceBars
                values={size === 'l' ? balances : balances.slice(-14)}
                under={EMERALD}
                over={OXIDE}
                height={size === 'l' ? 62 : 34}
                // Everything before the phase boundary is another regime's
                // eating, borrowed only to reach the 14-day floor.
                dimBefore={Math.max(0, (size === 'l' ? balances.length : Math.min(14, balances.length)) - window.inPhase)}
                zeroLabel={window.label
                  ? `dimmed bars precede ${window.label.split(' · ')[0]} · the line is maintenance`
                  : 'the line is maintenance — under it is a deficit'}
              />
            </span>
          </span>
        </span>
      )}
    </WidgetFrame>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE BAR TO BEAT
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The loads standing between you and a record, for the session you are walking into.
 *
 * ── IT IS THE BASELINE, NOT THE RECORD BOOK ──────────────────────────────────
 * `personal_records` holds standing rows keyed by exercise and axis, and it is
 * dated AFTER the sets Helix actually has — reading it directly would erase the
 * sessions that set the records in it (`prTruth.ts` explains at length). The
 * live logger judges every set against `useExerciseBaselines`, which folds the
 * logged history together with the asserted floor for the four months of
 * sessions that carry no sets. This tile reads the SAME baselines, so the number
 * it tells you to beat is the number the badge will actually fire on. Anything
 * else would be a tile that promised a record the logger then refused.
 *
 * `beforeDate` is today, exclusive: a session logged this morning must not
 * become the bar for the session you are about to do this evening.
 */
function BarToBeatWidgetImpl({ size, onOpen }: { size: WidgetSize; onOpen?: () => void }) {
  const next = useNextTraining()
  const names = useMemo(() => (next?.exercises ?? []).map((e) => e.name), [next])
  const { data: baselines } = useExerciseBaselines(names, logicalTodayISO())
  const unit = weightUnit()

  const rows = useMemo(() => {
    const idx = baselineIndex(baselines)
    return (next?.exercises ?? []).map((e) => ({
      name: e.name,
      reps: e.reps,
      // `bestWeight` is the heaviest load ever handled; `bestE1rm` is what that
      // load and its reps imply. Both are stated because they are beaten by
      // different sets — a heavier single and a better set at the old load.
      weightKg: idx.bestWeight.get(e.name) ?? null,
      e1rm: idx.bestE1rm.get(e.name) ?? null,
    }))
  }, [next, baselines])

  const shown = size === 's' ? 1 : size === 'm' ? 3 : rows.length

  return (
    <WidgetFrame {...WIDGET_META.bar} size={size} onOpen={onOpen}>
      {!next || !rows.length ? (
        <WidgetEmpty accent={GOLD} size={size} message="No session on the horizon"
          hint="The next scheduled workout sets the bar" />
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-1">
          <span className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-[8px] font-bold uppercase tracking-[0.12em] truncate"
              style={{ color: dayColor(next.dayKey) }}>
              {next.isToday ? 'Today' : next.day.label}
            </span>
            {/* "{withBar}/{rows.length} have a bar" lived here. It counted a
                thing nobody is trying to maximise — how much of your own history
                exists — and it sat in the tile's most prominent free slot. The
                lifts with no bar say so themselves, in their own row, with a
                dash. */}
          </span>

          {size === 's' ? (
            <span className="flex-1 min-h-0 flex flex-col justify-end gap-0.5">
              <Hero
                value={rows[0].weightKg != null ? displayWeight(rows[0].weightKg) : null}
                unit={unit} color={GOLD} decimals={1}
              />
              <span className="text-[10px] text-text truncate">{rows[0].name}</span>
              <span className="text-[9px] text-muted truncate">
                {rows[0].e1rm != null ? `${displayWeight(rows[0].e1rm)}${unit} 1RM to beat` : 'first run — set the bar'}
              </span>
            </span>
          ) : (
            <span className="flex flex-col gap-1 flex-1 min-h-0 overflow-hidden">
              {rows.slice(0, shown).map((r) => (
                <span key={r.name} className="grid items-baseline gap-2 min-w-0"
                  style={{ gridTemplateColumns: 'minmax(0,1fr) 2.6rem 3.5rem 2.75rem' }}>
                  {/* The lift wears its own primary mover's colour, so the muscle
                      family reads down the column without a legend — the same
                      `exerciseColor` the logger's exercise band uses. */}
                  <span className="text-[10px] truncate" style={{ color: exerciseColor(r.name) }}>{r.name}</span>
                  <span className="text-[8px] text-muted tabular-nums text-right">{r.reps}</span>
                  <span className="helix-num text-[11px] font-bold tabular-nums text-right"
                    style={{ color: r.weightKg != null ? GOLD : MUTED }}>
                    {r.weightKg != null ? `${displayWeight(r.weightKg)}${unit}` : '—'}
                  </span>
                  <span className="helix-num text-[9px] tabular-nums text-right text-muted">
                    {r.e1rm != null ? `${displayWeight(r.e1rm)}` : '—'}
                  </span>
                </span>
              ))}
              {rows.length > shown && (
                <span className="text-[9px] text-muted">+{rows.length - shown} more lifts</span>
              )}
              <span className="grid items-baseline gap-2 mt-auto pt-1 border-t border-white/[0.06]
                               text-[7px] font-bold uppercase tracking-[0.1em] text-muted/70"
                style={{ gridTemplateColumns: 'minmax(0,1fr) 2.6rem 3.5rem 2.75rem' }}>
                <span className="truncate">Lift</span>
                <span className="text-right">Reps</span>
                <span className="text-right">Load</span>
                <span className="text-right">1RM</span>
              </span>
            </span>
          )}
        </span>
      )}
    </WidgetFrame>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * CONSISTENCY
 * ──────────────────────────────────────────────────────────────────────────── */

/** Trailing weeks drawn, and the cell geometry that fits them, per size. */
const GRID: Record<WidgetSize, { weeks: number; cell: number; gap: number }> = {
  s: { weeks: 12, cell: 5, gap: 1 },
  m: { weeks: 26, cell: 7, gap: 2 },
  l: { weeks: 52, cell: 4, gap: 2 },
  // Consistency has no wide body — `WIDGET_SIZES` does not offer it either size,
  // so neither entry is reachable. They exist because the map is exhaustive over
  // `WidgetSize` and an exhaustive map is what makes adding a size a compile
  // error in every place that has to answer for it, which is the point.
  w: { weeks: 52, cell: 4, gap: 2 },
  xl: { weeks: 52, cell: 4, gap: 2 },
}

/**
 * How many days `Heatmap` will actually draw for `weeks` columns ending today.
 *
 * The grid is week-aligned: its last column is the current, partial week, so it
 * winds back to the Sunday that opens the earliest column. That is
 * `(weeks - 1) * 7` whole weeks plus however many days of this week have already
 * happened — NOT `weeks * 7`, and certainly not `weeks * 7 + 7`.
 *
 * Exported so the widget and the chart cannot answer this differently, which is
 * exactly how they came to disagree.
 */
export function consistencyWindow(weeks: number, todayISO: string): number {
  const dow = new Date(`${todayISO}T12:00:00Z`).getUTCDay()
  return (weeks - 1) * 7 + dow + 1
}

/**
 * A year of showing up.
 *
 * ── A PRESCRIBED REST DAY IS A SUCCESS ───────────────────────────────────────
 * Filled, at lower opacity, never empty. A grid that only lights on training
 * days grades a five-day program at 71 % in perpetuity and teaches the reader
 * that Wednesday is a failure — which is the belief that gets people training on
 * the day the plan told them to recover. Adaptation is what the rest day is FOR.
 * Only a scheduled session that never happened leaves a hole.
 *
 * Adherence is therefore `trained ÷ (trained + missed)` — rest days are neither
 * numerator nor denominator, because a day the plan did not ask for work on
 * cannot be work you skipped.
 *
 * ── AND WHY EACH CELL WEARS ITS OWN SPLIT'S HUE ──────────────────────────────
 * `dayColor` gives Upper A and Legs B different colours everywhere else in the
 * app. Carried into the grid, a year stops being a wall of one green and becomes
 * a legible pattern: a block where the Friday column changes colour is a block
 * where the split moved, which is a thing you would otherwise have to go and
 * look up.
 */
function ConsistencyWidgetImpl({ size, onOpen }: { size: WidgetSize; onOpen?: () => void }) {
  const { data: sessions } = useSessionHistory()
  const scheduleVersion = useScheduleVersion()
  const today = logicalTodayISO()
  const { weeks, cell, gap } = GRID[size]

  const days = useMemo(() => {
    void scheduleVersion   // scheduleDayFor reads the store; this is the read
    const logged = new Map((sessions ?? []).map((s) => [s.date, s]))
    const out: ConsistencyDay[] = []
    // ── ONE WINDOW, SCORED AND DRAWN ─────────────────────────────────────────
    // This was `weeks * 7 + 7`, while `Heatmap` draws exactly `weeks` columns
    // ending on today — so the headline "% kept" was computed over up to two
    // weeks of days the grid never showed. The number and the picture described
    // different windows, and the number was the one nobody could check.
    //
    // `consistencyWindow` is now the single answer, and `Heatmap` is handed the
    // same day list it grades.
    const span = consistencyWindow(weeks, today)
    for (let back = span - 1; back >= 0; back -= 1) {
      const date = isoAddDays(today, -back)
      const hit = logged.get(date)
      const plan = scheduleDayFor(date)
      const color = dayColor(hit?.dayKey ?? (plan === 'rest' ? null : plan.dayKey), hit?.splitDay)
      if (hit) out.push({ date, state: 'trained', color })
      else if (plan === 'rest') out.push({ date, state: 'rest', color: REST })
      else if (date >= today) out.push({ date, state: 'future' })
      else out.push({ date, state: 'missed' })
    }
    return out
  }, [sessions, today, weeks, scheduleVersion])

  const stats = useMemo(() => {
    const past = days.filter((d) => d.state !== 'future')
    const trained = past.filter((d) => d.state === 'trained').length
    const missed = past.filter((d) => d.state === 'missed').length
    const rest = past.filter((d) => d.state === 'rest').length
    const asked = trained + missed
    // The current run of days that did NOT miss — rest days keep it alive,
    // which is the whole claim the chart is making.
    let run = 0
    for (let i = past.length - 1; i >= 0; i -= 1) {
      if (past[i].state === 'missed') break
      run += 1
    }
    return {
      trained, missed, rest, run,
      pct: asked > 0 ? Math.round((trained / asked) * 100) : null,
    }
  }, [days])

  return (
    <WidgetFrame {...WIDGET_META.consistency} size={size} onOpen={onOpen}>
      {!days.length ? (
        <WidgetEmpty accent={EMERALD} size={size} message="Nothing to show yet" hint="Every logged session fills a square" />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-1">
          <Hero value={stats.pct} unit="%" color={stats.pct != null && stats.pct >= 85 ? EMERALD : GOLD} />
          <Heatmap days={days} weeks={weeks} cell={cell} gap={gap} />
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-1.5">
          <span className="flex items-baseline gap-2 min-w-0">
            <Hero value={stats.pct} unit="% kept" color={stats.pct != null && stats.pct >= 85 ? EMERALD : GOLD} tight />
            <span className="helix-num text-[9px] tabular-nums text-muted ml-auto shrink-0">
              {stats.run}-day run
            </span>
          </span>

          <span className="grid grid-cols-3 gap-1.5">
            <StatTile label="Trained" value={stats.trained} color={EMERALD} />
            {/* STEEL, not REST: REST is a FILL tone, deliberately desaturated so a rest
                cell cannot compete with a family hue. As 11px numerals on obsidian it
                fails contrast. The grid cell carries the token; the readout stays legible. */}
            <StatTile label="Rest kept" value={stats.rest} color={STEEL} />
            <StatTile label="Missed" value={stats.missed} color={stats.missed > 0 ? OXIDE : EMERALD} />
          </span>

          <span className="block mt-auto">
            <span className="flex items-baseline gap-1.5">
              <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">
                {weeks} weeks
              </span>
              <span className="text-[8px] text-muted ml-auto">solid trained · faded rest · empty missed</span>
            </span>
            <span className="block mt-1"><Heatmap days={days} weeks={weeks} cell={cell} gap={gap} labels /></span>
          </span>
        </span>
      )}
    </WidgetFrame>
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
export const DeficitWidget = memo(DeficitWidgetImpl)
export const BarToBeatWidget = memo(BarToBeatWidgetImpl)
export const ConsistencyWidget = memo(ConsistencyWidgetImpl)
