'use client'

import { useEffect, useMemo, useState } from 'react'
import { Folder, FileText, Dumbbell, Scale, ChevronRight, Home, ArrowLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReportRow, GymReportRow } from '@/lib/hooks/useWeekly'
import { getWeekPhase } from '@/lib/phases'

interface FileItem { key: string; name: string; sub?: string; icon: LucideIcon; accent: string; body: string }
interface WeekFolder { id: string; start: string; end: string; label: string; phase?: string; files: FileItem[] }

const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IL', { month: 'short', day: 'numeric' })
const inRange = (d: string, a: string, b: string) => d >= a && d <= b
const SPLIT_COLOR: Record<string, string> = { push: '#38E1FF', pull: '#43F59B', legs: '#4FC3FF', upper: '#19E3B1', lower: '#E8C57A' }

/**
 * macOS/VSCode-style file browser for weekly reports. Folders = weeks; each opens
 * to its two files (Gym Session Summary, Weight Management Report) plus that
 * week's per-day gym session reports. Breadcrumb drill-down, responsive.
 */
export function FileSystemBrowser({ reports, gymReports, focusWeek }: {
  reports: ReportRow[]
  gymReports: GymReportRow[]
  focusWeek?: string | null
}) {
  const folders = useMemo<WeekFolder[]>(() => {
    const list: WeekFolder[] = reports.map((r) => {
      const files: FileItem[] = []
      if (r.session_summary_md) files.push({ key: 'session', name: 'Gym Session Summary', icon: Dumbbell, accent: '#19E3B1', body: r.session_summary_md })
      if (r.weight_report_md) files.push({ key: 'weight', name: 'Weight Management Report', icon: Scale, accent: '#43F59B', body: r.weight_report_md })
      if (!files.length && r.content_md) files.push({ key: 'overview', name: 'Overview', icon: FileText, accent: '#38E1FF', body: r.content_md })
      for (const g of gymReports.filter((g) => inRange(g.date, r.period_start, r.period_end))) {
        files.push({ key: `gym-${g.id}`, name: `${g.split[0].toUpperCase()}${g.split.slice(1)} session`, sub: fmt(g.date), icon: Dumbbell, accent: SPLIT_COLOR[g.split] ?? '#38E1FF', body: g.reportMd })
      }
      const phase = getWeekPhase(r.period_start)
      return { id: r.id, start: r.period_start, end: r.period_end, label: `${fmt(r.period_start)} – ${fmt(r.period_end)}`, phase: phase?.label, files }
    })
    // Gym sessions not covered by any report → an "Unfiled sessions" folder.
    const covered = new Set(list.flatMap((f) => f.files.filter((x) => x.key.startsWith('gym-')).map((x) => x.key)))
    const orphan = gymReports.filter((g) => !covered.has(`gym-${g.id}`))
    if (orphan.length) {
      list.push({
        id: 'unfiled', start: '', end: '', label: 'Unfiled sessions',
        files: orphan.map((g) => ({ key: `gym-${g.id}`, name: `${g.split[0].toUpperCase()}${g.split.slice(1)} session`, sub: fmt(g.date), icon: Dumbbell, accent: SPLIT_COLOR[g.split] ?? '#38E1FF', body: g.reportMd })),
      })
    }
    return list.filter((f) => f.files.length)
  }, [reports, gymReports])

  const [weekId, setWeekId] = useState<string | null>(null)
  const [fileKey, setFileKey] = useState<string | null>(null)

  useEffect(() => {
    if (!focusWeek) return
    const f = folders.find((x) => x.start === focusWeek)
    if (f) { setWeekId(f.id); setFileKey(null) }
  }, [focusWeek, folders])

  const folder = folders.find((f) => f.id === weekId) ?? null
  const file = folder?.files.find((f) => f.key === fileKey) ?? null

  return (
    <section className="vital-card space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-fluid-sm flex-wrap" aria-label="Breadcrumb">
        <button onClick={() => { setWeekId(null); setFileKey(null) }} className="flex items-center gap-1 text-muted-vital hover:text-primary">
          <Home className="w-3.5 h-3.5" /> main
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-muted-vital/50" />
        <button onClick={() => { setFileKey(null); if (!folder) setWeekId(null) }} className={folder ? 'text-muted-vital hover:text-primary' : 'text-text font-medium'}>
          weekly_sessions
        </button>
        {folder && <>
          <ChevronRight className="w-3.5 h-3.5 text-muted-vital/50" />
          <button onClick={() => setFileKey(null)} className={file ? 'text-muted-vital hover:text-primary' : 'text-text font-medium'}>{folder.label}</button>
        </>}
        {file && <>
          <ChevronRight className="w-3.5 h-3.5 text-muted-vital/50" />
          <span className="text-text font-medium truncate">{file.name}</span>
        </>}
      </nav>

      {/* File content */}
      {file ? (
        <div className="space-y-3">
          <button onClick={() => setFileKey(null)} className="btn-glass text-fluid-xs"><ArrowLeft className="w-3.5 h-3.5" /> Back</button>
          <article className="rounded-2xl bg-black/20 border border-white/[0.06] p-4 max-h-[60vh] overflow-y-auto no-scrollbar
                              text-fluid-sm leading-relaxed whitespace-pre-wrap text-text/90" dir="auto">
            {file.body}
          </article>
        </div>
      ) : folder ? (
        // Files in a folder
        <ul className="grid gap-2 sm:grid-cols-2">
          {folder.files.map((f) => {
            const Icon = f.icon
            return (
              <li key={f.key}>
                <button onClick={() => setFileKey(f.key)}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-3 bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.14] text-left min-h-[52px]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0" style={{ background: `${f.accent}1f`, color: f.accent }}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-fluid-sm font-medium text-text truncate">{f.name}</span>
                    {f.sub && <span className="block text-fluid-xs text-muted-vital">{f.sub}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        // Root: week folders
        folders.length === 0 ? (
          <p className="text-fluid-sm text-muted-vital py-6 text-center">No reports yet. Seed from Notion or generate a weekly report.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {folders.map((f) => (
              <li key={f.id}>
                <button onClick={() => setWeekId(f.id)}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-3 bg-white/[0.02] border border-white/[0.06] hover:border-primary/30 text-left min-h-[56px]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0 bg-primary/15 text-primary">
                    <Folder className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-fluid-sm font-medium text-text truncate">{f.label}</span>
                    <span className="block text-fluid-xs text-muted-vital truncate">{f.phase ? `${f.phase} · ` : ''}{f.files.length} file{f.files.length === 1 ? '' : 's'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  )
}
