'use client'

import { Suspense, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { GitBranch, LineChart, HeartPulse, CalendarDays, ChevronLeft, ChevronRight, FolderOpen, Scale, Radar } from 'lucide-react'
import { useMonthActivity, monthActivitySets, useGymReports } from '@/lib/hooks/useWeekly'
import { useReports } from '@/lib/hooks/useReports'
import { useWeightTrend } from '@/lib/hooks/useCharts'
import { getWeekPhase, phaseBadgeStyle } from '@/lib/phases'
import { ActivePlanBadge } from '@/components/ActivePlanBadge'
import { useEraFilter } from '@/lib/era/eraFilter'
import { EraFilterPills } from '@/components/era/EraFilterPills'
import { FileSystemBrowser } from '@/components/reports/FileSystemBrowser'
import { PathfinderTimeline } from '@/components/pathfinder/PathfinderTimeline'
import { WidgetBoundary } from '@/components/fx/WidgetBoundary'
// Both render only for their own sub-view, but were imported eagerly — so the
// Timeline (the default view) paid for a recharts-backed analytics panel and a
// 56-day vitals grid it never showed.
const AnalyticsPanel = dynamic(() => import('@/components/progression/AnalyticsPanel').then((m) => m.AnalyticsPanel), { ssr: false })
const VitalsGroups = dynamic(() => import('@/components/insights/VitalsGroups').then((m) => m.VitalsGroups), { ssr: false })
import { ScheduleShortcut } from '@/components/day/ScheduleShortcut'
import { Sheet } from '@/components/ui/Sheet'
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
    <Suspense fallback={<div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-64 animate-pulse" aria-hidden="true" />}>
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

  const router = useRouter()
  const { era } = useEraFilter()
  // Lazy initialiser: `new Date()` must not run on every render (it made the
  // month state a fresh object each pass and re-keyed the activity query).
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return { y: now.getUTCFullYear(), m: now.getUTCMonth() }
  })
  const [calOpen, setCalOpen] = useState(false)
  const [filesWeek, setFilesWeek] = useState<string | null>(null)

  const { data: reports } = useReports()
  const { data: gymReports } = useGymReports(60)
  // 400, not 120, to share `useTimelineWeeks`'s cache entry — the two windows
  // were separate query keys fetching overlapping data on the same mount, and
  // all this needs is the newest row.
  const { data: weightRows } = useWeightTrend(400)
  const latestWeight = weightRows?.length ? weightRows[weightRows.length - 1].weight_kg : null

  const weeks = useMemo(() => {
    const first = new Date(Date.UTC(month.y, month.m, 1))
    const gridStart = addDays(first, -first.getUTCDay())
    return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)))
  }, [month])

  // Calendar-only data: gated on the sheet actually being open. It used to fire
  // on mount, so opening Momentum straight after launch stacked this on top of
  // the timeline + continuum + weekly-export fetches in one cold burst.
  const { data: activity } = useMonthActivity(iso(weeks[0][0]), iso(weeks[5][6]), calOpen)
  // The hook returns JSON-safe arrays (a persisted Set rehydrates as a plain
  // object with no .has — the cold-open calendar crash); Sets are rebuilt here.
  const activitySets = useMemo(() => monthActivitySets(activity), [activity])
  const monthLabel = new Date(Date.UTC(month.y, month.m, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const openDay = (d: string) => {
    try { sessionStorage.setItem('helix_last_day', d) } catch { /* ignore */ }
    router.push(`/day/${d}`)
  }

  return (
    <div data-boxed className="space-y-5">
      {/* ── Header + sub-view switcher ── */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="font-heading text-fluid-2xl font-bold text-text leading-tight">Progress</h1>
            <ActivePlanBadge />
          </div>
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
          {/* The AI loop lives INSIDE each week capsule now — Export Week and
              Paste AI Report act on the week you're looking at, and the timeline
              is the first thing on screen rather than sitting below a card. */}
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
            <Link href="/reports" className="btn-glass shrink-0 min-h-[40px] text-fluid-xs" aria-label="All weekly reports">
              <Radar className="w-3.5 h-3.5" /> Reports
            </Link>
            <button onClick={() => setCalOpen(true)} className="btn-glass shrink-0 min-h-[40px] text-fluid-xs" aria-label="Jump to a date">
              <CalendarDays className="w-3.5 h-3.5" /> Jump
            </button>
          </div>

          <ScheduleShortcut />

          {/* Blast radius: the timeline mounts the heaviest subtree in the app
              (week capsules → continuum days → per-week export builder). Without
              a boundary a single throw in there escaped to global-error, which
              nukes the service worker and hard-reloads — the "Momentum crashes
              the app" report. Now it degrades to a retry card. */}
          <WidgetBoundary label="Timeline" minHeight={200}>
            <PathfinderTimeline />
          </WidgetBoundary>

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
                          {/* The "Generate AI report" spark is gone — reports are
                              pasted in from the week capsule, not generated here. */}
                          <button onClick={() => { setCalOpen(false); setFilesWeek(weekStart) }} className="flex items-center gap-1.5 text-[10px] font-bold leading-tight py-0.5" title={`Open ${phase.label} files`}>
                            <FolderOpen className="w-3 h-3" /> {phase.label}
                          </button>
                        </div>
                      )}
                      <div className="grid grid-cols-7 gap-1">
                        {row.map((day) => {
                          const ds = iso(day)
                          const inMonth = day.getUTCMonth() === month.m
                          const hasWorkout = activitySets.workouts.has(ds)
                          const hasScore = activitySets.data.has(ds)
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
        <WidgetBoundary label="Analytics" minHeight={200}><AnalyticsPanel /></WidgetBoundary>
      ) : (
        <WidgetBoundary label="Vitals" minHeight={200}><VitalsGroups /></WidgetBoundary>
      )}
    </div>
  )
}
