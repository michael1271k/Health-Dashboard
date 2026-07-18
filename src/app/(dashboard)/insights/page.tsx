'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Dumbbell, Layers, Trophy, Flame, Scale, Percent, Sparkles, HeartPulse } from 'lucide-react'
import { useWeekSessions, weekStartOf, isoAddDays, type WeekSummary } from '@/lib/hooks/useWeekSessions'
import { useWeightTrend } from '@/lib/hooks/useCharts'
import { PROGRAMS, DEFAULT_PROGRAM_ID } from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { MarkdownView } from '@/components/reports/MarkdownView'
import { VitalsGroups } from '@/components/insights/VitalsGroups'

const GOLD = '#F5C15A'
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Weekly Insights — the merged Session Summary + Weekly Vitals tab. */
export default function InsightsPage() {
  return (
    <Suspense fallback={<div className="helix-card h-64 animate-pulse" aria-hidden="true" />}>
      <InsightsInner />
    </Suspense>
  )
}

function InsightsInner() {
  const params = useSearchParams()
  const [view, setView] = useState<'this' | 'prior'>(params.get('week') === 'prior' ? 'prior' : 'this')
  const isPrior = view === 'prior'

  const today = logicalTodayISO()
  const thisWeekStart = weekStartOf(today)
  const focusStart = isPrior ? isoAddDays(thisWeekStart, -7) : thisWeekStart
  const baselineStart = isoAddDays(focusStart, -7)

  const focus = useWeekSessions(focusStart)
  const baseline = useWeekSessions(baselineStart)
  const { data: weightRows } = useWeightTrend(28)

  const weekEndExcl = isoAddDays(focusStart, 7)
  const weekLabel = useMemo(() => {
    const s = new Date(`${focusStart}T12:00:00Z`)
    const e = new Date(`${isoAddDays(focusStart, 6)}T12:00:00Z`)
    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return `${fmt(s)} – ${fmt(e)}`
  }, [focusStart])

  const traj = useMemo(() => {
    const rows = (weightRows ?? [])
      .filter((r) => r.date >= focusStart && r.date < weekEndExcl)
      .sort((a, b) => a.date.localeCompare(b.date))
    const weights = rows.map((r) => displayWeight(r.weight_kg)).filter((v): v is number => v != null)
    const fats = rows.map((r) => r.body_fat_pct).filter((v): v is number => v != null)
    const delta = (xs: number[]) => (xs.length >= 2 ? xs[xs.length - 1] - xs[0] : null)
    return { weights, fats, dWeight: delta(weights), dFat: delta(fats) }
  }, [weightRows, focusStart, weekEndExcl])

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-heading text-fluid-2xl font-bold text-text leading-tight">Weekly Insights</h1>
          <p className="text-muted text-fluid-sm mt-0.5">Session summary · vitals · {weekLabel}</p>
        </div>
        {/* This / Last week segmented toggle */}
        <div className="flex rounded-xl border border-white/[0.08] overflow-hidden shrink-0">
          {(['this', 'prior'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3.5 py-2 text-fluid-xs font-semibold ${view === v ? 'bg-primary/15 text-primary' : 'text-muted hover:text-text'}`}>
              {v === 'this' ? 'This week' : 'Last week'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Session Summary ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <HeroStat icon={Dumbbell} color="#8B5CF6" label="Total Volume"
          value={`${focus.data?.totals.volumeKg.toLocaleString() ?? 0}`} unit="kg"
          delta={pctDelta(focus.data?.totals.volumeKg, baseline.data?.totals.volumeKg)} goodUp />
        <HeroStat icon={Layers} color="#22D3EE" label="Total Sets"
          value={String(focus.data?.totals.sets ?? 0)}
          delta={pctDelta(focus.data?.totals.sets, baseline.data?.totals.sets)} goodUp />
        <HeroStat icon={Trophy} color={GOLD} label="Total PRs" highlight
          value={String(focus.data?.totals.prs ?? 0)} delta={null} />
        <HeroStat icon={Flame} color="#FBBF24" label="Calories Burned"
          value={focus.data?.totals.calories ? focus.data.totals.calories.toLocaleString() : '—'} unit={focus.data?.totals.calories ? 'kcal' : undefined}
          delta={pctDelta(focus.data?.totals.calories, baseline.data?.totals.calories)} goodUp />
      </div>

      <section className="helix-card space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: '#8B5CF61a', color: '#8B5CF6' }}>
            <Scale className="w-4 h-4" aria-hidden="true" />
          </span>
          <h2 className="font-heading font-semibold text-fluid-base text-text">Weight &amp; Fat Trajectory</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TrajTile label="Weight" color="#8B5CF6" series={traj.weights} delta={traj.dWeight} unit={weightUnit()} goodDown fmt={(v) => v.toFixed(1)} />
          <TrajTile label="Body Fat" color="#EC4899" series={traj.fats} delta={traj.dFat} unit="%" goodDown fmt={(v) => v.toFixed(1)} icon={Percent} />
        </div>
      </section>

      <section className="helix-card space-y-2.5">
        <h2 className="font-heading font-semibold text-fluid-base text-text">Sessions</h2>
        <SessionList week={focus.data} />
      </section>

      <CoachVerdict weekStart={focusStart} />

      {/* ── Weekly Vitals ── */}
      <div className="flex items-center gap-2 pt-2">
        <HeartPulse className="w-4 h-4 text-primary" aria-hidden="true" />
        <h2 className="font-heading text-fluid-lg font-bold text-text">Weekly Vitals</h2>
        <span className="text-fluid-xs text-muted">this week vs last · 8-week trend</span>
      </div>
      <VitalsGroups />
    </div>
  )
}

function pctDelta(cur: number | undefined | null, base: number | undefined | null): string | null {
  if (cur == null || base == null || base === 0) return null
  const pct = Math.round(((cur - base) / base) * 100)
  return pct === 0 ? null : `${pct > 0 ? '+' : ''}${pct}%`
}

function HeroStat({ icon: Icon, color, label, value, unit, delta, goodUp, highlight }: {
  icon: typeof Dumbbell; color: string; label: string; value: string; unit?: string
  delta: string | null; goodUp?: boolean; highlight?: boolean
}) {
  const deltaGood = delta ? (delta.startsWith('+') === !!goodUp) : true
  return (
    <div className="rounded-2xl p-3.5 flex flex-col gap-2"
      style={{ background: `${color}${highlight ? '1f' : '12'}`, border: `1px solid ${color}${highlight ? '66' : '2e'}`, boxShadow: highlight ? `0 0 24px ${color}22` : undefined }}>
      <div className="flex items-center justify-between">
        <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${color}22`, color }}>
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>
        {delta && (
          <span className="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md"
            style={{ color: deltaGood ? '#34D399' : '#FB7185', background: deltaGood ? '#34D39914' : '#FB718514' }}>{delta}</span>
        )}
      </div>
      <div>
        <div className="helix-num font-bold text-fluid-2xl tabular-nums leading-none" style={{ color }}>
          {value}{unit && <span className="text-fluid-xs font-normal ml-1 opacity-70">{unit}</span>}
        </div>
        <div className="text-[11px] text-muted mt-1">{label}</div>
      </div>
    </div>
  )
}

