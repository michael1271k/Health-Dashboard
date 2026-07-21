'use client'

import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { GitBranch, LineChart, HeartPulse, CalendarDays, ChevronLeft, ChevronRight, Loader2, Sparkles, FolderOpen, Scale } from 'lucide-react'
import { useMonthActivity, useGymReports } from '@/lib/hooks/useWeekly'
import { useReports } from '@/lib/hooks/useReports'
import { useWeightTrend } from '@/lib/hooks/useCharts'
import { getWeekPhase, phaseBadgeStyle } from '@/lib/phases'
import { useEraFilter } from '@/lib/era/eraFilter'
import { EraFilterPills } from '@/components/era/EraFilterPills'
import { FileSystemBrowser } from '@/components/reports/FileSystemBrowser'
import { PathfinderTimeline } from '@/components/pathfinder/PathfinderTimeline'
import { AnalyticsPanel } from '@/components/progression/AnalyticsPanel'
import { VitalsGroups } from '@/components/insights/VitalsGroups'
import { ScheduleShortcut } from '@/components/day/ScheduleShortcut'
import { Sheet } from '@/components/ui/Sheet'
import { authedFetch } from '@/lib/utils/authedFetch'
import { displayWeight, weightUnit } from '@/lib/utils/units'

type View = 'timeline' | 'analytics' | 'vitals'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x }

/**
 * Pathfinder — the unified life-over-time tab. Merges the old Journey (daily)
 * and Progress (weekly analytics + vitals) tabs into one surface: a Timeline of
 * week capsules with nested day rows, plus Analytics and Vitals sub-views. Weight
 * management lives here too (a current-weight chip → Analytics; entry stays in
 * the Daily Nexus InBody card). Replaces /weekly and /progression.
 */
export default function PathfinderPage() {
  return (
    <Suspense fallback={<div className="helix-card h-64 animate-pulse" aria-hidden="true" />}>
      <PathfinderInner />
    </Suspense>
  )
}

