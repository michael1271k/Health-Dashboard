'use client'

import { useEffect, useState } from 'react'
import { Folder, FolderOpen, FileText, Dumbbell, Scale, ChevronRight, Home, ArrowLeft, Scissors, Beef } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReportRow, GymReportRow } from '@/lib/hooks/useWeekly'
import { enumerateWeeks, type ProgramWeek } from '@/lib/phases'
import { MarkdownView } from './MarkdownView'

interface FileItem { key: string; name: string; sub?: string; icon: LucideIcon; accent: string; body: string; meta?: GymReportRow }

const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IL', { month: 'short', day: 'numeric' })
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const SPLIT_COLOR: Record<string, string> = { push: '#38E1FF', pull: '#43F59B', legs: '#4FC3FF', upper: '#19E3B1', lower: '#E8C57A' }
const COLUMNS = [
  { kind: 'cut' as const, title: 'Cut', color: '#38E1FF', Icon: Scissors },
  { kind: 'bulk' as const, title: 'Bulk', color: '#43F59B', Icon: Beef },
]

/**
 * macOS/Windows-style file explorer for the training journey. Two columns — Cut
 * and Bulk — list every program week as a "Week N" folder (empty weeks show an
 * empty-folder icon). Open a week → its files (Gym Session Summary, Weight Report,
 * per-day sessions); open a file → a beautiful rendered report (MarkdownView).
 */
export function FileSystemBrowser({ reports, gymReports, focusWeek }: {
  reports: ReportRow[]
  gymReports: GymReportRow[]
  focusWeek?: string | null
}) {
  const [week, setWeek] = useState<ProgramWeek | null>(null)
  const [fileKey, setFileKey] = useState<string | null>(null)

  function filesFor(w: ProgramWeek): FileItem[] {
    const files: FileItem[] = []
    const report = reports.find((r) => r.period_start >= w.weekStart && r.period_start <= w.weekEnd)
    if (report?.session_summary_md) files.push({ key: 'session', name: 'Gym Session Summary', icon: Dumbbell, accent: '#19E3B1', body: report.session_summary_md })
    if (report?.weight_report_md) files.push({ key: 'weight', name: 'Weight Management Report', icon: Scale, accent: '#43F59B', body: report.weight_report_md })
    if (report && !report.session_summary_md && !report.weight_report_md && report.content_md) files.push({ key: 'overview', name: 'Overview', icon: FileText, accent: '#38E1FF', body: report.content_md })
    for (const g of gymReports.filter((g) => g.date >= w.weekStart && g.date <= w.weekEnd)) {
      files.push({ key: `gym-${g.id}`, name: `${cap(g.split)} session`, sub: fmt(g.date), icon: Dumbbell, accent: SPLIT_COLOR[g.split] ?? '#38E1FF', body: g.reportMd, meta: g })
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
    <section className="vital-card space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-fluid-sm flex-wrap" aria-label="Breadcrumb">
        <button onClick={() => { setWeek(null); setFileKey(null) }} className="flex items-center gap-1 text-muted-vital hover:text-primary"><Home className="w-3.5 h-3.5" /> journey</button>
        {week && <>
          <ChevronRight className="w-3.5 h-3.5 text-muted-vital/50" />
          <button onClick={() => setFileKey(null)} className={file ? 'text-muted-vital hover:text-primary' : 'text-text font-medium'}>{cap(week.kind)} · {week.label}</button>
        </>}
        {file && <><ChevronRight className="w-3.5 h-3.5 text-muted-vital/50" /><span className="text-text font-medium truncate">{file.name}</span></>}
      </nav>

      {file ? (
        <div className="space-y-3">
          <button onClick={() => setFileKey(null)} className="btn-glass text-fluid-xs"><ArrowLeft className="w-3.5 h-3.5" /> Back</button>
          {file.meta && (
            <div className="flex flex-wrap gap-2">
              {file.meta.durationMin != null && <Chip label="Duration" value={`${file.meta.durationMin}m`} />}
              {file.meta.avgBpm != null && <Chip label="Avg BPM" value={`${file.meta.avgBpm}`} />}
              {file.meta.volumeKg != null && <Chip label="Volume" value={`${Math.round(file.meta.volumeKg).toLocaleString()} kg`} />}
              {file.meta.setCount != null && <Chip label="Sets" value={`${file.meta.setCount}`} />}
              {(file.meta.prCount ?? 0) > 0 && <Chip label="PRs" value={`${file.meta.prCount}`} accent="#E8C57A" />}
            </div>
          )}
          <article className="rounded-2xl bg-black/20 border border-white/[0.06] p-4 max-h-[60vh] overflow-y-auto no-scrollbar"><MarkdownView md={file.body} /></article>
        </div>
      ) : week ? (
        files.length === 0
          ? <p className="text-fluid-sm text-muted-vital py-6 text-center">This week has no reports yet.</p>
          : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {files.map((f) => {
                const Icon = f.icon
                return (
                  <li key={f.key}>
                    <button onClick={() => setFileKey(f.key)} className="w-full flex items-center gap-3 rounded-xl px-3 py-3 bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.14] text-left min-h-[52px]">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0" style={{ background: `${f.accent}1f`, color: f.accent }}><Icon className="w-4 h-4" /></span>
                      <span className="min-w-0"><span className="block text-fluid-sm font-medium text-text truncate">{f.name}</span>{f.sub && <span className="block text-fluid-xs text-muted-vital">{f.sub}</span>}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )
      ) : (
        // Root: two columns — Cut & Bulk
        <div className="grid sm:grid-cols-2 gap-4">
          {COLUMNS.map((col) => {
            const weeks = enumerateWeeks([col.kind])
            const ColIcon = col.Icon
            return (
              <div key={col.kind} className="space-y-2">
                <div className="flex items-center gap-2 px-1 pb-1 border-b" style={{ borderColor: `${col.color}33` }}>
                  <ColIcon className="w-4 h-4" style={{ color: col.color }} />
                  <h3 className="font-heading font-semibold text-fluid-sm" style={{ color: col.color }}>{col.title}</h3>
                  <span className="ml-auto text-fluid-xs text-muted-vital">{weeks.length} wk</span>
                </div>
                <ul className="space-y-1.5">
                  {weeks.map((w) => {
                    const has = filesFor(w).length > 0
                    return (
                      <li key={w.weekStart}>
                        <button disabled={!has} onClick={() => { setWeek(w); setFileKey(null) }}
                          className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 border text-left min-h-[48px] transition-colors
                            ${has ? 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.18]' : 'border-white/[0.04] opacity-45 cursor-default'}`}>
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0" style={{ background: has ? `${col.color}1f` : 'rgba(255,255,255,0.03)', color: has ? col.color : '#5A6B85' }}>
                            {has ? <Folder className="w-4 h-4" /> : <FolderOpen className="w-4 h-4" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-fluid-sm font-medium text-text truncate">{w.label}</span>
                            <span className="block text-fluid-xs text-muted-vital">{fmt(w.weekStart)}{has ? '' : ' · empty'}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Chip({ label, value, accent = '#19E3B1' }: { label: string; value: string; accent?: string }) {
  return (
    <span className="inline-flex flex-col rounded-xl px-3 py-1.5 border" style={{ borderColor: `${accent}40`, background: `${accent}14` }}>
      <span className="text-[9px] uppercase tracking-wide text-muted-vital leading-none">{label}</span>
      <span className="vital-number text-fluid-sm font-bold leading-tight" style={{ color: accent }}>{value}</span>
    </span>
  )
}
