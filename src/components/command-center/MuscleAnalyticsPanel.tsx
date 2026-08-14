'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { ChartRange, DEFAULT_RANGE_DAYS } from '@/components/charts/ChartRange'
import { eraForRange } from '@/lib/hooks/useEraWindow'
import { WeekToDateTargets } from './WeekToDateTargets'
import { DeferredMount } from '@/components/fx/DeferredMount'
import { WidgetBoundary } from '@/components/fx/WidgetBoundary'
import { eraForDate } from '@/lib/programs'
import { useVolumeTrend, usePRHistory } from '@/lib/hooks/useCharts'

// Recharts-heavy — client-only so they never touch the Command Center's first load.
const chartFallback = () => (
  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-64 flex items-center justify-center">
    <div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" />
  </div>
)
const BodyHeatmap = dynamic(() => import('@/components/charts/HelixViz').then((m) => m.BodyHeatmap), { ssr: false, loading: chartFallback })
const VolumeStream = dynamic(() => import('@/components/charts/HelixViz').then((m) => m.VolumeStream), { ssr: false, loading: chartFallback })
const RpeCalendar = dynamic(() => import('@/components/charts/HelixViz').then((m) => m.RpeCalendar), { ssr: false, loading: chartFallback })
const MuscleAnalyticsSection = dynamic(() => import('@/components/charts/MuscleAnalytics').then((m) => m.MuscleAnalyticsSection), { ssr: false, loading: chartFallback })
const StrengthTrends = dynamic(() => import('@/components/charts/StrengthTrends').then((m) => m.StrengthTrends), { ssr: false, loading: chartFallback })
// Both came from the deleted central Analytics panel. Volume describes the
// sessions on this page, and a PR is a fact about a lift — neither had any
// business living a tab away from the workout it belongs to.
const VolumeChart = dynamic(() => import('@/components/charts/VolumeChart').then((m) => m.VolumeChart), { ssr: false, loading: chartFallback })
const PRHistoryChart = dynamic(() => import('@/components/charts/PRHistoryChart').then((m) => m.PRHistoryChart), { ssr: false, loading: chartFallback })

/**
 * Every chart about TRAINING, on the page where the training happens — session
 * volume, the Muscle Contour Map, Strength Trends, PR history, the Intensity
 * Calendar and the Volume Stream.
 *
 * Volume and PR history arrived here when the central Analytics view was deleted.
 * They had been sitting on the Progress tab beside body weight and macros, which
 * meant the two charts that describe the sessions listed a few hundred pixels
 * above were a tab-switch and a scroll away from them. Nothing about a tonnage
 * trend belongs next to a weigh-in.
 *
 * TWO SECTIONS, and the split is about TIME, not topic.
 *
 * "Weekly Overview" sits ABOVE the toggle because everything in it is defined
 * by the current week: MEV/MAV targets are a weekly landmark, and rendering
 * them under a "1 Month" or era control implied a window they do not have. It
 * was the same card twice on this page at one point, once with a timeframe
 * control it ignored.
 *
 * Everything below the toggle honours it, and there is now exactly ONE toggle in
 * the app. This spot alone used to hold three — a plan-week button, a
 * hand-rolled "30 Days", and the era — sitting a few pixels apart, styled alike,
 * and moving overlapping sets of charts. The era is no longer a control at all:
 * it is derived from the window (`eraForRange`), so the two can't disagree.
 */
export function MuscleAnalyticsPanel() {
  const [days, setDays] = useState(DEFAULT_RANGE_DAYS)
  // Derived from the window rather than read from EraFilterProvider — one
  // control, one meaning. See eraForRange's docblock.
  const era = eraForRange(days)

  const { data: volumeData, isLoading: volumeLoading } = useVolumeTrend(days)
  const { data: prData, isLoading: prLoading } = usePRHistory(undefined, days)
  const vData = useMemo(
    () => (volumeData ?? []).filter((d) => era === 'all' || eraForDate(d.date) === era),
    [volumeData, era],
  )
  const pData = useMemo(
    () => (prData ?? []).filter((d) => era === 'all' || eraForDate(d.date) === era),
    [prData, era],
  )

  return (
    <DeferredMount minHeight={480}>
      <WidgetBoundary label="Muscle analytics" minHeight={280}>
        <div className="space-y-5">
          {/* ── Weekly Overview — strictly this week, no timeframe control ── */}
          <section className="space-y-3 min-w-0">
            <h2 className="font-heading text-fluid-lg font-bold text-text">Weekly Overview</h2>
            <WeekToDateTargets />
          </section>

          {/* ── Everything below shares ONE window ── */}
          <section className="space-y-3 min-w-0">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-heading text-fluid-lg font-bold text-text">Performance</h2>
              {/* ONE control. This spot used to hold three — a plan-week button, a
                  hand-rolled "30 Days", and the era — none of which agreed about
                  what they were for. See ChartRange. */}
              <ChartRange value={days} onChange={setDays} />
            </div>
            <div className="space-y-4 min-w-0">
              <VolumeChart data={vData} isLoading={volumeLoading} era={era} />
              <MuscleAnalyticsSection days={days} era={era} />
              <StrengthTrends days={days} era={era} />
              <PRHistoryChart data={pData} isLoading={prLoading} />
              {/* [&>*]:min-w-0 lets each chart shrink below its Recharts intrinsic
                  width; [&>*]:h-full makes the pair the SAME height on desktop.
                  Grid items stretch by default, but the cards inside them size to
                  their content, so the shorter one (the RPE calendar) used to
                  float against a taller neighbour with a ragged gap below it. */}
              <div className="grid lg:grid-cols-2 gap-4 items-stretch [&>*]:min-w-0 [&>*]:h-full">
                <BodyHeatmap days={days} era={era} />
                <RpeCalendar days={days} era={era} />
              </div>
              <VolumeStream days={days} era={era} />
            </div>
          </section>
        </div>
      </WidgetBoundary>
    </DeferredMount>
  )
}
