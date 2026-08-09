'use client'

import Link from 'next/link'
import { FileText, ChevronRight, Radar } from 'lucide-react'
import { useSentinelReports } from '@/lib/hooks/useSentinelExport'
import { useReports } from '@/lib/hooks/useReports'
import { getWeekPhase, phaseBadgeStyle } from '@/lib/phases'
import { weekLabelOf } from '@/lib/reports/weekNumber'

const fmt = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Reports index — every stored weekly audit, newest first.
 *
 * Until now a report could only be reached through a modal nested two levels
 * inside the Momentum timeline, which made it impossible to link to, print, or
 * find again a month later. Reports are documents; they get their own route.
 */
export default function ReportsPage() {
  const { data: sentinel } = useSentinelReports()
  const { data: legacy } = useReports()

  const legacyWithProse = (legacy ?? []).filter((r) => r.content_md)

  return (
    <div data-boxed className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Radar className="w-5 h-5 text-primary" aria-hidden="true" />
          <h1 className="font-heading text-fluid-2xl font-bold text-text">Reports</h1>
        </div>
        <p className="text-muted text-fluid-sm mt-0.5">Weekly telemetry audits · newest first</p>
      </div>

      {!sentinel?.length && !legacyWithProse.length && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 text-center py-8 space-y-1.5">
          <FileText className="w-6 h-6 mx-auto text-muted" aria-hidden="true" />
          <p className="text-fluid-sm text-text">No reports yet.</p>
          <p className="text-fluid-xs text-muted">
            Open a week in Momentum, export the Sentinel-7 payload, then paste the audit back.
          </p>
        </div>
      )}

      {!!sentinel?.length && (
        <section className="space-y-2">
          <h2 className="text-[10px] uppercase tracking-widest text-muted">Sentinel-7</h2>
          {sentinel.map((r) => {
            const phase = getWeekPhase(r.weekStart)
            return (
              <Link key={r.id} href={`/report/${r.id}`}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-5 py-3 flex items-center gap-3 hover:border-primary/30 transition-colors">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(138,111,168,0.12)', color: 'var(--color-primary)' }}>
                  <Radar className="w-4 h-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-heading font-semibold text-fluid-sm text-text">
                      {weekLabelOf(r.weekStart) ?? fmt(r.weekStart)}
                    </span>
                    {phase && (
                      <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded"
                        style={phaseBadgeStyle(phase.kind, true, phase.era)}>
                        {phase.short}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted mt-0.5">Week of {fmt(r.weekStart)}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
              </Link>
            )
          })}
        </section>
      )}

      {!!legacyWithProse.length && (
        <section className="space-y-2">
          <h2 className="text-[10px] uppercase tracking-widest text-muted">Earlier weekly summaries</h2>
          {legacyWithProse.map((r) => (
            <Link key={r.id} href={`/report/${r.id}`}
              className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-5 py-2.5 flex items-center gap-3 hover:border-primary/30 transition-colors">
              <FileText className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <span className="font-heading font-semibold text-fluid-sm text-text">Week {r.week_number}</span>
                <p className="text-[11px] text-muted mt-0.5">{fmt(r.week_start)}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
            </Link>
          ))}
        </section>
      )}
    </div>
  )
}
