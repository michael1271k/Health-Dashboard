'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useReports, useMonthActivity } from '@/lib/hooks/useWeekly'
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function iso(d: Date) { return d.toISOString().slice(0, 10) }
function addDays(d: Date, n: number) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x }

export default function WeeklyPage() {
  const qc = useQueryClient()
  const today = new Date()
  const [month, setMonth] = useState({ y: today.getUTCFullYear(), m: today.getUTCMonth() })
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Build a 6×7 grid of weeks starting on the Sunday on/before the 1st
  const weeks = useMemo(() => {
    const first = new Date(Date.UTC(month.y, month.m, 1))
    const gridStart = addDays(first, -first.getUTCDay()) // back to Sunday
    const rows: Date[][] = []
    for (let w = 0; w < 6; w++) {
      const row: Date[] = []
      for (let d = 0; d < 7; d++) row.push(addDays(gridStart, w * 7 + d))
      rows.push(row)
    }
    return rows
  }, [month])

  const gridFrom = iso(weeks[0][0])
  const gridTo = iso(weeks[5][6])
  const { data: activity } = useMonthActivity(gridFrom, gridTo)
  const { data: reports } = useReports()

  async function generate(weekStart: string) {
    setSelectedWeekStart(weekStart)
    setGenerating(true); setError(null); setReport(null)
    try {
      const res = await fetch('/api/ai/weekly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      setReport(data.contentMd ?? null)
      qc.invalidateQueries({ queryKey: ['reports'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  const monthLabel = new Date(Date.UTC(month.y, month.m, 1)).toLocaleDateString('en-IL', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-text">Weekly Summaries</h1>
        <p className="text-muted-vital text-sm mt-0.5">Pick a week → unified weight + gym report</p>
      </div>

      {/* Calendar */}
      <section className="vital-card space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setMonth((p) => ({ y: p.m === 0 ? p.y - 1 : p.y, m: p.m === 0 ? 11 : p.m - 1 }))}
            className="p-1.5 rounded-lg hover:bg-white/[0.05] text-muted-vital" aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="font-heading font-semibold text-text">{monthLabel}</h2>
          <button onClick={() => setMonth((p) => ({ y: p.m === 11 ? p.y + 1 : p.y, m: p.m === 11 ? 0 : p.m + 1 }))}
            className="p-1.5 rounded-lg hover:bg-white/[0.05] text-muted-vital" aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-1 text-center">
          <div />
          {WEEKDAYS.map((d, i) => <div key={i} className="text-[10px] text-muted-vital font-medium pb-1">{d}</div>)}

          {weeks.map((row) => {
            const weekStart = iso(row[0])
            const selected = selectedWeekStart === weekStart
            return (
              <FragmentRow key={weekStart}>
                <button
                  onClick={() => generate(weekStart)}
                  disabled={generating}
                  className={`text-[10px] px-1.5 rounded-md transition-colors my-0.5
                    ${selected ? 'bg-primary/20 text-primary' : 'text-muted-vital hover:bg-white/[0.05]'}`}
                  aria-label={`Generate report for week of ${weekStart}`}
                >
                  {generating && selected ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'Go'}
                </button>
                {row.map((day) => {
                  const ds = iso(day)
                  const inMonth = day.getUTCMonth() === month.m
                  const hasWorkout = activity?.workoutDates.has(ds)
                  const hasData = activity?.dataDates.has(ds)
                  return (
                    <div
                      key={ds}
                      className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs
                        ${inMonth ? 'text-text' : 'text-muted-vital/40'}
                        ${selected ? 'bg-primary/5' : ''}`}
                    >
                      <span>{day.getUTCDate()}</span>
                      <span className="flex gap-0.5 mt-0.5 h-1">
                        {hasWorkout && <span className="w-1 h-1 rounded-full bg-primary" />}
                        {hasData && !hasWorkout && <span className="w-1 h-1 rounded-full bg-muted-vital" />}
                      </span>
                    </div>
                  )
                })}
              </FragmentRow>
            )
          })}
        </div>
        <p className="text-[11px] text-muted-vital flex gap-3">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" /> workout</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-muted-vital inline-block" /> logged</span>
        </p>
      </section>

      {error && <div className="vital-card border-danger/40"><p className="text-danger text-sm">{error}</p></div>}

      {generating && (
        <div className="vital-card flex items-center gap-3 text-muted-vital text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-primary" /> Generating unified report…
        </div>
      )}

      {report && (
        <article className="vital-card prose prose-invert prose-sm max-w-none whitespace-pre-wrap text-text leading-relaxed">
          {report}
        </article>
      )}

      {/* Past reports */}
      {reports && reports.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-heading font-semibold text-lg text-text flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Past Reports
          </h2>
          {reports.map((r) => (
            <details key={r.id} className="vital-card">
              <summary className="cursor-pointer text-sm font-medium text-text">
                {r.period_start} → {r.period_end}
                {r.notion_page_id && <span className="text-xs text-primary ml-2">· Notion ✓</span>}
              </summary>
              <div className="mt-3 text-sm whitespace-pre-wrap text-muted-vital leading-relaxed" dir="auto">
                {r.content_md}
              </div>
            </details>
          ))}
        </section>
      )}
    </div>
  )
}

// Helper to render a row's cells as direct grid children (no wrapper div)
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
