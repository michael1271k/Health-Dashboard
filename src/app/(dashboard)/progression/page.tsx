'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { GitBranch, LineChart, HeartPulse } from 'lucide-react'
import { ProgressionTimeline } from '@/components/progression/ProgressionTimeline'
import { AnalyticsPanel } from '@/components/progression/AnalyticsPanel'
import { VitalsGroups } from '@/components/insights/VitalsGroups'

type View = 'timeline' | 'analytics' | 'vitals'

/**
 * Progression — the unified analytics tab. Absorbs the old Insights, Reports and
 * Charts pages: a cut-program Timeline of weekly nodes (Reports) plus an
 * Analytics view of every performance/body chart and weekly vitals.
 */
export default function ProgressionPage() {
  return (
    <Suspense fallback={<div className="helix-card h-64 animate-pulse" aria-hidden="true" />}>
      <ProgressionInner />
    </Suspense>
  )
}

function ProgressionInner() {
  const params = useSearchParams()
  const initial = params.get('view')
  const [view, setView] = useState<View>(
    initial === 'analytics' ? 'analytics' : initial === 'vitals' ? 'vitals' : 'timeline',
  )

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-heading text-fluid-2xl font-bold text-text leading-tight">Progression</h1>
          <p className="text-muted text-fluid-sm mt-0.5">Your cut program, week by week · performance &amp; body analytics</p>
        </div>
        <div className="flex rounded-xl border border-white/[0.08] overflow-hidden shrink-0">
          {([['timeline', 'Timeline', GitBranch], ['analytics', 'Analytics', LineChart], ['vitals', 'Vitals', HeartPulse]] as const).map(([v, t, Icon]) => (
            <button key={v} onClick={() => setView(v)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-fluid-xs font-semibold ${view === v ? 'bg-primary/15 text-primary' : 'text-muted hover:text-text'}`}>
              <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {t}
            </button>
          ))}
        </div>
      </div>

      {view === 'timeline' ? <ProgressionTimeline /> : view === 'analytics' ? <AnalyticsPanel /> : <VitalsGroups />}
    </div>
  )
}
