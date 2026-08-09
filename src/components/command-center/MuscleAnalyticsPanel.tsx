'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { PlanEraButton } from '@/components/charts/PlanEraButton'
import { CurrentWeekButton } from '@/components/charts/CurrentWeekButton'
import { WeekToDateTargets } from './WeekToDateTargets'
import { DeferredMount } from '@/components/fx/DeferredMount'
import { WidgetBoundary } from '@/components/fx/WidgetBoundary'
import { useEraFilter } from '@/lib/era/eraFilter'
import { activeProgram } from '@/lib/programs'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'

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

const STEEL = '#8E9AAC'

/**
 * The gym/muscle-progress graphs — Muscle Contour Map, Intensity Calendar,
 * Volume Stream, Strength Trends and the Muscle Analytics detail.
 *
 * TWO SECTIONS, and the split is about TIME, not topic.
 *
 * "Weekly Overview" sits ABOVE the toggle because everything in it is defined
 * by the current week: MEV/MAV targets are a weekly landmark, and rendering
 * them under a "30 Days" or "Plan Era" control implied a window they do not
 * have. It was the same card twice on this page at one point, once with a
 * timeframe control it ignored.
 *
 * Everything below the toggle honours it — including Strength Trends, which
 * used to carry its own Week / 30 Days / Era trio a few pixels away from this
 * one. Two toggles that look identical and move different charts is worse than
 * either alone.
 */
export function MuscleAnalyticsPanel() {
  // The era filter button prints `activeProgram().label` straight into JSX.
  void useScheduleVersion()
  const [days, setDays] = useState(30)
  const { era } = useEraFilter()

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
              <h2 className="font-heading text-fluid-lg font-bold text-text">Muscle Analytics</h2>
              {/* Current plan week · 30 Days (default) · the active plan's Era. */}
              <div className="flex items-center gap-2 flex-wrap">
                <CurrentWeekButton value={days} onChange={setDays} />
                <button
                  onClick={() => setDays(30)}
                  aria-pressed={days === 30}
                  className="inline-flex items-center px-3.5 py-1.5 rounded-xl text-fluid-xs font-semibold min-h-[40px] border transition-colors shrink-0"
                  style={days === 30
                    ? { color: STEEL, borderColor: `${STEEL}55`, background: `${STEEL}1f`, boxShadow: `0 0 10px ${STEEL}33` }
                    : { color: '#79808C', borderColor: 'transparent' }}
                >
                  30 Days
                </button>
                <PlanEraButton value={days} onChange={setDays} label={`${activeProgram().label} Era`} />
              </div>
            </div>
            <div className="space-y-4 min-w-0">
              <MuscleAnalyticsSection days={days} era={era} />
              <StrengthTrends days={days} era={era} />
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