function TrajTile({ label, color, series, delta, unit, goodDown, fmt, icon: Icon }: {
  label: string; color: string; series: number[]; delta: number | null; unit: string
  goodDown?: boolean; fmt: (v: number) => string; icon?: typeof Percent
}) {
  const current = series.length ? series[series.length - 1] : null
  const deltaGood = delta == null ? true : (delta < 0) === !!goodDown
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-1" style={{ color }}>
          {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}{label}
        </span>
        <Spark series={series} color={color} />
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="helix-num text-fluid-lg font-bold text-text tabular-nums">
          {current != null ? fmt(current) : '—'}<span className="text-[10px] text-muted font-normal ml-0.5">{unit}</span>
        </span>
        {delta != null && delta !== 0 && (
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: deltaGood ? '#34D399' : '#FB7185' }}>
            {delta > 0 ? '+' : ''}{fmt(delta)} this wk
          </span>
        )}
      </div>
    </div>
  )
}

function SessionList({ week }: { week: WeekSummary | undefined }) {
  const program = PROGRAMS[DEFAULT_PROGRAM_ID]
  if (!week) return <div className="h-16 animate-pulse bg-surface-2 rounded-xl" aria-hidden="true" />
  if (week.sessions.length === 0) return <p className="text-sm text-muted">No sessions this week.</p>
  const dayLabel = (s: WeekSummary['sessions'][number]) =>
    (s.dayKey && program.days.find((d) => d.key === s.dayKey)?.label) ?? (s.splitDay[0]?.toUpperCase() + s.splitDay.slice(1))
  return (
    <div className="space-y-1.5">
      {week.sessions.map((s) => (
        <div key={s.id} className="flex items-center gap-3 rounded-xl bg-white/[0.02] border border-white/[0.05] px-3 py-2">
          <span className="text-[10px] font-bold uppercase text-muted w-8 shrink-0">{WD[new Date(`${s.date}T12:00:00Z`).getUTCDay()]}</span>
          <span className="flex-1 min-w-0 text-sm font-medium text-text truncate">{dayLabel(s)}</span>
          {(s.prCount ?? 0) > 0 && <span className="shrink-0 text-[10px] font-bold" style={{ color: GOLD }}>{s.prCount} PR</span>}
          <span className="shrink-0 helix-num text-xs text-muted tabular-nums">{s.volumeKg != null ? `${Math.round(s.volumeKg).toLocaleString()}kg` : '—'}</span>
        </div>
      ))}
    </div>
  )
}

