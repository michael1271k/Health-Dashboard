'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useReports, useMonthActivity, useGymReports } from '@/lib/hooks/useWeekly'
import { getWeekPhase, phaseBadgeStyle } from '@/lib/phases'
import { FileSystemBrowser } from '@/components/reports/FileSystemBrowser'
import { ContinuumTimeline } from '@/components/timeline/ContinuumTimeline'
import { Sheet } from '@/components/ui/Sheet'
import { authedFetch } from '@/lib/utils/authedFetch'
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Sparkles, FolderOpen } from 'lucide-react'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x }

/**
 * Journey — the Continuum. A unified day-first timeline is the
 * primary surface (tap a day → its Day Vault); the month calendar became a
 * jump popover, and weekly report files open in a sheet from the week nodes.
 */
export default function WeeklyPage() {
  const qc = useQueryClient()
  const router = useRouter()
  const today = new Date()
  const [month, setMonth] = useState({ y: today.getUTCFullYear(), m: today.getUTCMonth() })
  const [era, setEra] = useState<'all' | 'ppl' | 'axis'>('all')
  const [calOpen, setCalOpen] = useState(false)
  const [filesWeek, setFilesWeek] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genWeek, setGenWeek] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: reports } = useReports()
  const { data: gymReports } = useGymReports(60)

  const weeks = useMemo(() => {
    const first = new Date(Date.UTC(month.y, month.m, 1))
    const gridStart = addDays(first, -first.getUTCDay())
    return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)))
  }, [month])

  const { data: activity } = useMonthActivity(iso(weeks[0][0]), iso(weeks[5][6]))

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

  const monthLabel = new Date(Date.UTC(month.y, month.m, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-5">
      {/* ── Header + calendar-jump ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-fluid-2xl font-bold text-text">Journey</h1>
          <p className="text-muted-vital text-fluid-sm mt-0.5">Every day, one record · tap a day to open its vault</p>
        </div>
        <button onClick={() => setCalOpen(true)} className="btn-glass shrink-0 min-h-[44px]" aria-label="Jump to a date">
          <CalendarDays className="w-4 h-4" /> Jump
        </button>
      </div>

      {/* ── Era filter ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {([['all', 'All', '#19E3B1'], ['axis', 'HELIX Era', '#3EE0FF'], ['ppl', 'PPL Legacy', '#8B97B2']] as const).map(([k, label, color]) => {
          const active = era === k
          return (
            <button key={k} onClick={() => setEra(k)}
              className="px-3 py-1.5 rounded-xl text-fluid-xs font-semibold border transition-colors"
              style={active ? { color, borderColor: `${color}55`, background: `${color}1f`, boxShadow: `0 0 10px ${color}33` } : { color: '#8B97B2', borderColor: 'transparent' }}>
              {label}
            </button>
          )
        })}
      </div>

      {error && <div className="helix-card border-danger/40"><p className="text-danger text-fluid-sm">{error}</p></div>}

      {/* ── The Continuum ── */}
      <ContinuumTimeline era={era} onOpenWeek={(ws) => setFilesWeek(ws)} />

      {/* ── Calendar-jump sheet ── */}
      <Sheet open={calOpen} onClose={() => setCalOpen(false)} title={monthLabel}>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <button onClick={() => setMonth((p) => ({ y: p.m === 0 ? p.y - 1 : p.y, m: p.m === 0 ? 11 : p.m - 1 }))}
              className="p-2 rounded-lg hover:bg-white/[0.05] text-muted-vital min-h-[40px]" aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
            <span className="font-heading font-semibold text-text text-fluid-base">{monthLabel}</span>
            <button onClick={() => setMonth((p) => ({ y: p.m === 11 ? p.y + 1 : p.y, m: p.m === 11 ? 0 : p.m + 1 }))}
              className="p-2 rounded-lg hover:bg-white/[0.05] text-muted-vital min-h-[40px]" aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((d, i) => <div key={i} className="text-[10px] text-muted-vital font-medium">{d}</div>)}
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
                        <button key={ds} onClick={() => { setCalOpen(false); router.push(`/day/${ds}`) }}
                          title={`Open ${ds}`}
                          className={`aspect-square flex flex-col items-center justify-center rounded-md text-[11px] transition-colors hover:bg-primary/10
                            ${inMonth ? 'text-text' : 'text-muted-vital/40'}`}>
                          <span>{day.getUTCDate()}</span>
                          <span className="flex gap-0.5 mt-0.5 h-1">
                            {hasWorkout && <span className="w-1 h-1 rounded-full bg-primary" />}
                            {hasScore && !hasWorkout && <span className="w-1 h-1 rounded-full bg-muted-vital" />}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-[11px] text-muted-vital flex gap-3 flex-wrap pt-1">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" /> workout</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-muted-vital inline-block" /> logged</span>
          </p>
        </div>
      </Sheet>

      {/* ── Week files sheet (reports drill) ── */}
      <Sheet open={!!filesWeek} onClose={() => setFilesWeek(null)} title="Week files">
        {filesWeek && (
          <FileSystemBrowser reports={reports ?? []} gymReports={gymReports ?? []} focusWeek={filesWeek} era={era} />
        )}
      </Sheet>
    </div>
  )
}
