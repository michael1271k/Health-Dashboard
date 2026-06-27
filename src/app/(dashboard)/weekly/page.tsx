'use client'

import { Fragment, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useReports, useMonthActivity, useGymReports } from '@/lib/hooks/useWeekly'
import { PPL_SPLITS, type SplitDay } from '@/lib/types/workout'
import { getWeekPhase, phaseBadgeStyle } from '@/lib/phases'
import { ChevronLeft, ChevronRight, Loader2, Dumbbell, Scale } from 'lucide-react'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x }

export default function WeeklyPage() {
  const qc = useQueryClient()
  const today = new Date()
  const [month, setMonth] = useState({ y: today.getUTCFullYear(), m: today.getUTCMonth() })
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: reports } = useReports()
  const { data: gymReports } = useGymReports()

  const weeks = useMemo(() => {
    const first = new Date(Date.UTC(month.y, month.m, 1))
    const gridStart = addDays(first, -first.getUTCDay())
    return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)))
  }, [month])

  const gridFrom = iso(weeks[0][0])
  const gridTo = iso(weeks[5][6])
  const { data: activity } = useMonthActivity(gridFrom, gridTo)

  async function generate(weekStart: string) {
    setSelectedWeekStart(weekStart)
    setGenerating(true); setError(null); setReport(null)
    try {
      const res = await fetch('/api/ai/weekly-report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStart }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      setReport(data.contentMd ?? null)
      qc.invalidateQueries({ queryKey: ['reports'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally { setGenerating(false) }
  }

  const monthLabel = new Date(Date.UTC(month.y, month.m, 1)).toLocaleDateString('en-IL', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-fluid-2xl font-bold text-text">Weekly Summaries</h1>
        <p className="text-muted-vital text-fluid-sm mt-0.5">Pick a week → unified weight + gym report</p>
      </div>

      {/* ── Calendar ── */}
      <section className="vital-card space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setMonth((p) => ({ y: p.m === 0 ? p.y - 1 : p.y, m: p.m === 0 ? 11 : p.m - 1 }))}
            className="p-1.5 rounded-lg hover:bg-white/[0.05] text-muted-vital" aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
          <h2 className="font-heading font-semibold text-text">{monthLabel}</h2>
          <button onClick={() => setMonth((p) => ({ y: p.m === 11 ? p.y + 1 : p.y, m: p.m === 11 ? 0 : p.m + 1 }))}
            className="p-1.5 rounded-lg hover:bg-white/[0.05] text-muted-vital" aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-[3.2rem_repeat(7,1fr)] gap-1 text-center items-center">
          <div />
          {WEEKDAYS.map((d, i) => <div key={i} className="text-[10px] text-muted-vital font-medium pb-1">{d}</div>)}

          {weeks.map((row) => {
            const weekStart = iso(row[0])
            const selected = selectedWeekStart === weekStart
            const phase = getWeekPhase(weekStart)
            return (
              <Fragment key={weekStart}>
                {/* Epic phase badge / generate trigger */}
                <button
                  onClick={() => generate(weekStart)}
                  disabled={generating}
                  title={phase ? phase.label : `Generate report for week of ${weekStart}`}
                  aria-label={phase ? `${phase.label} — generate report` : `Generate report for week of ${weekStart}`}
                  className={`text-[9px] font-bold leading-tight rounded-lg py-1 px-1 my-0.5 transition-all
                    ${phase ? '' : 'text-muted-vital hover:bg-white/[0.05]'}`}
                  style={phase ? phaseBadgeStyle(phase.kind, selected) : {}}
                >
                  {generating && selected
                    ? <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                    : (phase ? phase.short : 'Go')}
                </button>
                {row.map((day) => {
                  const ds = iso(day)
                  const inMonth = day.getUTCMonth() === month.m
                  const hasWorkout = activity?.workoutDates.has(ds)
                  const hasScore = activity?.dataDates.has(ds)
                  return (
                    <div key={ds} className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs
                      ${inMonth ? 'text-text' : 'text-muted-vital/40'} ${selected ? 'bg-primary/5' : ''}`}>
                      <span>{day.getUTCDate()}</span>
                      <span className="flex gap-0.5 mt-0.5 h-1">
                        {hasWorkout && <span className="w-1 h-1 rounded-full bg-primary" />}
                        {hasScore && !hasWorkout && <span className="w-1 h-1 rounded-full bg-muted-vital" />}
                      </span>
                    </div>
                  )
                })}
              </Fragment>
            )
          })}
        </div>
        <p className="text-[11px] text-muted-vital flex gap-3 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" /> workout</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-muted-vital inline-block" /> logged</span>
          {selectedWeekStart && getWeekPhase(selectedWeekStart) && (
            <span className="ml-auto font-semibold text-text">{getWeekPhase(selectedWeekStart)!.label}</span>
          )}
        </p>
      </section>

      {error && <div className="vital-card border-danger/40"><p className="text-danger text-sm">{error}</p></div>}
      {generating && (
        <div className="vital-card flex items-center gap-3 text-muted-vital text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-primary" /> Generating unified report…
        </div>
      )}
      {report && (
        <article className="vital-card whitespace-pre-wrap text-text text-sm leading-relaxed">{report}</article>
      )}

      {/* ── Dual folders ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Folder
          title="Weight Management Summaries"
          icon={<Scale className="w-4 h-4 text-primary" />}
          empty="No weekly summaries yet. Pick a week above to generate one."
          items={(reports ?? []).map((r) => ({
            id: r.id,
            head: <>{r.period_start} → {r.period_end}{r.notion_page_id && <span className="text-xs text-primary ml-2">Notion ✓</span>}</>,
            body: r.content_md,
          }))}
        />
        <Folder
          title="Gym Session Reports"
          icon={<Dumbbell className="w-4 h-4 text-primary" />}
          empty="No session reports yet. Log a workout via the AI chat to generate one."
          items={(gymReports ?? []).map((r) => {
            const split = PPL_SPLITS[r.split as SplitDay]
            return {
              id: r.id,
              head: <>
                <span className="font-bold" style={{ color: split?.color }}>{split?.label ?? r.split}</span>
                <span className="text-muted-vital ml-2">{new Date(r.date + 'T00:00:00').toLocaleDateString('en-IL', { month: 'short', day: 'numeric' })}</span>
              </>,
              body: r.reportMd,
            }
          })}
        />
      </div>
    </div>
  )
}

function Folder({ title, icon, items, empty }: {
  title: string; icon: React.ReactNode
  items: Array<{ id: string; head: React.ReactNode; body: string }>; empty: string
}) {
  return (
    <section className="vital-card space-y-3">
      <h2 className="font-heading font-semibold text-text flex items-center gap-2">{icon}{title}
        <span className="ml-auto text-xs text-muted-vital">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-vital py-4 text-center">{empty}</p>
      ) : (
        <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
          {items.map((it) => (
            <details key={it.id} className="rounded-xl px-3 py-2 bg-white/[0.02] border border-white/[0.06]">
              <summary className="cursor-pointer text-sm font-medium text-text">{it.head}</summary>
              <div className="mt-2 text-xs whitespace-pre-wrap text-muted-vital leading-relaxed" dir="auto">{it.body}</div>
            </details>
          ))}
        </div>
      )}
    </section>
  )
}
