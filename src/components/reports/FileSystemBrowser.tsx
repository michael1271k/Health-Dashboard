'use client'

import { useEffect, useState } from 'react'
import { FileText, Dumbbell, ChevronRight, Home, ArrowLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { GymReportRow } from '@/lib/hooks/useWeekly'
import type { ReportRow } from '@/lib/hooks/useReports'
import { enumerateWeeks, type ProgramWeek } from '@/lib/phases'
import { weekLabelOf } from '@/lib/reports/weekNumber'
import { splitColor } from '@/lib/types/workout'
import { blurOnTap } from '@/lib/utils/blurOnTap'
import { MarkdownView } from './MarkdownView'
import { SessionIntelCard } from './SessionIntelCard'
import { JourneyTimeline } from './JourneyTimeline'

interface FileItem { key: string; name: string; sub?: string; icon: LucideIcon; accent: string; body: string; meta?: GymReportRow }

const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IL', { month: 'short', day: 'numeric' })
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : 'Session')

/**
 * Journey browser: the Helix Timeline Spine indexes every program week; opening
 * a node drills into that week's files (Gym Session Summary, Weight Report,
 * per-day sessions) — gym sessions render as data-first Intel Cards, prose
 * reports keep the MarkdownView.
 */
export function FileSystemBrowser({ reports, gymReports, focusWeek, era = 'all' }: {
  reports: ReportRow[]
  gymReports: GymReportRow[]
  focusWeek?: string | null
  era?: 'all' | 'ppl' | 'axis'
}) {
  const [week, setWeek] = useState<ProgramWeek | null>(null)
  const [fileKey, setFileKey] = useState<string | null>(null)

  function filesFor(w: ProgramWeek): FileItem[] {
    const files: FileItem[] = []
    const report = reports.find((r) => r.week_start >= w.weekStart && r.week_start <= w.weekEnd)
    if (report?.content_md) files.push({ key: 'overview', name: `${weekLabelOf(w.weekStart)} Report`, icon: FileText, accent: '#9AA6B8', body: report.content_md })
    for (const g of gymReports.filter((g) => g.date >= w.weekStart && g.date <= w.weekEnd)) {
      files.push({ key: `gym-${g.id}`, name: `${cap(g.split)} session`, sub: fmt(g.date), icon: Dumbbell, accent: splitColor(g.split), body: g.reportMd, meta: g })
    }
    return files
  }

  useEffect(() => {
    if (!focusWeek) return
    const all = [...enumerateWeeks(['cut']), ...enumerateWeeks(['bulk'])]
    const w = all.find((x) => focusWeek >= x.weekStart && focusWeek <= x.weekEnd)
    if (w) { setWeek(w); setFileKey(null) }
  }, [focusWeek])

  const files = week ? filesFor(week) : []
  const file = files.find((f) => f.key === fileKey) ?? null

  return (
    <section className="helix-card space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-fluid-sm flex-wrap" aria-label="Breadcrumb">
        <button onClick={() => { setWeek(null); setFileKey(null) }} className="flex items-center gap-1 text-muted hover:text-primary"><Home className="w-3.5 h-3.5" /> journey</button>
        {week && <>
          <ChevronRight className="w-3.5 h-3.5 text-muted/50" />
          <button onClick={() => setFileKey(null)} className={file ? 'text-muted hover:text-primary' : 'text-text font-medium'}>{cap(week.kind)} · {week.label}</button>
        </>}
        {file && <><ChevronRight className="w-3.5 h-3.5 text-muted/50" /><span className="text-text font-medium truncate">{file.name}</span></>}
      </nav>

      {file ? (
        <div className="space-y-3">
          <button onClick={() => setFileKey(null)} className="btn-glass text-fluid-xs"><ArrowLeft className="w-3.5 h-3.5" /> Back</button>
          {file.meta ? (
            /* Gym sessions render as a data-first Intel Card */
            <SessionIntelCard session={file.meta} />
          ) : (
            /* Weekly prose reports (summary / weight) keep the markdown view */
            <article className="rounded-2xl bg-black/20 border border-white/[0.06] p-4 max-h-[60vh] overflow-y-auto no-scrollbar"><MarkdownView md={file.body} /></article>
          )}
        </div>
      ) : week ? (
        files.length === 0
          ? <p className="text-fluid-sm text-muted py-6 text-center">This week has no reports yet.</p>
          : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {files.map((f) => {
                const Icon = f.icon
                return (
                  <li key={f.key}>
                    <button onClick={() => setFileKey(f.key)} onPointerUp={blurOnTap} className="w-full flex items-center gap-3 rounded-xl px-3 py-3 bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.14] text-left min-h-[52px]">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0" style={{ background: `${f.accent}1f`, color: f.accent }}><Icon className="w-4 h-4" /></span>
                      <span className="min-w-0"><span className="block text-fluid-sm font-medium text-text truncate">{f.name}</span>{f.sub && <span className="block text-fluid-xs text-muted">{f.sub}</span>}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )
      ) : (
        // Root: the Helix Timeline Spine — every week as a node on the strand,
        // HELIX era glowing above the boundary, PPL Legacy muted below.
        <JourneyTimeline
          reports={reports}
          gymReports={gymReports}
          era={era}
          onOpenWeek={(w) => { setWeek(w); setFileKey(null) }}
        />
      )}
    </section>
  )
}

