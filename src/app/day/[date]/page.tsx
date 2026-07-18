'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Dumbbell, Moon, Flame, Scale, Plus } from 'lucide-react'
import { CompletenessArc } from '@/components/day/CompletenessArc'
import { InBodyCard } from '@/components/day/InBodyCard'
import { SubjectiveBlock } from '@/components/day/SubjectiveBlock'
import { SleepDebtGauge } from '@/components/day/SleepDebtGauge'
import { SessionVolumeMini } from '@/components/day/SessionVolumeMini'
import { SessionProgressionCard } from '@/components/day/SessionProgressionCard'
import { SwapDayControl } from '@/components/day/SwapDayControl'
import { useDayVault, dayCompleteness, type DayVaultData } from '@/lib/hooks/useDayVault'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { phaseDisplay } from '@/lib/nutrition/phase'
import { ERA_META, eraForDate, scheduleDayFor } from '@/lib/programs'
import { displayWeight, validWeight, weightUnit } from '@/lib/utils/units'
import { formatSleep, mlToL } from '@/lib/utils/format'

const VIOLET = '#8B7CFF'
const ICE = '#6FE9FF'
const TEAL = '#16F5C3'
const CYAN = '#3EE0FF'
const EMBER = '#FFB86B'
const ROSE = '#FF5470'

function scoreColor(score: number | null | undefined): string {
  if (score == null) return '#8B97B2'
  if (score >= 80) return TEAL
  if (score >= 60) return CYAN
  if (score >= 40) return EMBER
  return ROSE
}

/** A micro macro ring (adherence = intake / goal-ish hint). */
function MicroRing({ value, goalHint, color, label }: { value: number | null | undefined; goalHint: number; color: string; label: string }) {
  const size = 44, stroke = 4
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = value != null ? Math.min(1, value / goalHint) : 0
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
          {pct > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} />}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center helix-num text-[11px] font-bold text-text">
          {value != null ? Math.round(value) : '—'}
        </span>
      </div>
      <span className="text-[9px] uppercase tracking-wide" style={{ color }}>{label}</span>
    </div>
  )
}

