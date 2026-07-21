'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Dumbbell, Moon, Flame, Scale, Plus, ChevronRight, ChevronLeft } from 'lucide-react'
import { CompletenessArc } from '@/components/day/CompletenessArc'
import { InBodyCard } from '@/components/day/InBodyCard'
import { SubjectiveBlock } from '@/components/day/SubjectiveBlock'
import { SleepDebtGauge } from '@/components/day/SleepDebtGauge'
import { SessionExerciseList } from '@/components/day/SessionExerciseList'
import { SessionProgressionCard } from '@/components/day/SessionProgressionCard'
import { SwapDayControl } from '@/components/day/SwapDayControl'
import { useDayVault, dayCompleteness, type DayVaultData } from '@/lib/hooks/useDayVault'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { phaseDisplay } from '@/lib/nutrition/phase'
import { ERA_META, eraForDate, scheduleDayFor, PROGRAMS, DEFAULT_PROGRAM_ID, getActiveProgramId } from '@/lib/programs'
import { displayWeight, validWeight, weightUnit, fmtVolume } from '@/lib/utils/units'
import { formatSleep, mlToL } from '@/lib/utils/format'
import { logicalTodayISO } from '@/lib/utils/day'

const VIOLET = '#EC4899'
const ICE = '#38BDF8'
const TEAL = '#8B5CF6'
const CYAN = '#22D3EE'
const EMBER = '#FBBF24'
const ROSE = '#FB7185'

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

