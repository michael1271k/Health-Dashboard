'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Dumbbell, Moon, Flame } from 'lucide-react'
import { SessionIntelCard } from '@/components/reports/SessionIntelCard'
import { CompletenessArc } from '@/components/day/CompletenessArc'
import { InBodyCard } from '@/components/day/InBodyCard'
import { SubjectiveBlock } from '@/components/day/SubjectiveBlock'
import { SleepDebtGauge } from '@/components/day/SleepDebtGauge'
import { SessionVolumeMini } from '@/components/day/SessionVolumeMini'
import { useDayVault, dayCompleteness } from '@/lib/hooks/useDayVault'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { phaseDisplay } from '@/lib/nutrition/phase'
import { ERA_META, eraForDate, scheduleDayFor } from '@/lib/programs'
import { displayWeight, validWeight, weightUnit } from '@/lib/utils/units'
import { formatSleep, mlToL } from '@/lib/utils/format'

const VIOLET = '#8B7CFF'
const ICE = '#6FE9FF'
const TEAL = '#16F5C3'

function scoreColor(score: number | null | undefined): string {
  if (score == null) return '#8B97B2'
  if (score >= 80) return TEAL
  if (score >= 60) return '#3EE0FF'
  if (score >= 40) return '#FFB86B'
  return '#FF5470'
}

/** A micro macro ring (adherence = intake / goal-ish hint). */
function MicroRing({ value, goalHint, color, label }: { value: number | null | undefined; goalHint: number; color: string; label: string }) {
  const size = 40, stroke = 4
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
        <span className="absolute inset-0 flex items-center justify-center helix-num text-[10px] font-bold text-text">
          {value != null ? Math.round(value) : '—'}
        </span>
      </div>
      <span className="text-[9px] uppercase tracking-wide" style={{ color }}>{label}</span>
    </div>
  )
}

/**
 * The Daily Nexus — one logical day as a living command surface: a readiness
 * hero band over a dynamic grid of glass blocks (Fuel · Train/Recovery · Vitals
 * · Journal) that reflow by importance. Trained days show an inline volume-
 * structure graph; rest days become a deliberate recovery block.
 */
export default function DailyNexusPage() {
  const { date: raw } = useParams<{ date: string }>()
  const router = useRouter()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw ?? '') ? raw : ''
  const { data, isLoading } = useDayVault(date)

  if (!date) return <p className="text-muted p-6">Invalid date.</p>

  const era = eraForDate(date)
  const eraMeta = ERA_META[era]
  const schedule = scheduleDayFor(date)
  const trained = (data?.sessions.length ?? 0) > 0
  const restDay = !trained && schedule === 'rest'
  const { parts } = dayCompleteness(data)
  const unit = weightUnit()
  const log = data?.log
  const n = data?.nutrition
  const score = data?.score?.score ?? null
  const battery = data?.score?.battery_pct ?? null

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

      {/* ── Readiness hero band ── */}
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

      {/* ── Dynamic grid ── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Fuel block — micro rings */}
        <section className="helix-card col-span-2 sm:col-span-1 space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading font-semibold text-fluid-sm text-text flex items-center gap-1.5"><Flame className="w-3.5 h-3.5" style={{ color: MACRO_COLORS.calories }} /> Fuel</h2>
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

        {/* Train OR Recovery block */}
        {trained ? (
          <section className="helix-card col-span-2 sm:col-span-1 space-y-2" style={{ borderColor: '#3EE0FF30' }}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-heading font-semibold text-fluid-sm text-text flex items-center gap-1.5"><Dumbbell className="w-3.5 h-3.5" style={{ color: '#3EE0FF' }} /> Train</h2>
              <span className="text-fluid-xs text-muted truncate">{data!.sessions[0].split[0]?.toUpperCase()}{data!.sessions[0].split.slice(1)}</span>
            </div>
            <SessionVolumeMini sessionId={data!.sessions[0].id} />
            <div className="flex items-center justify-between text-[10px] text-muted">
              <span>{data!.sessions[0].setCount ?? '—'} sets</span>
              <span className="helix-num" style={{ color: TEAL }}>{data!.sessions[0].volumeKg != null ? `${((displayWeight(data!.sessions[0].volumeKg) ?? 0) / 1000).toFixed(1)}${unit === 'lb' ? 'k' : 't'}` : '—'}</span>
              {(data!.sessions[0].prCount ?? 0) > 0 && <span style={{ color: ICE }}>{data!.sessions[0].prCount} PR</span>}
            </div>
          </section>
        ) : (
          <section className="helix-card col-span-2 sm:col-span-1 space-y-2 text-center" style={{ borderColor: `${VIOLET}30` }}>
            <h2 className="font-heading font-semibold text-fluid-sm flex items-center justify-center gap-1.5" style={{ color: VIOLET }}><Moon className="w-3.5 h-3.5" /> {restDay ? 'Recovery' : 'No session'}</h2>
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <span className="text-muted">HRV <span className="helix-num text-text">{log?.hrv_ms != null ? Math.round(log.hrv_ms) : '—'}</span></span>
              <span className="text-muted">Zone-2 <span className="helix-num text-text">{log?.exercise_minutes ?? log?.training_minutes ?? '—'}m</span></span>
            </div>
            {schedule !== 'rest' && schedule.dayKey && (
              <Link href={`/session?template=${schedule.dayKey}&date=${date}`}
                className="btn-glass w-full justify-center min-h-[40px] text-fluid-xs" style={{ color: '#3EE0FF' }}>
                <Dumbbell className="w-3.5 h-3.5" aria-hidden="true" /> Log {schedule.label}
              </Link>
            )}
          </section>
        )}

        {/* Vitals block */}
        <section className="helix-card col-span-2 space-y-2">
          <h2 className="font-heading font-semibold text-fluid-sm text-text">Vitals & Body</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            {[
              { label: 'Weight', v: displayWeight(validWeight(log?.weight_kg)), u: unit, c: TEAL },
              { label: 'Steps', v: log?.steps != null ? Math.round(log.steps / 100) / 10 + 'k' : null, u: '', c: '#4FC3FF' },
              { label: 'Water', v: log?.water_ml != null ? mlToL(log.water_ml) : null, u: 'L', c: '#3EE0FF' },
              { label: 'Sleep', v: log?.sleep_minutes != null ? formatSleep(log.sleep_minutes) : null, u: '', c: VIOLET },
              { label: 'RHR', v: log?.avg_rest_heart_rate, u: '', c: '#FF5470' },
              { label: 'VO₂', v: log?.vo2max, u: '', c: ICE },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-white/[0.02] border border-white/[0.05] px-1 py-1.5">
                <span className="helix-num block text-fluid-xs font-bold text-text leading-tight">{s.v ?? '—'}{s.v != null && s.u ? s.u : ''}</span>
                <span className="text-[8px] uppercase tracking-wide" style={{ color: s.c }}>{s.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* InBody & Scale Metrics — manual entry for what Apple Health can't sync */}
      <InBodyCard date={date} log={log ?? null} />

      {/* Full session intel when trained */}
      {trained && data!.sessions.map((s) => <SessionIntelCard key={s.id} session={s} />)}

      <SleepDebtGauge />

      <SubjectiveBlock date={date} effort={log?.effort_rating ?? null} mood={log?.mood ?? null} journal={log?.journal_md ?? null} />

      {isLoading && <div className="helix-card h-20 animate-pulse" aria-hidden="true" />}
    </div>
  )
}
