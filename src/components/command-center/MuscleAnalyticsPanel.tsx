'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { ChartRange, DEFAULT_RANGE_DAYS } from '@/components/charts/ChartRange'
import { useChartEra } from '@/lib/hooks/useEraWindow'
import { WeekToDateTargets } from './WeekToDateTargets'
import { DeferredMount } from '@/components/fx/DeferredMount'
import { WidgetBoundary } from '@/components/fx/WidgetBoundary'
import { eraForDate } from '@/lib/programs'
import { useVolumeTrend } from '@/lib/hooks/useCharts'

// Recharts-heavy — client-only so they never touch the Command Center's first load.
const chartFallback = () => (
  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-64 flex items-center justify-center">
    <div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" />
  </div>
)
const VolumeStream = dynamic(() => import('@/components/charts/HelixViz').then((m) => m.VolumeStream), { ssr: false, loading: chartFallback })
const RpeCalendar = dynamic(() => import('@/components/charts/HelixViz').then((m) => m.RpeCalendar), { ssr: false, loading: chartFallback })
const MuscleAnalyticsSection = dynamic(() => import('@/components/charts/MuscleAnalytics').then((m) => m.MuscleAnalyticsSection), { ssr: false, loading: chartFallback })
const StrengthTrends = dynamic(() => import('@/components/charts/StrengthTrends').then((m) => m.StrengthTrends), { ssr: false, loading: chartFallback })
// Both came from the deleted central Analytics panel. Volume describes the
// sessions on this page, and a PR is a fact about a lift — neither had any
// business living a tab away from the workout it belongs to.
const VolumeChart = dynamic(() => import('@/components/charts/VolumeChart').then((m) => m.VolumeChart), { ssr: false, loading: chartFallback })

/**
 * Every chart about TRAINING, on the page where the training happens — session
 * volume, Strength Trends, the Intensity
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
  // The ACTIVE plan's era, not a function of the window — see eraForRange's
  // docblock for why 1 Month answering 'all' put the PPL splits on this chart.
  // Read from localStorage, so it comes with its own subscription.
  const era = useChartEra()

  const { data: volumeData, isLoading: volumeLoading } = useVolumeTrend(days)
  const vData = useMemo(
    () => (volumeData ?? []).filter((d) => era === 'all' || eraForDate(d.date) === era),
    [volumeData, era],
  )

  return (
    <DeferredMount minHeight={480}>
      <WidgetBoundary label="Muscle analytics" minHeight={280}>
        <div className="space-y-5">
          {/* ── ONE SECTION. ──
              "Weekly Overview" was a full `text-fluid-lg` heading over a single
              card, immediately above a second heading of the same weight. Two
              headings a card apart is not a hierarchy, it is a page announcing
              itself twice — and the thing under the first one is week-to-date
              volume against MEV/MAV, which is the same subject as the volume
              chart directly below it.

              WeekToDateTargets keeps its no-timeframe semantics by sitting ABOVE
              the ChartRange row and outside anything the control feeds: MEV/MAV
              are weekly landmarks, and rendering them under a "1 Month" toggle
              would imply a window they do not have. */}
          <section className="space-y-3 min-w-0">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-heading text-fluid-lg font-bold text-text">Performance</h2>
              {/* ONE control. This spot used to hold three — a plan-week button, a
                  hand-rolled "30 Days", and the era — none of which agreed about
                  what they were for. See ChartRange. */}
              <ChartRange value={days} onChange={setDays} />
            </div>
            <div className="space-y-4 min-w-0">
              <WeekToDateTargets />
              <VolumeChart data={vData} isLoading={volumeLoading} era={era} />
              <MuscleAnalyticsSection days={days} era={era} />
              {/* ── ONE TREND WIDGET, NOT TWO ──
                  `PRHistoryChart` ("Estimated 1RM Trends") sat immediately under
                  StrengthTrends, drawing est-1RM per exercise over time from the
                  same `usePRHistory` rows — a second axis chart answering the
                  question the sparkline list above it had just answered, down to
                  an empty state that read "Log workouts to see strength trends."
                  StrengthTrends survived because it names the number, the best
                  and the delta per lift; the axis chart only showed the shape. */}
              <StrengthTrends days={days} era={era} />
              <RpeCalendar days={days} era={era} />
              <VolumeStream days={days} era={era} />
            </div>
          </section>
        </div>
      </WidgetBoundary>
    </DeferredMount>
  )
}
