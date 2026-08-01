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

// Recharts-heavy — client-only so they never touch the Command Center's first load.
const chartFallback = () => (
  <div className="helix-card h-64 flex items-center justify-center">
    <div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" />
  </div>
)
const BodyHeatmap = dynamic(() => import('@/components/charts/HelixViz').then((m) => m.BodyHeatmap), { ssr: false, loading: chartFallback })
const VolumeStream = dynamic(() => import('@/components/charts/HelixViz').then((m) => m.VolumeStream), { ssr: false, loading: chartFallback })
const RpeCalendar = dynamic(() => import('@/components/charts/HelixViz').then((m) => m.RpeCalendar), { ssr: false, loading: chartFallback })
const MuscleAnalyticsSection = dynamic(() => import('@/components/charts/MuscleAnalytics').then((m) => m.MuscleAnalyticsSection), { ssr: false, loading: chartFallback })

const STEEL = '#8E9AAC'

/**
 * The gym/muscle-progress graphs — Muscle Contour Map, Intensity Calendar,
 * Volume Stream, and the Muscle Analytics detail — live in the Command Center,
 * not the Momentum → Analytics tab (which now carries only body/vitals trends).
 * The ONLY two windows are 30 Days (default) and the current-plan Era.
 */
export function MuscleAnalyticsPanel() {
  const [days, setDays] = useState(30)
  const { era } = useEraFilter()

  return (
    <DeferredMount minHeight={480}>
      <WidgetBoundary label="Muscle analytics" minHeight={280}>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-heading text-fluid-lg font-bold text-text">Muscle Analytics</h2>
            {/* Current week · 30 Days (default) · the active plan's Era. */}
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
            {/* Most actionable first: week-to-date sets vs target (what to train next). */}
            <WeekToDateTargets />
            <MuscleAnalyticsSection days={days} era={era} />
            {/* [&>*]:min-w-0 lets each chart shrink below its Recharts intrinsic width. */}
            <div className="grid lg:grid-cols-2 gap-4 [&>*]:min-w-0">
              <BodyHeatmap days={days} era={era} />
              <RpeCalendar days={days} era={era} />
            </div>
            <VolumeStream days={days} era={era} />
          </div>
        </div>
      </WidgetBoundary>
    </DeferredMount>
  )
}
