'use client'

import { useMemo, useState } from 'react'
import { Dumbbell, Layers, Trophy, Flame, Scale, FileText, Loader2, Trash2, Check } from 'lucide-react'
import { useWeekSessions, weekStartOf, isoAddDays } from '@/lib/hooks/useWeekSessions'
import { useWeightTrend } from '@/lib/hooks/useCharts'
import { useReports, useSaveReport, useDeleteReport, type ReportPayload } from '@/lib/hooks/useReports'
import { weekNumberOf } from '@/lib/reports/weekNumber'
import { PROGRAMS, DEFAULT_PROGRAM_ID } from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'
import { weightUnit } from '@/lib/utils/units'

const GOLD = '#F5C15A'

/** Reports Engine — generate + save weekly session / weight-management reports. */
export default function ReportsPage() {
  const today = logicalTodayISO()
  const thisWeek = weekStartOf(today)
  const priorWeek = isoAddDays(thisWeek, -7)
  const [focus, setFocus] = useState<string>(priorWeek)

  const week = useWeekSessions(focus)
  const { data: weightRows } = useWeightTrend(28)
  const saved = useReports()
  const save = useSaveReport()
  const del = useDeleteReport()
  const [savedFlash, setSavedFlash] = useState(false)

  const weekEnd = isoAddDays(focus, 7)
  const program = PROGRAMS[DEFAULT_PROGRAM_ID]

  const payload = useMemo<ReportPayload>(() => {
    const w = week.data
    const rows = (weightRows ?? []).filter((r) => r.date >= focus && r.date < weekEnd).sort((a, b) => a.date.localeCompare(b.date))
    const weights = rows.map((r) => r.weight_kg).filter((v): v is number => v != null)
    const fats = rows.map((r) => r.body_fat_pct).filter((v): v is number => v != null)
    const delta = (xs: number[]) => (xs.length >= 2 ? Math.round((xs[xs.length - 1] - xs[0]) * 10) / 10 : null)
    return {
      volumeKg: w?.totals.volumeKg ?? 0,
      sets: w?.totals.sets ?? 0,
      prs: w?.totals.prs ?? 0,
      calories: w?.totals.calories ?? 0,
      durationMin: w?.totals.durationMin ?? 0,
      sessions: w?.sessions.length ?? 0,
      weightDelta: delta(weights),
      fatDelta: delta(fats),
      days: (w?.sessions ?? []).map((s) => ({
        date: s.date,
        label: (s.dayKey && program.days.find((d) => d.key === s.dayKey)?.label) ?? (s.splitDay[0]?.toUpperCase() + s.splitDay.slice(1)),
        volumeKg: s.volumeKg, prs: s.prCount,
      })),
    }
  }, [week.data, weightRows, focus, weekEnd, program.days])

  const weekNum = weekNumberOf(focus)
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-fluid-2xl font-bold text-text leading-tight">Reports</h1>
          <p className="text-muted text-fluid-sm mt-0.5">Weekly session &amp; weight-management reports · Week {weekNum} · {label(focus)}–{label(isoAddDays(focus, 6))}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-white/[0.08] overflow-hidden">
            {[{ k: priorWeek, t: 'Last week' }, { k: thisWeek, t: 'This week' }].map(({ k, t }) => (
              <button key={k} onClick={() => setFocus(k)}
                className={`px-3 py-2 text-fluid-xs font-semibold ${focus === k ? 'bg-primary/15 text-primary' : 'text-muted hover:text-text'}`}>{t}</button>
            ))}
          </div>
          <button
            onClick={() => save.mutate(
              { kind: 'weekly', week_start: focus, week_number: weekNum, payload },
              { onSuccess: () => { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800) } },
            )}
            disabled={save.isPending}
            className="btn-primary min-h-[40px] text-fluid-xs">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : savedFlash ? <Check className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            {savedFlash ? 'Saved' : 'Generate Report'}
          </button>
        </div>
      </div>

      {/* Live preview of the focused week */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Dumbbell} color="#8B5CF6" label="Volume" value={`${payload.volumeKg.toLocaleString()}`} unit={weightUnit()} />
        <Stat icon={Layers} color="#22D3EE" label="Sets" value={String(payload.sets)} />
        <Stat icon={Trophy} color={GOLD} label="PRs" value={String(payload.prs)} highlight />
        <Stat icon={Flame} color="#FBBF24" label="Calories" value={payload.calories ? payload.calories.toLocaleString() : '—'} />
      </div>
      <section className="helix-card space-y-2">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-primary" aria-hidden="true" />
          <h2 className="font-heading font-semibold text-fluid-base text-text">Weight Management</h2>
        </div>
        <div className="flex gap-6 text-fluid-sm">
          <span className="text-muted">Weight Δ <span className="helix-num font-bold" style={{ color: (payload.weightDelta ?? 0) <= 0 ? '#34D399' : '#FB7185' }}>{payload.weightDelta != null ? `${payload.weightDelta > 0 ? '+' : ''}${payload.weightDelta} ${weightUnit()}` : '—'}</span></span>
          <span className="text-muted">Body-fat Δ <span className="helix-num font-bold" style={{ color: (payload.fatDelta ?? 0) <= 0 ? '#34D399' : '#FB7185' }}>{payload.fatDelta != null ? `${payload.fatDelta > 0 ? '+' : ''}${payload.fatDelta}%` : '—'}</span></span>
        </div>
        {payload.days.length > 0 && (
          <div className="space-y-1 pt-1">
            {payload.days.map((d) => (
              <div key={d.date} className="flex items-center gap-3 text-fluid-xs">
                <span className="flex-1 text-text truncate">{d.label}</span>
                {(d.prs ?? 0) > 0 && <span style={{ color: GOLD }}>{d.prs} PR</span>}
                <span className="helix-num text-muted tabular-nums">{d.volumeKg != null ? `${Math.round(d.volumeKg).toLocaleString()}kg` : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Saved reports */}
      <div>
        <h2 className="font-heading text-fluid-lg font-bold text-text mb-2">Saved Reports</h2>
        {(saved.data?.length ?? 0) === 0 ? (
          <p className="text-fluid-sm text-muted">No saved reports yet — generate one above.</p>
        ) : (
          <div className="space-y-2">
            {saved.data!.map((r) => (
              <div key={r.id} className="helix-card flex items-center gap-3 !py-3">
                <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: '#8B5CF61a', color: '#8B5CF6' }}>
                  <FileText className="w-4 h-4" aria-hidden="true" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text">Week {r.week_number} · {r.payload.sessions} sessions</p>
                  <p className="text-[11px] text-muted">{r.payload.volumeKg.toLocaleString()} kg · {r.payload.prs} PRs · {r.payload.calories ? `${r.payload.calories.toLocaleString()} kcal` : '—'}</p>
                </div>
                <button onClick={() => del.mutate(r.id)} aria-label="Delete report"
                  className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-muted hover:text-danger">
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ icon: Icon, color, label, value, unit, highlight }: {
  icon: typeof Dumbbell; color: string; label: string; value: string; unit?: string; highlight?: boolean
}) {
  return (
    <div className="rounded-2xl p-3.5 flex flex-col gap-2"
      style={{ background: `${color}${highlight ? '1f' : '12'}`, border: `1px solid ${color}${highlight ? '66' : '2e'}`, boxShadow: highlight ? `0 0 24px ${color}22` : undefined }}>
      <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${color}22`, color }}>
        <Icon className="w-4 h-4" aria-hidden="true" />
      </span>
      <div>
        <div className="helix-num font-bold text-fluid-2xl tabular-nums leading-none" style={{ color }}>
          {value}{unit && <span className="text-fluid-xs font-normal ml-1 opacity-70">{unit}</span>}
        </div>
        <div className="text-[11px] text-muted mt-1">{label}</div>
      </div>
    </div>
  )
}
