'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, FlaskConical } from 'lucide-react'
import { useTodayDailyLog, useTodayNutrition } from '@/lib/hooks/useDashboard'
import { MICRO_TARGETS, MICRO_SIGNALS } from '@/lib/nutrition/microTargets'

/**
 * Nutrition & Micros deep-dive. Evidence-based daily micro TARGETS for this
 * athlete's cut, plus the passive HealthKit signals already modelled on
 * daily_logs. Diet micros (iron, vitamins, …) light up once a paid Apple
 * account re-enables HealthKit — until then they stand as a reference card.
 */
export default function MicrosPage() {
  const router = useRouter()
  const { data: log } = useTodayDailyLog()
  const { data: nutrition } = useTodayNutrition()

  // Fiber + protein have dedicated columns; the rest of the dietary micros ride
  // in the nutrition `micros` jsonb bundle (populated by the HealthKit sync).
  const microsBundle = (nutrition as { micros?: Record<string, number> | null } | null)?.micros ?? {}
  const intake: Record<string, number | null | undefined> = {
    fiber: (nutrition as { fiber_g?: number | null } | null)?.fiber_g,
    protein: nutrition?.protein_g,
    ...microsBundle,
  }

  const signalValue = (key: string): number | null => {
    const v = (log as Record<string, unknown> | null)?.[key]
    return typeof v === 'number' ? v : null
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <header className="flex items-center gap-3">
        <button onClick={() => router.back()} className="btn-glass shrink-0 min-h-[44px]" aria-label="Back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-fluid-lg font-bold text-text flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary" aria-hidden="true" /> Nutrition &amp; Micros
          </h1>
          <span className="text-fluid-xs text-muted">Evidence-based targets for your 50-day cut</span>
        </div>
      </header>

      {/* ── Diet micro targets ── */}
      <section className="space-y-3">
        <h2 className="font-heading text-fluid-base font-bold text-text px-1">Daily Micro Targets</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {MICRO_TARGETS.map((m) => {
            const have = intake[m.key]
            const pct = have != null && m.target ? Math.min(1, have / m.target) : null
            const overCeiling = m.kind === 'ceiling' && have != null && have > m.target
            return (
              <div key={m.key} className="helix-card !p-3 space-y-2" style={{ borderColor: `${m.color}26` }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-fluid-sm text-text">{m.label}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                    style={{ color: m.color, background: `${m.color}1a`, border: `1px solid ${m.color}44` }}>
                    {m.kind === 'floor' ? 'aim' : 'max'}
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="helix-num text-fluid-xl font-bold" style={{ color: overCeiling ? '#FB7185' : m.color }}>
                    {have != null ? Math.round(have) : '—'}
                  </span>
                  <span className="text-fluid-xs text-muted">/ {m.target} {m.unit}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full" style={{
                    width: `${(pct ?? 0) * 100}%`,
                    background: overCeiling ? '#FB7185' : m.color,
                  }} />
                </div>
                <p className="text-[10px] leading-snug text-muted">{m.why}</p>
              </div>
            )
          })}
        </div>
        <p className="text-[10px] text-muted px-1 leading-snug">
          Diet micros populate from your HealthKit food log on each sync. A micro shows “—” on days
          the source didn’t record it; targets stand as your reference.
        </p>
      </section>

      {/* ── Passive HealthKit signals ── */}
      <section className="space-y-3">
        <h2 className="font-heading text-fluid-base font-bold text-text px-1">Advanced Signals</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {MICRO_SIGNALS.map((s) => {
            const v = signalValue(s.key)
            return (
              <div key={s.key} className="helix-card !p-3 space-y-1" style={{ borderColor: `${s.color}22` }}>
                <div className="flex items-baseline gap-1">
                  <span className="helix-num text-fluid-lg font-bold text-text">
                    {v != null ? (Math.abs(v) < 10 ? Math.round(v * 10) / 10 : Math.round(v)) : '—'}
                  </span>
                  {s.unit && <span className="text-[10px] text-muted">{s.unit}</span>}
                </div>
                <span className="block text-[10px] font-semibold uppercase tracking-wide" style={{ color: s.color }}>{s.label}</span>
                <p className="text-[10px] leading-snug text-muted">{s.reference}</p>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
