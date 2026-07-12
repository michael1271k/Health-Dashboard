'use client'

import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { StatTile } from '@/components/dashboard/StatTile'
import { SessionIntelCard } from '@/components/reports/SessionIntelCard'
import { CompletenessArc } from '@/components/day/CompletenessArc'
import { FuelForceBand } from '@/components/nutrition/FuelForceBand'
import { SubjectiveBlock } from '@/components/day/SubjectiveBlock'
import { SleepDebtGauge } from '@/components/day/SleepDebtGauge'
import { useDayVault, dayCompleteness } from '@/lib/hooks/useDayVault'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { PHASE_META } from '@/lib/nutrition/phase'
import { ERA_META, eraForDate, scheduleDayFor } from '@/lib/programs'
import { displayWeight, validWeight, weightUnit } from '@/lib/utils/units'
import { formatSleep, mlToL } from '@/lib/utils/format'

const VIOLET = '#8B7CFF'

/**
 * The Day Vault — one logical day (04:00 boundary) as a master
 * record: score, fuel, training (or recovery), vitals, and the subjective
 * journal that replaces Notion. Rest days reflow to recovery + nutrition.
 */
export default function DayVaultPage() {
  const { date: raw } = useParams<{ date: string }>()
  const router = useRouter()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw ?? '') ? raw : ''
  const { data, isLoading } = useDayVault(date)

  if (!date) return <p className="text-muted-vital p-6">Invalid date.</p>

  const era = eraForDate(date)
  const eraMeta = ERA_META[era]
  const schedule = scheduleDayFor(date)
  const trained = (data?.sessions.length ?? 0) > 0
  const restDay = !trained && schedule === 'rest'
  const { parts } = dayCompleteness(data)
  const unit = weightUnit()
  const log = data?.log
  const n = data?.nutrition

  const pretty = new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  const macros = [
    { label: 'P', value: n?.protein_g, color: MACRO_COLORS.protein },
    { label: 'C', value: n?.carbs_g, color: MACRO_COLORS.carbs },
    { label: 'F', value: n?.fat_g, color: MACRO_COLORS.fat },
  ]

  return (
    <div className="space-y-5">
      {/* ── Header: date · era badge · completeness ── */}
      <header className="flex items-center gap-3">
        <button onClick={() => router.back()} className="btn-glass shrink-0 min-h-[44px]" aria-label="Back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-fluid-lg font-bold text-text truncate">{pretty}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 rounded"
              style={{ color: eraMeta.color, background: `${eraMeta.color}1a`, border: `1px solid ${eraMeta.color}40` }}>
              {eraMeta.short}
            </span>
            <span className="text-fluid-xs text-muted-vital truncate">
              {schedule === 'rest' ? 'Zone-2 / Rest' : schedule.label}
            </span>
            {n?.phase && <span className="text-fluid-xs" style={{ color: PHASE_META[n.phase].color }}>{PHASE_META[n.phase].label} day</span>}
          </div>
        </div>
        <CompletenessArc parts={parts} />
      </header>

      {/* ── Score strip ── */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile label="Score" value={data?.score?.score ?? null} accent="#16F5C3" isLoading={isLoading} />
        <StatTile label="Battery" value={data?.score?.battery_pct ?? null} unit="%" accent="#3EE0FF" isLoading={isLoading} />
      </div>

      {/* ── Fuel block ── */}
      <section className="helix-card space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-heading font-semibold text-text">Fuel</h2>
          <span className="helix-num text-fluid-sm font-bold" style={{ color: MACRO_COLORS.calories }}>
            {n ? `${Math.round(n.calories).toLocaleString()} kcal` : '—'}
          </span>
        </div>
        {n ? (
          <div className="grid grid-cols-3 gap-2.5">
            {macros.map((m) => (
              <div key={m.label} className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-3 py-2 text-center">
                <span className="helix-num text-fluid-sm font-bold text-text">{Math.round(m.value ?? 0)}g</span>
                <span className="block text-[9px] uppercase tracking-wide" style={{ color: m.color }}>{m.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-fluid-xs text-muted-vital">No nutrition logged for this day.</p>
        )}
      </section>

      {/* ── Train OR Recovery block (rest days are intentional, never empty) ── */}
      {trained ? (
        <>
          <FuelForceBand date={date} proteinG={n?.protein_g ?? null} proteinGoal={180} />
          {data!.sessions.map((s) => <SessionIntelCard key={s.id} session={s} />)}
        </>
      ) : (
        <section className="helix-card space-y-3" style={{ borderColor: `${VIOLET}30` }}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading font-semibold" style={{ color: VIOLET }}>Recovery</h2>
            <span className="text-[10px] uppercase tracking-widest text-muted-vital">{restDay ? 'scheduled rest' : 'no session'}</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile label="Zone-2 / Move" value={log?.exercise_minutes ?? log?.training_minutes} unit="min" accent={VIOLET} isLoading={isLoading} />
            <StatTile label="HRV" value={log?.hrv_ms != null ? Math.round(log.hrv_ms) : null} unit="ms" accent={VIOLET} isLoading={isLoading} />
            <StatTile label="Resting HR" value={log?.avg_rest_heart_rate} unit="bpm" isLoading={isLoading} />
            <StatTile label="Sleep" value={log?.sleep_minutes != null ? formatSleep(log.sleep_minutes) : null} isLoading={isLoading} />
          </div>
        </section>
      )}

      {/* ── Vitals strip ── */}
      <section className="helix-card space-y-3">
        <h2 className="font-heading font-semibold text-text">Vitals & Body</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <StatTile label="Weight" value={displayWeight(validWeight(log?.weight_kg))} unit={unit} accent="#16F5C3" isLoading={isLoading} />
          <StatTile label="Steps" value={log?.steps?.toLocaleString() ?? null} accent="#4FC3FF" isLoading={isLoading} />
          <StatTile label="Water" value={log?.water_ml != null ? mlToL(log.water_ml) : null} unit="L" accent="#3EE0FF" isLoading={isLoading} />
          <StatTile label="Sleep" value={log?.sleep_minutes != null ? formatSleep(log.sleep_minutes) : null} accent={VIOLET} isLoading={isLoading} />
          <StatTile label="Stand" value={log?.stand_hours} unit="h" isLoading={isLoading} />
          <StatTile label="VO₂max" value={log?.vo2max} isLoading={isLoading} />
        </div>
      </section>

      {/* ── Sleep Debt Bank (14-night rolling) ── */}
      <SleepDebtGauge />

      {/* ── Journal (the Notion replacement) ── */}
      <SubjectiveBlock date={date} effort={log?.effort_rating ?? null} mood={log?.mood ?? null} journal={log?.journal_md ?? null} />
    </div>
  )
}