function PathfinderInner() {
  const params = useSearchParams()
  const initial = params.get('view')
  const [view, setView] = useState<View>(
    initial === 'analytics' ? 'analytics' : initial === 'vitals' ? 'vitals' : 'timeline',
  )

  const qc = useQueryClient()
  const router = useRouter()
  const { era } = useEraFilter()
  const today = new Date()
  const [month, setMonth] = useState({ y: today.getUTCFullYear(), m: today.getUTCMonth() })
  const [calOpen, setCalOpen] = useState(false)
  const [filesWeek, setFilesWeek] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genWeek, setGenWeek] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: reports } = useReports()
  const { data: gymReports } = useGymReports(60)
  const { data: weightRows } = useWeightTrend(120)
  const latestWeight = weightRows?.length ? weightRows[weightRows.length - 1].weight_kg : null

  const weeks = useMemo(() => {
    const first = new Date(Date.UTC(month.y, month.m, 1))
    const gridStart = addDays(first, -first.getUTCDay())
    return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)))
  }, [month])

  const { data: activity } = useMonthActivity(iso(weeks[0][0]), iso(weeks[5][6]))
  const monthLabel = new Date(Date.UTC(month.y, month.m, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const openDay = (d: string) => {
    try { sessionStorage.setItem('helix_last_day', d) } catch { /* ignore */ }
    router.push(`/day/${d}`)
  }

  async function generate(weekStart: string) {
    setGenWeek(weekStart); setGenerating(true); setError(null)
    try {
      const res = await authedFetch('/api/ai/weekly-report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStart }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      await qc.invalidateQueries({ queryKey: ['reports'] })
      setCalOpen(false)
      setFilesWeek(weekStart)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally { setGenerating(false) }
  }

  return (
    <div className="space-y-5">
      {/* ── Header + sub-view switcher ── */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-heading text-fluid-2xl font-bold text-text leading-tight">Pathfinder</h1>
          <p className="text-muted text-fluid-sm mt-0.5">Your life over time · days, weeks, performance &amp; vitals</p>
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

      {view === 'timeline' ? (
        <>
          {/* Era filter + jump-to-date + current-weight chip */}
          <div className="flex items-center gap-2 flex-wrap">
            <EraFilterPills label="" />
            <div className="flex-1" />
            {latestWeight != null && (
              <button onClick={() => setView('analytics')}
                className="btn-glass shrink-0 min-h-[40px] text-fluid-xs" aria-label="Open body-composition analytics">
                <Scale className="w-3.5 h-3.5" /> <span className="helix-num">{displayWeight(latestWeight)}{weightUnit()}</span>
              </button>
            )}
            <button onClick={() => setCalOpen(true)} className="btn-glass shrink-0 min-h-[40px] text-fluid-xs" aria-label="Jump to a date">
              <CalendarDays className="w-3.5 h-3.5" /> Jump
            </button>
          </div>

          <ScheduleShortcut />

          {error && <div className="helix-card border-danger/40"><p className="text-danger text-fluid-sm">{error}</p></div>}

          <PathfinderTimeline />

          {/* ── Calendar-jump sheet ── */}
          <Sheet open={calOpen} onClose={() => setCalOpen(false)} title={monthLabel}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <button onClick={() => setMonth((p) => ({ y: p.m === 0 ? p.y - 1 : p.y, m: p.m === 0 ? 11 : p.m - 1 }))}
                  className="p-2 rounded-lg hover:bg-white/[0.05] text-muted min-h-[40px]" aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
                <span className="font-heading font-semibold text-text text-fluid-base">{monthLabel}</span>
                <button onClick={() => setMonth((p) => ({ y: p.m === 11 ? p.y + 1 : p.y, m: p.m === 11 ? 0 : p.m + 1 }))}
                  className="p-2 rounded-lg hover:bg-white/[0.05] text-muted min-h-[40px]" aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS.map((d, i) => <div key={i} className="text-[10px] text-muted font-medium">{d}</div>)}
              </div>

              <div className="space-y-1">
                {weeks.map((row) => {
                  const weekStart = iso(row[0])
                  const phase = getWeekPhase(weekStart)
                  return (
                    <div key={weekStart} className="space-y-1">
                      {phase && (
                        <div style={phaseBadgeStyle(phase.kind, filesWeek === weekStart, phase.era)} className="w-full flex items-center justify-between rounded-lg pl-2 pr-1 py-0.5">
                          <button onClick={() => { setCalOpen(false); setFilesWeek(weekStart) }} className="flex items-center gap-1.5 text-[10px] font-bold leading-tight py-0.5" title={`Open ${phase.label} files`}>
                            <FolderOpen className="w-3 h-3" /> {phase.label}
                          </button>
                          <button onClick={() => generate(weekStart)} disabled={generating} aria-label={`Generate ${phase.label} report`}
                            className="p-1 rounded hover:bg-white/10 opacity-80 hover:opacity-100">
                            {generating && genWeek === weekStart ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                          </button>
                        </div>
                      )}
                      <div className="grid grid-cols-7 gap-1">
                        {row.map((day) => {
                          const ds = iso(day)
                          const inMonth = day.getUTCMonth() === month.m
                          const hasWorkout = activity?.workoutDates.has(ds)
                          const hasScore = activity?.dataDates.has(ds)
                          return (
                            <button key={ds} onClick={() => { setCalOpen(false); openDay(ds) }}
                              title={`Open ${ds}`}
                              className={`aspect-square flex flex-col items-center justify-center rounded-md text-[11px] transition-colors hover:bg-primary/10
                                ${inMonth ? 'text-text' : 'text-muted/40'}`}>
                              <span>{day.getUTCDate()}</span>
                              <span className="flex gap-0.5 mt-0.5 h-1">
                                {hasWorkout && <span className="w-1 h-1 rounded-full bg-primary" />}
                                {hasScore && !hasWorkout && <span className="w-1 h-1 rounded-full bg-muted" />}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              <p className="text-[11px] text-muted flex gap-3 flex-wrap pt-1">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" /> workout</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-muted inline-block" /> logged</span>
              </p>
            </div>
          </Sheet>

          {/* ── Week files sheet (reports drill) ── */}
          <Sheet open={!!filesWeek} onClose={() => setFilesWeek(null)} title="Week files">
            {filesWeek && (
              <FileSystemBrowser reports={reports ?? []} gymReports={gymReports ?? []} focusWeek={filesWeek} era={era} />
            )}
          </Sheet>
        </>
      ) : view === 'analytics' ? (
        <AnalyticsPanel />
      ) : (
        <VitalsGroups />
      )}
    </div>
  )
}