/** Hevy-style colored metadata chip with an emoji glyph. */
function MetaChip({ emoji, value, label, color }: { emoji: string; value: string; label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 border" style={{ borderColor: `${color}40`, background: `${color}14` }}>
      <span aria-hidden="true">{emoji}</span>
      <span className="helix-num font-bold text-fluid-sm tabular-nums" style={{ color }}>{value}</span>
      <span className="text-[9px] uppercase tracking-wide text-muted">{label}</span>
    </span>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-heading text-fluid-base font-bold text-text px-1 pt-2">{children}</h2>
}

function hasScaleMetrics(log: DayVaultData['log']): boolean {
  if (!log) return false
  return [log.weight_kg, log.body_fat_pct, log.muscle_percent, log.water_percent,
    log.lean_mass_kg, log.bone_mineral, log.visceral_fat, log.bmr, log.bmi].some((v) => v != null)
}

/**
 * The Daily Nexus — one logical day in three glowing sections:
 *   1 · Vitals & Nutrition   readiness, fuel, sleep/recovery, vitals, scale
 *   2 · The Workout          Hevy-style metadata block (or a rest/swap block)
 *   3 · Progression & Insights   session #, vs-last comparison, PRs, delete
 */
export default function DailyNexusPage() {
  const { date: raw } = useParams<{ date: string }>()
  const router = useRouter()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw ?? '') ? raw : ''
  const { data, isLoading } = useDayVault(date)
  const [scaleOpen, setScaleOpen] = useState(false)

  if (!date) return <p className="text-muted p-6">Invalid date.</p>

  const era = eraForDate(date)
  const eraMeta = ERA_META[era]
  const schedule = scheduleDayFor(date) // swap-aware
  const sessions = data?.sessions ?? []
  const trained = sessions.length > 0
  const restDay = !trained && schedule === 'rest'
  const { parts } = dayCompleteness(data)
  const unit = weightUnit()
  const log = data?.log
  const n = data?.nutrition
  const score = data?.score?.score ?? null
  const battery = data?.score?.battery_pct ?? null
  const hasScale = hasScaleMetrics(log ?? null)

  const pretty = new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-3">
      {/* ── Back + title ── */}
      <header className="flex items-center gap-3">
        <button onClick={() => router.back()} className="btn-glass shrink-0 min-h-[44px]" aria-label="Back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-fluid-lg font-bold text-text truncate">The Daily Nexus</h1>
          <span className="text-fluid-xs text-muted">{pretty}</span>
        </div>
        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
          style={{ color: eraMeta.color, background: `${eraMeta.color}1a`, border: `1px solid ${eraMeta.color}40` }}>
          {eraMeta.short}
        </span>
      </header>

      {/* ══ SECTION 1 · Vitals & Nutrition ══ */}
      <SectionTitle>Vitals &amp; Nutrition</SectionTitle>

      {/* Readiness hero band */}
      <section className="helix-card flex items-center gap-4 py-4"
        style={{ borderColor: `${scoreColor(score)}30`, boxShadow: score != null ? `0 0 22px ${scoreColor(score)}1f` : undefined }}>
        <div className="relative shrink-0 flex items-center justify-center" style={{ width: 64, height: 64 }}>
          <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90" aria-hidden="true">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
            {score != null && <circle cx="32" cy="32" r="28" fill="none" stroke={scoreColor(score)} strokeWidth="5" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 28} strokeDashoffset={2 * Math.PI * 28 * (1 - score / 100)}
              style={{ filter: `drop-shadow(0 0 5px ${scoreColor(score)}88)` }} />}
          </svg>
          <span className="absolute helix-num text-fluid-lg font-bold" style={{ color: scoreColor(score) }}>{score ?? '—'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-fluid-xs text-muted uppercase tracking-wide">Readiness</span>
            {n?.phase && <span className="text-[10px] font-bold uppercase" style={{ color: phaseDisplay(n.phase, date).color }}>{phaseDisplay(n.phase, date).label}</span>}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-fluid-xs text-muted">Battery</span>
            <span className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <span className="block h-full rounded-full" style={{ width: `${battery ?? 0}%`, background: ICE, boxShadow: `0 0 8px ${ICE}66` }} />
            </span>
            <span className="helix-num text-fluid-xs font-bold" style={{ color: ICE }}>{battery != null ? `${battery}%` : '—'}</span>
          </div>
          <span className="text-[11px] text-muted mt-1 block truncate">{schedule === 'rest' ? 'Zone-2 / Rest' : schedule.label}</span>
        </div>
        <CompletenessArc parts={parts} />
      </section>

      <div className="grid grid-cols-2 gap-3">
        {/* Fuel */}
        <section className="helix-card col-span-2 sm:col-span-1 space-y-2" style={{ borderColor: `${EMBER}26` }}>
          <div className="flex items-baseline justify-between">
            <h3 className="font-heading font-semibold text-fluid-sm text-text flex items-center gap-1.5"><Flame className="w-3.5 h-3.5" style={{ color: MACRO_COLORS.calories }} /> Fuel</h3>
            <span className="helix-num text-fluid-xs font-bold" style={{ color: MACRO_COLORS.calories }}>{n ? `${Math.round(n.calories).toLocaleString()}` : '—'}<span className="text-muted"> kcal</span></span>
          </div>
          {n ? (
            <div className="flex items-center justify-around">
              <MicroRing value={n.protein_g} goalHint={180} color={MACRO_COLORS.protein} label="P" />
              <MicroRing value={n.carbs_g} goalHint={200} color={MACRO_COLORS.carbs} label="C" />
              <MicroRing value={n.fat_g} goalHint={60} color={MACRO_COLORS.fat} label="F" />
            </div>
          ) : <p className="text-fluid-xs text-muted py-2">No nutrition logged.</p>}
        </section>

        {/* Sleep & recovery */}
        <section className="helix-card col-span-2 sm:col-span-1 space-y-2" style={{ borderColor: `${VIOLET}26` }}>
          <h3 className="font-heading font-semibold text-fluid-sm text-text flex items-center gap-1.5"><Moon className="w-3.5 h-3.5" style={{ color: VIOLET }} /> Sleep &amp; Recovery</h3>
          <div className="grid grid-cols-2 gap-2 text-center">
            {[
              { label: 'Sleep', v: log?.sleep_minutes != null ? formatSleep(log.sleep_minutes) : null, c: VIOLET },
              { label: 'RHR', v: log?.avg_rest_heart_rate != null ? `${log.avg_rest_heart_rate}` : null, c: ROSE },
              { label: 'HRV', v: log?.hrv_ms != null ? `${Math.round(log.hrv_ms)}` : null, c: ICE },
              { label: 'Resp', v: log?.respiratory_rate != null ? log.respiratory_rate.toFixed(1) : null, c: CYAN },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-white/[0.02] border border-white/[0.05] px-1 py-1.5">
                <span className="helix-num block text-fluid-xs font-bold text-text leading-tight">{s.v ?? '—'}</span>
                <span className="text-[8px] uppercase tracking-wide" style={{ color: s.c }}>{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Vitals & Body */}
        <section className="helix-card col-span-2 space-y-2">
          <h3 className="font-heading font-semibold text-fluid-sm text-text">Vitals &amp; Body</h3>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            {[
              { label: 'Weight', v: displayWeight(validWeight(log?.weight_kg)), u: unit, c: TEAL },
              { label: 'Steps', v: log?.steps != null ? Math.round(log.steps / 100) / 10 + 'k' : null, u: '', c: '#4FC3FF' },
              { label: 'Water', v: log?.water_ml != null ? mlToL(log.water_ml) : null, u: 'L', c: CYAN },
              { label: 'Active', v: log?.active_energy != null ? Math.round(log.active_energy) : null, u: '', c: EMBER },
              { label: 'Stand', v: log?.stand_hours != null ? `${log.stand_hours}` : null, u: 'h', c: '#43F59B' },
              { label: 'VO₂', v: log?.vo2max ?? null, u: '', c: ICE },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-white/[0.02] border border-white/[0.05] px-1 py-1.5">
                <span className="helix-num block text-fluid-xs font-bold text-text leading-tight">{s.v ?? '—'}{s.v != null && s.u ? s.u : ''}</span>
                <span className="text-[8px] uppercase tracking-wide" style={{ color: s.c }}>{s.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* InBody & Scale — only when a measurement exists (or the user opts to add). */}
      {hasScale ? (
        <InBodyCard date={date} log={log ?? null} />
      ) : scaleOpen ? (
        <InBodyCard date={date} log={log ?? null} defaultOpen />
      ) : (
        <button onClick={() => setScaleOpen(true)}
          className="w-full glass-card px-4 py-3 flex items-center gap-3 text-left text-muted hover:text-text transition-colors">
          <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${TEAL}1a`, color: TEAL }}>
            <Scale className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="flex-1 text-sm font-medium">Add scale metrics (InBody)</span>
          <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
        </button>
      )}

      {/* ══ SECTION 2 · The Workout ══ */}
      <SectionTitle>The Workout</SectionTitle>
      {trained ? (
        sessions.map((s) => (
          <section key={s.id} className="helix-card space-y-3" style={{ borderColor: `${CYAN}30`, boxShadow: `0 0 22px ${CYAN}14` }}>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${CYAN}1a`, color: CYAN }}>
                <Dumbbell className="w-4 h-4" aria-hidden="true" />
              </span>
              <h3 className="font-heading font-bold text-fluid-lg text-text">{s.split[0]?.toUpperCase()}{s.split.slice(1)}</h3>
            </div>
            {/* Hevy-style colored metadata header */}
            <div className="flex flex-wrap gap-2">
              <MetaChip emoji="🏋️" value={`${Math.round(displayWeight(s.volumeKg) ?? 0).toLocaleString()}`} label={unit} color={TEAL} />
              <MetaChip emoji="🔁" value={`${s.setCount ?? '—'}`} label="sets" color={CYAN} />
              <MetaChip emoji="⏱️" value={s.durationMin != null ? `${s.durationMin}` : '—'} label="min" color={VIOLET} />
              <MetaChip emoji="❤️" value={s.avgBpm != null ? `${s.avgBpm}` : '—'} label="bpm" color={ROSE} />
              <MetaChip emoji="🔥" value={s.calories != null ? `${s.calories}` : '—'} label="kcal" color={EMBER} />
            </div>
            <SessionVolumeMini sessionId={s.id} />
          </section>
        ))
      ) : (
        <section className="helix-card space-y-3 text-center" style={{ borderColor: `${VIOLET}30` }}>
          <h3 className="font-heading font-semibold text-fluid-base flex items-center justify-center gap-1.5" style={{ color: VIOLET }}>
            <Moon className="w-4 h-4" /> {restDay ? 'Rest · Zone-2 Recovery' : 'No session logged'}
          </h3>
          <p className="text-fluid-xs text-muted">{restDay ? 'Recovery day — optional light Zone-2 cardio.' : 'This training day has no session yet.'}</p>
          {schedule !== 'rest' && schedule.dayKey && (
            <Link href={`/session?template=${schedule.dayKey}&date=${date}`}
              className="btn-glass w-full justify-center min-h-[44px]" style={{ color: CYAN }}>
              <Dumbbell className="w-4 h-4" aria-hidden="true" /> Log {schedule.label}
            </Link>
          )}
          <SwapDayControl date={date} className="flex flex-col items-center" />
        </section>
      )}

      {/* ══ SECTION 3 · Progression & Insights ══ */}
      {trained && (
        <>
          <SectionTitle>Progression &amp; Insights</SectionTitle>
          {sessions.map((s) => <SessionProgressionCard key={s.id} session={s} date={date} />)}
        </>
      )}

      {/* Recovery + journal */}
      <SleepDebtGauge />
      <SubjectiveBlock date={date} effort={log?.effort_rating ?? null} mood={log?.mood ?? null} journal={log?.journal_md ?? null} />

      {isLoading && <div className="helix-card h-20 animate-pulse" aria-hidden="true" />}
    </div>
  )
}
