'use client'

import { useMemo } from 'react'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { Hero, Spark, StatTile, Trend, vsBaseline } from './parts'
import { useVitalsDays, type VitalsDay } from '@/lib/hooks/useVitals'
import { SAPPHIRE, OXIDE, EMERALD, STEEL } from '@/lib/theme/palette'
import { WIDGET_META, type WidgetSize } from '@/lib/dashboard/layout'

/**
 * The four readings the watch takes while you sleep.
 *
 * ── WHY FOUR BOXES AND NOT FOUR ROWS ─────────────────────────────────────────
 * These were four label/number pairs on a bare tile, which is the anatomy of a
 * LIST — and a list says its items are the same kind of thing, read in order,
 * from one source. They are not. HRV comes off the sleep sensor, resting heart
 * rate off the optical monitor, SpO₂ off a different one again, and each has its
 * own unit, its own normal range and its own direction of good. Health draws
 * each metric on its own card for exactly that reason, and the container is what
 * says "four independent measurements" before a single digit is read.
 *
 * Each box also carries its own week, because the number alone is not the
 * reading: 62 ms of HRV is good news or bad news entirely depending on what the
 * last six mornings said, and the sparkline is the cheapest possible way to put
 * that on the tile.
 *
 * ── EACH METRIC OWNS ITS DIRECTION ───────────────────────────────────────────
 * HRV up is recovery; resting heart rate up is not. Respiratory rate up is not.
 * SpO₂ up is, to a ceiling. A widget that painted all four arrows the same
 * colour would be actively misleading on two of them, so `higherIsBetter` is
 * declared per metric here and nowhere else.
 *
 * The baseline each is measured against EXCLUDES today — see `vsBaseline`. A
 * seven-day mean that contains today is a mean today is being compared against
 * itself inside, which damps every real move.
 */

/** The four, with their colour and their direction, in reading order. */
const METRICS = [
  { key: 'hrv_ms', label: 'HRV', unit: 'ms', color: SAPPHIRE, up: true, dp: 0 },
  { key: 'avg_rest_heart_rate', label: 'Rest HR', unit: 'bpm', color: OXIDE, up: false, dp: 0 },
  { key: 'blood_oxygen', label: 'SpO₂', unit: '%', color: EMERALD, up: true, dp: 0 },
  { key: 'respiratory_rate', label: 'Resp', unit: '/min', color: STEEL, up: false, dp: 1 },
] as const

export function VitalsWidget({ size, onOpen }: { size: WidgetSize; onOpen?: () => void }) {
  const { data: days } = useVitalsDays(14)

  const read = useMemo(() => {
    const rows: VitalsDay[] = days ?? []
    // Last 8 rows so the baseline is a week and today is the eighth.
    const win = rows.slice(-8)
    return METRICS.map((m) => {
      const series = win.map((d) => d[m.key] as number | null)
      const today = series[series.length - 1] ?? null
      return {
        ...m,
        series,
        value: today,
        delta: vsBaseline(series, today),
      }
    })
  }, [days])

  const hrv = read[0]
  const anything = read.some((r) => r.value != null)

  return (
    <WidgetFrame {...WIDGET_META.vitals} size={size} onOpen={onOpen}>
      {!anything ? (
        <WidgetEmpty accent={SAPPHIRE} size={size} message="Awaiting tonight's readings" hint="Your Watch fills these in overnight" />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-0.5">
          <Hero value={hrv.value} unit="ms" color={SAPPHIRE} />
          <span className="flex items-center gap-1">
            <Trend delta={hrv.delta} higherIsBetter />
            <span className="text-[9px] text-muted truncate">vs 7-day</span>
          </span>
        </span>
      ) : (
        /* Medium and large are the same 2×2 of boxes. What large adds is not
           more metrics — there are four — but more of each one's history: the
           in-box sparkline grows, and HRV, the reading the recovery score
           actually leans on, gets its full fortnight underneath. */
        <span className="flex-1 min-h-0 flex flex-col gap-1.5">
          <span className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-1.5">
            {read.map((r) => (
              <StatTile
                key={r.key}
                label={r.label}
                value={r.value == null ? null : r.dp ? r.value.toFixed(1) : Math.round(r.value)}
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
            <span className="block pt-1.5 border-t border-white/[0.06]">
              <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">HRV · 14 days</span>
              <Spark series={(days ?? []).map((d) => d.hrv_ms)} color={SAPPHIRE} height={30} />
            </span>
          )}
        </span>
      )}
    </WidgetFrame>
  )
}
