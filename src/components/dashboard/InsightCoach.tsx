'use client'

import { Brain, TrendingUp, AlertTriangle, Minus } from 'lucide-react'
import { useInsights } from '@/lib/hooks/useInsights'
import type { InsightTone } from '@/lib/coach/insights'

const TONE: Record<InsightTone, { color: string; Icon: typeof TrendingUp }> = {
  positive: { color: '#19E3B1', Icon: TrendingUp },
  caution: { color: '#FFB020', Icon: AlertTriangle },
  neutral: { color: '#8B97B2', Icon: Minus },
}

/**
 * The Intellectual Insight Coach — strict-English, correlation-driven guidance.
 * A readiness headline (from today's score) sits above ranked insights mined
 * from the real metric history (sleep↔volume, RHR drift, calorie adherence,
 * weight trend). All analysis is client-side and deterministic.
 */
export function InsightCoach() {
  const { data, isLoading } = useInsights()
  const readiness = data?.readiness ?? null
  const insights = data?.insights ?? []

  return (
    <div className="helix-card">
      <div className="flex items-center gap-2 mb-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Brain className="w-4 h-4" aria-hidden="true" />
        </span>
        <h2 className="font-heading font-semibold text-fluid-sm uppercase tracking-wider text-muted">
          Insight Coach
        </h2>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-6 w-40 bg-surface-2 rounded-lg animate-pulse" />
          <div className="h-4 w-full bg-surface-2 rounded animate-pulse" />
          <div className="h-4 w-2/3 bg-surface-2 rounded animate-pulse" />
        </div>
      ) : (
        <div className="space-y-4">
          {readiness && (
            <div>
              <p className="font-heading font-bold text-fluid-xl" style={{ color: readiness.color }}>
                {readiness.label}
              </p>
              <p className="text-fluid-sm text-muted">{readiness.reason}</p>
            </div>
          )}

          {insights.length > 0 ? (
            <ul className="space-y-2.5">
              {insights.map((ins) => {
                const { color, Icon } = TONE[ins.tone]
                return (
                  <li key={ins.id} className="flex gap-2.5">
                    <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-fluid-sm font-semibold text-text">{ins.headline}</p>
                      <p className="text-fluid-xs text-muted leading-relaxed">{ins.detail}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-fluid-xs text-muted">
              Not enough history yet — keep syncing and I’ll surface mathematical correlations across sleep, recovery, nutrition, and training.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