function CoachVerdict({ weekStart }: { weekStart: string }) {
  const storageKey = `helix_coach_verdict:${weekStart}`
  const [md, setMd] = useState('')
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    try { setMd(localStorage.getItem(storageKey) ?? '') } catch { /* ignore */ }
    setEditing(false)
  }, [storageKey])
  const save = (value: string) => {
    setMd(value)
    try {
      if (value.trim()) localStorage.setItem(storageKey, value)
      else localStorage.removeItem(storageKey)
    } catch { /* ignore */ }
  }
  return (
    <section className="helix-card space-y-3" style={{ borderColor: `${GOLD}2e` }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${GOLD}1a`, color: GOLD }}>
            <Sparkles className="w-4 h-4" aria-hidden="true" />
          </span>
          <h2 className="font-heading font-semibold text-fluid-base text-text">Coach&apos;s Verdict</h2>
        </div>
        <button onClick={() => setEditing((v) => !v)} className="text-fluid-xs font-semibold text-muted hover:text-text min-h-[32px] px-2 rounded-lg">
          {editing ? 'Done' : md ? 'Edit' : 'Paste'}
        </button>
      </div>
      {editing ? (
        <textarea autoFocus rows={8} value={md} onChange={(e) => save(e.target.value)} dir="auto"
          placeholder="Paste your coach's weekly verdict (markdown supported — **bold**, `code`, tables)…"
          className="w-full rounded-xl bg-white/[0.04] border border-white/[0.12] px-3 py-2.5 text-sm text-text placeholder:text-muted/50 outline-none focus:border-primary/40 resize-y leading-relaxed" />
      ) : md ? (
        <div className="rounded-xl bg-black/20 border border-white/[0.06] p-4"><MarkdownView md={md} /></div>
      ) : (
        <button onClick={() => setEditing(true)}
          className="w-full rounded-xl border border-dashed border-white/[0.15] text-muted hover:text-text hover:border-white/[0.3] text-sm py-6 transition-colors">
          Tap to paste the week&apos;s Coach Verdict
        </button>
      )}
    </section>
  )
}

function Spark({ series, color }: { series: number[]; color: string }) {
  if (series.length < 2) return <div className="w-20 h-7 shrink-0" aria-hidden="true" />
  const min = Math.min(...series)
  const max = Math.max(...series)
  const span = max - min || 1
  const W = 80; const H = 28; const PAD = 3
  const denom = Math.max(1, series.length - 1)
  const x = (i: number) => (i / denom) * (W - PAD * 2) + PAD
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2)
  const line = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-20 h-7 shrink-0" aria-hidden="true">
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx={x(series.length - 1)} cy={y(series[series.length - 1])} r="2" fill={color} />
    </svg>
  )
}
