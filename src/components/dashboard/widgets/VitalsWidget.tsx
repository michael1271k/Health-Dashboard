'use client'

import { memo, useMemo } from 'react'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { Hero, LineChart, StatTile, Trend, vsBaseline } from './parts'
import { useVitalsDays, type VitalsDay } from '@/lib/hooks/useVitals'
import { SAPPHIRE, OXIDE, EMERALD, STEEL, GOLD, AMETHYST, MUTED } from '@/lib/theme/palette'
import { WIDGET_META, type WidgetSize } from '@/lib/dashboard/layout'

/**
 * The readings the watch takes while you sleep.
 *
 * ── WHY BOXES AND NOT ROWS ───────────────────────────────────────────────────
 * These were label/number pairs on a bare tile, which is the anatomy of a LIST —
 * and a list says its items are the same kind of thing, read in order, from one
 * source. They are not. HRV comes off the sleep sensor, resting heart rate off
 * the optical monitor, SpO₂ off a different one again, and each has its own
 * unit, its own normal range and its own direction of good. Health draws each
 * metric on its own card for exactly that reason, and the container is what says
 * "independent measurements" before a single digit is read.
 *
 * Each box also carries its own week, because the number alone is not the
 * reading: 62 ms of HRV is good news or bad news entirely depending on what the
 * last six mornings said, and the sparkline is the cheapest possible way to put
 * that on the tile.
 *
 * ── EACH METRIC OWNS ITS DIRECTION ───────────────────────────────────────────
 * HRV up is recovery; resting heart rate up is not. Respiratory rate up is not.
 * SpO₂ up is, to a ceiling. VO₂ max up is. Wrist temperature is the awkward one
 * and is declared `up: false` — a rising overnight skin temperature is the
 * classic early signal of illness or of a training load that has not been
 * absorbed. A widget that painted all six arrows the same colour would be
 * actively misleading on three of them, so `higherIsBetter` is declared per
 * metric here and nowhere else.
 *
 * ── SMALL SHOWS THREE, LARGE SHOWS SIX ───────────────────────────────────────
 * Small used to be one number — "64 ms" — with two thirds of the tile empty
 * under it, which is a quarter of the screen spent on a figure that means
 * nothing without a companion. HRV keeps the hero, and resting heart rate and
 * SpO₂ ride under it: those three together are the whole overnight verdict.
 *
 * The baseline each is measured against EXCLUDES today — see `vsBaseline`. A
 * seven-day mean that contains today is a mean today is being compared against
 * itself inside, which damps every real move.
 */

/** The six, with their colour and their direction, in reading order. */
const METRICS = [
  { key: 'hrv_ms', label: 'HRV', unit: 'ms', color: SAPPHIRE, up: true, dp: 0 },
  { key: 'avg_rest_heart_rate', label: 'Rest HR', unit: 'bpm', color: OXIDE, up: false, dp: 0 },
  { key: 'blood_oxygen', label: 'SpO₂', unit: '%', color: EMERALD, up: true, dp: 0 },
  { key: 'respiratory_rate', label: 'Resp', unit: '/min', color: STEEL, up: false, dp: 1 },
  { key: 'wrist_temp_delta', label: 'Wrist', unit: '°C', color: GOLD, up: false, dp: 1 },
  { key: 'vo2max', label: 'VO₂ max', unit: '', color: AMETHYST, up: true, dp: 1 },
] as const

