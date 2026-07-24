'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FlaskConical, Pill } from 'lucide-react'
import { useTodayDailyLog, useTodayNutrition } from '@/lib/hooks/useDashboard'
import { useSupplements } from '@/lib/hooks/useSupplements'
import { protocolForDate } from '@/lib/supplements'
import { isTrainingDay } from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'
import { supplementMicros, mergeMicros } from '@/lib/nutrition/supplementMicros'
import { MICRO_TARGETS, MICRO_SIGNALS } from '@/lib/nutrition/microTargets'

/**
 * Nutrition & Micros deep-dive. Evidence-based daily micro TARGETS for this
 * athlete's cut, the supplement stack's contribution, and the passive HealthKit
 * signals already modelled on daily_logs. Diet micros light up once a paid Apple
 * account re-enables HealthKit; stack micros are live today.
 */
export default function MicrosPage() {
  const router = useRouter()
  const { data: log } = useTodayDailyLog()
  const { data: nutrition } = useTodayNutrition()
  const { data: taken } = useSupplements()
  const date = logicalTodayISO()

  // Every supplement ticked off contributes its label dose to today's micros,
  // exactly like a logged food. The Stack tile used to count adherence and
  // nothing else, so 470 mg of vitamin C and 5 000 IU of D3 taken every single
  // morning never reached the targets they exist to hit.
  const fromStack = useMemo(() => {
    const doses = new Map(
      protocolForDate(isTrainingDay(date)).flatMap((s) => s.items.map((i) => [i.key, i.dose] as const)),
    )
    return supplementMicros(taken ?? [], doses)
  }, [taken, date])

  // Fiber + protein have dedicated columns; the rest of the dietary micros ride
  // in the nutrition `micros` jsonb bundle (populated by the HealthKit sync).
  const intake = useMemo(() => {
    const microsBundle = (nutrition as { micros?: Record<string, number> | null } | null)?.micros ?? {}
    return mergeMicros({
      fiber: (nutrition as { fiber_g?: number | null } | null)?.fiber_g,
      protein: nutrition?.protein_g,
      ...microsBundle,
    }, fromStack)
  }, [nutrition, fromStack])

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
            const stackShare = fromStack[m.key] ?? 0
            return (
              <div key={m.key} className="helix-card !p-3 space-y-2" style={{ borderColor: `${m.color}26` }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-fluid-sm text-text flex items-center gap-1 min-w-0">
                    <span className="truncate">{m.label}</span>
                    {stackShare > 0 && (
                      <Pill className="w-3 h-3 shrink-0" style={{ color: m.color }}
                        aria-label="from the supplement stack" />
                    )}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
                    style={{ color: m.color, background: `${m.color}1a`, border: `1px solid ${m.color}44` }}>
                    {m.kind === 'floor' ? 'aim' : 'max'}
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="helix-num text-fluid-xl font-bold" style={{ color: overCeiling ? '#C4514E' : m.color }}>
                    {have != null ? Math.round(have) : '—'}
                  </span>
                  <span className="text-fluid-xs text-muted">/ {m.target} {m.unit}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full" style={{
                    width: `${(pct ?? 0) * 100}%`,
                    background: overCeiling ? '#C4514E' : m.color,
                  }} />
                </div>
                {stackShare > 0 && (
                  <p className="text-[10px] font-semibold" style={{ color: m.color }}>
                    {Math.round(stackShare).toLocaleString()} {m.unit} from the stack
                  </p>
                )}
                <p className="text-[10px] leading-snug text-muted">{m.why}</p>
              </div>
            )
          })}
        </div>
        <p className="text-[10px] text-muted px-1 leading-snug">
          Rows marked with a pill icon are credited from the supplement stack the moment you tick
          the item off — Apple Health can&apos;t export supplements, so those doses are read from your
          protocol&apos;s labels. Diet micros populate from your HealthKit food log on each sync; a micro
          shows “—” on days the source didn&apos;t record it.
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
