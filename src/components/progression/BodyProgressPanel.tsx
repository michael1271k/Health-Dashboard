'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useWeightTrend, useBodyDetailTrend, useStepsTrend } from '@/lib/hooks/useCharts'
import { useUserGoals } from '@/lib/hooks/useDashboard'
import { ChartRange, DEFAULT_RANGE_DAYS } from '@/components/charts/ChartRange'
import { eraForRange } from '@/lib/hooks/useEraWindow'
import { eraForDate } from '@/lib/programs'
import { WidgetBoundary } from '@/components/fx/WidgetBoundary'

const chartFallback = () => (
  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-64 flex items-center justify-center">
    <div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" />
  </div>
)
const BodyCompositionChart = dynamic(() => import('@/components/charts/BodyCompositionChart').then((m) => m.BodyCompositionChart), { ssr: false, loading: chartFallback })
const StepsChart = dynamic(() => import('@/components/charts/StepsChart').then((m) => m.StepsChart), { ssr: false, loading: chartFallback })

/**
 * Body over time — the Progress tab's charts.
 *
 * ── WHAT THIS IS THE REMAINS OF ──────────────────────────────────────────────
 * `AnalyticsPanel` held four unrelated charts behind a shared range rail: body
 * composition, training volume, macros, and PR history. One surface answering
 * four questions meant every question was one tab-switch and a scroll away from
 * its own data — volume lived a tab away from the workout it described, macros a
 * tab away from the food. So they went to their subjects, and what stayed is the
 * pair that belongs to *the body*: weight and the steps that move it.
 *
 * That pairing is the point. Weight is an OUTCOME; intake and steps are the
 * INPUTS. Seeing the outcome above one of its inputs is what makes a stalled cut
 * readable — "the scale hasn't moved and neither has my step count" is a
 * diagnosis, whereas the same two facts on different tabs are two shrugs.
 *
 * ── ONE WINDOW, TWO CHARTS ───────────────────────────────────────────────────
 * `ChartRange` is the only control, and the era filter is DERIVED from it
 * (`eraForRange`) rather than stored, so the two cannot disagree. The era
 * boundary marker on the composition chart shows only in the all-eras window,
 * where a boundary is a thing you can actually see across.
 */
export function BodyProgressPanel() {
  const [days, setDays] = useState(DEFAULT_RANGE_DAYS)
  const era = eraForRange(days)

  const { data: weightData, isLoading: weightLoading } = useWeightTrend(days)
  const { data: bodyDetail, isLoading: detailLoading } = useBodyDetailTrend(days)
  const { data: steps, isLoading: stepsLoading } = useStepsTrend(days)
  const { data: goals } = useUserGoals()

  // Memoised so the charts get stable array identity while inputs are unchanged.
  const wData = useMemo(
    () => (weightData ?? []).filter((d) => era === 'all' || eraForDate(d.date) === era),
    [weightData, era],
  )
  const bdData = useMemo(
    () => (bodyDetail ?? []).filter((d) => era === 'all' || eraForDate(d.date) === era),
    [bodyDetail, era],
  )
  const sData = useMemo(
    () => (steps ?? []).filter((d) => era === 'all' || eraForDate(d.date) === era),
    [steps, era],
  )

  return (
    <div className="space-y-4">
      <ChartRange value={days} onChange={setDays} />
      <WidgetBoundary label="Body charts" minHeight={280}>
        {/* [&>*]:min-w-0 lets each chart shrink below its Recharts intrinsic
            width — without it the X-axis overflows a phone viewport, because
            grid/flex children default to min-width:auto. */}
        <div className="space-y-4 [&>*]:min-w-0">
          <BodyCompositionChart trend={wData} detail={bdData}
            isLoading={weightLoading || detailLoading} showEraBoundary={era === 'all'} />
          <StepsChart data={sData} goal={goals?.steps_goal ?? null} isLoading={stepsLoading} />
        </div>
      </WidgetBoundary>
    </div>
  )
}
