'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { RangeSelector } from '@/components/charts/RangeSelector'
import { PlanEraButton } from '@/components/charts/PlanEraButton'
import { DeferredMount } from '@/components/fx/DeferredMount'
import { WidgetBoundary } from '@/components/fx/WidgetBoundary'
import { useEraFilter } from '@/lib/era/eraFilter'
import { EraFilterPills } from '@/components/era/EraFilterPills'

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

/**
 * The gym/muscle-progress graphs — Muscle Contour Map, Intensity Calendar,
 * Volume Stream, and the Hevy-killer Muscle Analytics — live in the Command
 * Center, not the Momentum → Analytics tab (which now carries only body/vitals
 * trends). Defaults to a 30-day window with its own era filter.
 */
export function MuscleAnalyticsPanel() {
  const [days, setDays] = useState(30)
  const { era } = useEraFilter()

  return (
    <DeferredMount minHeight={480}>
      <WidgetBoundary label="Muscle analytics" minHeight={280}>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-heading text-fluid-lg font-bold text-text">
              Muscle Analytics <span className="text-fluid-xs text-muted font-normal">Hevy-killer</span>
            </h2>
            {/* 30-day floor: the 1W/2W presets are gone — muscle trends need a month
                minimum to read. The Era button spans the whole active plan. */}
            <div className="flex items-center gap-2 flex-wrap">
              <RangeSelector value={days} onChange={setDays} min={30} />
              <PlanEraButton value={days} onChange={setDays} />
            </div>
          </div>
          <EraFilterPills />
          <div className="space-y-4 min-w-0">
            {/* [&>*]:min-w-0 lets each chart shrink below its Recharts intrinsic width. */}
            <div className="grid lg:grid-cols-2 gap-4 [&>*]:min-w-0">
              <BodyHeatmap days={days} era={era} />
              <RpeCalendar days={days} era={era} />
            </div>
            <VolumeStream days={days} era={era} />
            <MuscleAnalyticsSection days={days} era={era} />
          </div>
        </div>
      </WidgetBoundary>
    </DeferredMount>
  )
}
