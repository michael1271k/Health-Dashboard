'use client'

import { useMemo } from 'react'
import { HeartPulse } from 'lucide-react'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { Cell, Hero, Spark, Trend, vsBaseline } from './parts'
import { useVitalsDays, type VitalsDay } from '@/lib/hooks/useVitals'
import { SAPPHIRE, OXIDE, EMERALD, STEEL } from '@/lib/theme/palette'
import type { WidgetSize } from '@/lib/dashboard/layout'

/**
 * The four readings the watch takes while you sleep.
 *
 * ── WHY THIS IS THE WIDGET THAT PROVES THE ARCHITECTURE ──────────────────────
 * Under the old single-anatomy shell this domain rendered as "75 ms" and a line
 * of text. It has FOUR metrics, each with its own direction of good and its own
 * baseline, and the shell could show one of them because the shell could only
 * ever show one of anything. Medium is a 2×2 here — the shape the data has had
 * all along.
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
    <WidgetFrame icon={HeartPulse} label="Vitals" accent={SAPPHIRE} size={size} onOpen={onOpen}>
      {!anything ? (
        <WidgetEmpty accent={SAPPHIRE} message="Awaiting tonight's readings" hint="Your Watch fills these in overnight" />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-0.5">
          <Hero value={hrv.value} unit="ms" color={SAPPHIRE} />
          <span className="flex items-center gap-1">
            <Trend delta={hrv.delta} higherIsBetter />
            <span className="text-[9px] text-muted truncate">vs 7-day</span>
          </span>
        </span>
      ) : (
        /* Medium and large are the same 2×2 — large simply gives every cell its
           own sparkline instead of only the two that fit. The grid is the point
           and it does not change between them; what changes is the depth. */
        <span className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-x-3 gap-y-1.5">
          {read.map((r) => (
            <Cell
              key={r.key}
              label={r.label}
              value={r.value == null ? null : r.dp ? r.value.toFixed(1) : Math.round(r.value)}
              unit={r.unit}
              color={r.color}
              delta={r.delta}
              higherIsBetter={r.up}
              decimals={r.dp}
              series={size === 'l' ? r.series : undefined}
            />
          ))}
        </span>
      )}

      {/* Large adds the one thing the grid cannot carry: how HRV — the reading
          the recovery score actually leans on — has moved across the fortnight. */}
      {size === 'l' && anything && (
        <span className="block pt-2 mt-1 border-t border-white/[0.06]">
          <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">HRV · 14 days</span>
          <Spark series={(days ?? []).map((d) => d.hrv_ms)} color={SAPPHIRE} height={34} />
        </span>
      )}
    </WidgetFrame>
  )
}