/** Program-day label from day_key (→ "Upper B", robust on swaps), else split. */
function sessionLabel(dayKey: string | null | undefined, split: string): string {
  const program = PROGRAMS[getActiveProgramId()] ?? PROGRAMS[DEFAULT_PROGRAM_ID]
  return (dayKey && program.days.find((d) => d.key === dayKey)?.label) ?? (split[0]?.toUpperCase() + split.slice(1))
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

  const shiftDate = (d: string, delta: number) => {
    const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + delta); return x.toISOString().slice(0, 10)
  }
  const prevDate = shiftDate(date, -1)
  const nextDate = shiftDate(date, +1)
  const nextIsFuture = nextDate > logicalTodayISO() // no navigating past today

  return (
    <div className="space-y-3">
      {/* ── Back + title + day nav ── */}
      <header className="flex items-center gap-2">
        <button onClick={() => router.back()} className="btn-glass shrink-0 min-h-[44px]" aria-label="Back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-fluid-lg font-bold text-text truncate">The Daily Nexus</h1>
          <span className="text-fluid-xs text-muted">{pretty}</span>
        </div>
        {/* Previous / Next day — discrete native-feeling chevrons */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => router.push(`/day/${prevDate}`)}
            className="btn-glass min-h-[44px] min-w-[40px] justify-center" aria-label="Previous day">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => router.push(`/day/${nextDate}`)} disabled={nextIsFuture}
            className="btn-glass min-h-[44px] min-w-[40px] justify-center disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Next day">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
          style={{ color: eraMeta.color, background: `${eraMeta.color}1a`, border: `1px solid ${eraMeta.color}40` }}>
          {eraMeta.short}
        </span>
      </header>

      {/* ══ SECTION 1 · Vitals & Nutrition ══ */}
      <SectionTitle>Vitals &amp; Nutrition</SectionTitle>

      {/* Readiness hero band */}
      <section className="helix-card holo-sheen flex items-center gap-4 py-4"
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
            <span className="text-fluid-xs text-muted uppercase tracking-wide">Day Score</span>
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
          {/* Sleep debt folded in — no longer a standalone oversized card */}
          <SleepDebtGauge compact />
        </section>

        {/* Vitals & Body */}
        <section className="helix-card col-span-2 space-y-2">
          <h3 className="font-heading font-semibold text-fluid-sm text-text">Vitals &amp; Body</h3>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            {[
              { label: 'Weight', v: displayWeight(validWeight(log?.weight_kg)), u: unit, c: TEAL },
              { label: 'Steps', v: log?.steps != null ? Math.round(log.steps / 100) / 10 + 'k' : null, u: '', c: '#38BDF8' },
              { label: 'Water', v: log?.water_ml != null ? mlToL(log.water_ml) : null, u: 'L', c: CYAN },
              { label: 'Active', v: log?.active_energy != null ? Math.round(log.active_energy) : null, u: '', c: EMBER },
              { label: 'Stand', v: log?.stand_hours != null ? `${log.stand_hours}` : null, u: 'h', c: '#34D399' },
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

      {/* ══ SECTION 2 · The Workout ══ (hidden as an empty block on rest days) */}
      {trained ? (
        <>
          <SectionTitle>The Workout</SectionTitle>
          {sessions.map((s) => (
            <section key={s.id} className="helix-card holo-sheen space-y-3" style={{ borderColor: `${CYAN}30`, boxShadow: `0 0 24px ${CYAN}18` }}>
              <Link href={`/session/${s.id}`} className="flex items-center gap-2 -m-1 p-1 rounded-lg active:opacity-80 hover:bg-white/[0.03]"
                aria-label={`Open full analysis for ${sessionLabel(s.dayKey, s.split)}`}>
                <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${CYAN}1a`, color: CYAN }}>
                  <Dumbbell className="w-4 h-4" aria-hidden="true" />
                </span>
                <h3 className="font-heading font-bold text-fluid-lg text-text flex-1 min-w-0">{sessionLabel(s.dayKey, s.split)}</h3>
                <span className="text-[10px] font-semibold uppercase tracking-wide shrink-0 flex items-center gap-0.5" style={{ color: CYAN }}>
                  Analyze <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              </Link>
              {/* Hevy-style colored metadata header */}
              <div className="flex flex-wrap gap-2">
                <MetaChip emoji="🏋️" value={fmtVolume(displayWeight(s.volumeKg))} label={unit} color={TEAL} />
                <MetaChip emoji="🔁" value={`${s.setCount ?? '—'}`} label="sets" color={CYAN} />
                <MetaChip emoji="⏱️" value={s.durationMin != null ? `${s.durationMin}` : '—'} label="min" color={VIOLET} />
                <MetaChip emoji="❤️" value={s.avgBpm != null ? `${s.avgBpm}` : '—'} label="bpm" color={ROSE} />
                <MetaChip emoji="🔥" value={s.calories != null ? `${s.calories}` : '—'} label="kcal" color={EMBER} />
              </div>
              <SessionExerciseList sessionId={s.id} />
            </section>
          ))}
        </>
      ) : restDay ? (
        /* Rest day → a compact premium badge, NOT a big empty workout block */
        <section className="helix-card holo-sheen flex items-center gap-3 py-4"
          style={{ borderColor: `${VIOLET}30`, boxShadow: `0 0 24px ${VIOLET}1f` }}>
          <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `${VIOLET}1c`, color: VIOLET, boxShadow: `0 0 18px ${VIOLET}55` }}>
            <Moon className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-heading font-bold text-fluid-base" style={{ color: VIOLET }}>Rest · Zone-2 Recovery</p>
            <p className="text-fluid-xs text-muted">Adaptation happens now — no lifting scheduled.</p>
          </div>
          <SwapDayControl date={date} />
        </section>
      ) : (
        /* A training day with no session yet → the log CTA + swap */
        <>
          <SectionTitle>The Workout</SectionTitle>
          <section className="helix-card space-y-3" style={{ borderColor: `${CYAN}26` }}>
            <p className="text-fluid-sm text-text font-medium">
              No session logged for {schedule !== 'rest' ? schedule.label : 'today'} yet.
            </p>
            {schedule !== 'rest' && schedule.dayKey && (
              <Link href={`/session?template=${schedule.dayKey}&date=${date}`}
                className="btn-primary w-full justify-center min-h-[44px]" style={{ background: CYAN, boxShadow: `0 0 18px ${CYAN}55` }}>
                <Dumbbell className="w-4 h-4" aria-hidden="true" /> Log {schedule.label}
              </Link>
            )}
            <SwapDayControl date={date} />
          </section>
        </>
      )}

      {/* ══ SECTION 3 · Progression & Insights ══ */}
      {trained && (
        <>
          <SectionTitle>Progression &amp; Insights</SectionTitle>
          {sessions.map((s) => <SessionProgressionCard key={s.id} session={s} date={date} />)}
        </>
      )}

      {/* Journal (sleep debt now folded into the Sleep & Recovery block above) */}
      <SubjectiveBlock date={date} effort={log?.effort_rating ?? null} mood={log?.mood ?? null} journal={log?.journal_md ?? null} />

      {isLoading && <div className="helix-card h-20 animate-pulse" aria-hidden="true" />}
    </div>
  )
}