function VitalsWidgetImpl({ size, onOpen }: { size: WidgetSize; onOpen?: () => void }) {
  const { data: days } = useVitalsDays(14)

  const read = useMemo(() => {
    const rows: VitalsDay[] = days ?? []
    // Last 8 rows so the baseline is a week and today is the eighth.
    const win = rows.slice(-8)
    return METRICS.map((m) => {
      const series = win.map((d) => d[m.key] as number | null)
      // ── THE READING AND ITS BASELINE MUST BE THE SAME DAY ──
      // The LAST reading there is, not necessarily today's: VO₂ max updates
      // every few days and wrist temperature needs a full night, so reading
      // position 8 blindly would print a dash on a metric that has a perfectly
      // good current value from yesterday.
      //
      // Which means the DELTA has to move with it. Handing `vsBaseline` the
      // final slot while displaying an earlier one breaks it in both directions:
      // on a metric whose today is null the arrow silently disappears (the very
      // case this lookback exists to cover), and when it does resolve, the
      // displayed value is inside the mean it is being compared against —
      // exactly the self-comparison this widget's own header forbids. So the
      // window is cut AT the reading being shown, and everything before it is
      // the baseline.
      let at = series.length - 1
      while (at >= 0 && series[at] == null) at -= 1
      const latest = at >= 0 ? series[at] : null
      return { ...m, series, value: latest, delta: vsBaseline(series.slice(0, at + 1), latest) }
    })
  }, [days])

  const hrv = read[0]
  const anything = read.some((r) => r.value != null)
  const shown = size === 'l' ? read : read.slice(0, 4)

  const fmt = (r: typeof read[number]) =>
    r.value == null ? null : r.dp ? r.value.toFixed(1) : String(Math.round(r.value))

  const hrvSeries = useMemo(
    () => (days ?? []).map((d) => ({ date: d.date, value: d.hrv_ms })),
    [days],
  )

  return (
    <WidgetFrame {...WIDGET_META.vitals} size={size} onOpen={onOpen}>
      {!anything ? (
        <WidgetEmpty accent={SAPPHIRE} size={size} message="Awaiting tonight's readings" hint="Your Watch fills these in overnight" />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-between gap-0.5">
          <span className="flex items-baseline gap-1">
            <Hero value={hrv.value == null ? null : Math.round(hrv.value)} unit="ms" color={SAPPHIRE} tight />
            <span className="ml-auto shrink-0"><Trend delta={hrv.delta} higherIsBetter /></span>
          </span>
          <span className="grid grid-cols-2 gap-1.5">
            {read.slice(1, 3).map((r) => (
              <span key={r.key} className="min-w-0 flex flex-col">
                <span className="text-[7px] font-bold uppercase tracking-[0.08em] text-muted truncate">{r.label}</span>
                <span className="helix-num text-[12px] font-bold leading-none tabular-nums truncate"
                  style={{ color: r.value == null ? MUTED : r.color }}>
                  {fmt(r) ?? '—'}
                  {r.value != null && <span className="text-[7px] font-normal text-muted ml-0.5">{r.unit}</span>}
                </span>
              </span>
            ))}
          </span>
        </span>
      ) : (
        /* Medium is the 2×2 of the four overnight readings. Large adds the two
           that move on a slower clock — wrist temperature and VO₂ max — and
           gives HRV, the reading the recovery score actually leans on, a dated
           chart rather than a bare sparkline. */
        <span className="flex-1 min-h-0 flex flex-col gap-1.5">
          <span className={`grid gap-1.5 ${size === 'l' ? 'grid-cols-3 grid-rows-2' : 'flex-1 min-h-0 grid-cols-2 grid-rows-2'}`}>
            {shown.map((r) => (
              <StatTile
                key={r.key}
                label={r.label}
                value={fmt(r)}
                unit={r.unit}
                color={r.color}
                delta={r.delta}
                higherIsBetter={r.up}
                decimals={r.dp}
                series={r.series}
              />
            ))}
          </span>

          {size === 'l' && (
            <span className="block mt-auto">
              <span className="flex items-baseline gap-1.5">
                <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">HRV · 14 days</span>
                <span className="text-[8px] text-muted ml-auto">tap a point for its night</span>
              </span>
              <LineChart series={hrvSeries} color={SAPPHIRE} height={70} decimals={0} unit=" ms" />
            </span>
          )}
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
export const VitalsWidget = memo(VitalsWidgetImpl)
