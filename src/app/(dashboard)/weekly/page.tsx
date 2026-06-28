'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useReports, useMonthActivity, useGymReports, type GymReportRow } from '@/lib/hooks/useWeekly'
import { getWeekPhase, phaseBadgeStyle } from '@/lib/phases'
import { FileSystemBrowser } from '@/components/reports/FileSystemBrowser'
import { MarkdownView } from '@/components/reports/MarkdownView'
import { Sheet } from '@/components/ui/Sheet'
import { ChevronLeft, ChevronRight, Loader2, Sparkles, FolderOpen } from 'lucide-react'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x }

function MetaChip({ label, value, accent = '#19E3B1' }: { label: string; value: string; accent?: string }) {
  return (
    <span className="inline-flex flex-col rounded-xl px-3 py-1.5 border" style={{ borderColor: `${accent}40`, background: `${accent}14` }}>
      <span className="text-[9px] uppercase tracking-wide text-muted-vital leading-none">{label}</span>
      <span className="vital-number text-fluid-sm font-bold leading-tight" style={{ color: accent }}>{value}</span>
    </span>
  )
}

export default function WeeklyPage() {
  const qc = useQueryClient()
  const today = new Date()
  const [month, setMonth] = useState({ y: today.getUTCFullYear(), m: today.getUTCMonth() })
  const [focusWeek, setFocusWeek] = useState<string | null>(null)
  const [daySession, setDaySession] = useState<GymReportRow | null>(null)
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
      const res = await fetch('/api/ai/weekly-report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStart }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      await qc.invalidateQueries({ queryKey: ['reports'] })
      openFolder(weekStart)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally { setGenerating(false) }
  }

  function openFolder(weekStart: string) {
    setFocusWeek(weekStart)
    requestAnimationFrame(() => document.getElementById('report-browser')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  function openDay(ds: string) {
    const s = (gymReports ?? []).find((g) => g.date === ds)
    if (s) setDaySession(s)
  }

  const monthLabel = new Date(Date.UTC(month.y, month.m, 1)).toLocaleDateString('en-IL', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-fluid-2xl font-bold text-text">Journey</h1>
        <p className="text-muted-vital text-fluid-sm mt-0.5">Your training timeline · tap a day for its session · tap a phase strip for that week’s files</p>
      </div>

      {/* ── Calendar (compact on mobile, full-width on desktop) ── */}
      <section className="vital-card space-y-2 max-w-md lg:max-w-none">
        <div className="flex items-center justify-between">
          <button onClick={() => setMonth((p) => ({ y: p.m === 0 ? p.y - 1 : p.y, m: p.m === 0 ? 11 : p.m - 1 }))}
            className="p-1.5 rounded-lg hover:bg-white/[0.05] text-muted-vital" aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
          <h2 className="font-heading font-semibold text-text text-fluid-base">{monthLabel}</h2>
          <button onClick={() => setMonth((p) => ({ y: p.m === 11 ? p.y + 1 : p.y, m: p.m === 11 ? 0 : p.m + 1 }))}
            className="p-1.5 rounded-lg hover:bg-white/[0.05] text-muted-vital" aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((d, i) => <div key={i} className="text-[10px] text-muted-vital font-medium">{d}</div>)}
        </div>

        <div className="space-y-1">
          {weeks.map((row) => {
            const weekStart = iso(row[0])
            const phase = getWeekPhase(weekStart)
            const isFocus = focusWeek === weekStart
            return (
              <div key={weekStart} className="space-y-1">
                {/* Neon phase strip spanning the whole week */}
                {phase && (
                  <div style={phaseBadgeStyle(phase.kind, isFocus)} className="w-full flex items-center justify-between rounded-lg pl-2 pr-1 py-0.5">
                    <button onClick={() => openFolder(weekStart)} className="flex items-center gap-1.5 text-[10px] font-bold leading-tight py-0.5" title={`Open ${phase.label} files`}>
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
                      <button key={ds} onClick={() => openDay(ds)} disabled={!hasWorkout}
                        title={hasWorkout ? `Open session for ${ds}` : ds}
                        className={`aspect-square flex flex-col items-center justify-center rounded-md text-[11px] transition-colors
                          ${inMonth ? 'text-text' : 'text-muted-vital/40'} ${hasWorkout ? 'hover:bg-primary/10 cursor-pointer' : 'cursor-default'}`}>
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
      </section>

      {error && <div className="vital-card border-danger/40"><p className="text-danger text-fluid-sm">{error}</p></div>}

      {/* ── File System ── */}
      <div id="report-browser">
        <FileSystemBrowser reports={reports ?? []} gymReports={gymReports ?? []} focusWeek={focusWeek} />
      </div>

      {/* Day → session sheet */}
      <Sheet
        open={!!daySession}
        onClose={() => setDaySession(null)}
        title={daySession ? `${daySession.split[0].toUpperCase()}${daySession.split.slice(1)} · ${new Date(daySession.date + 'T00:00:00').toLocaleDateString('en-IL', { month: 'short', day: 'numeric' })}` : undefined}
      >
        {daySession && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {daySession.durationMin != null && <MetaChip label="Duration" value={`${daySession.durationMin}m`} />}
              {daySession.avgBpm != null && <MetaChip label="Avg BPM" value={`${daySession.avgBpm}`} />}
              {daySession.volumeKg != null && <MetaChip label="Volume" value={`${Math.round(daySession.volumeKg).toLocaleString()} kg`} />}
              {daySession.setCount != null && <MetaChip label="Sets" value={`${daySession.setCount}`} />}
              {(daySession.prCount ?? 0) > 0 && <MetaChip label="PRs" value={`${daySession.prCount}`} accent="#E8C57A" />}
            </div>
            <MarkdownView md={daySession.reportMd} />
          </div>
        )}
      </Sheet>
    </div>
  )
}
