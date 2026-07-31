'use client'

import { use } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer, Radar } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { MarkdownView } from '@/components/reports/MarkdownView'
import { WidgetBoundary } from '@/components/fx/WidgetBoundary'
import { getWeekPhase, phaseBadgeStyle } from '@/lib/phases'
import { weekLabelOf } from '@/lib/reports/weekNumber'
import { SENTINEL_TYPE } from '@/lib/reports/sentinel'

interface ReportDoc { id: string; type: string; weekStart: string; content: string }

function useReportDoc(id: string) {
  return useQuery({
    queryKey: ['report', id],
    enabled: !!id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ReportDoc | null> => {
      const { data, error } = await supabase
        .from('reports')
        .select('id, type, period_start, content_md')
        .eq('id', id)
        .maybeSingle()
      if (error || !data) return null
      const r = data as unknown as { id: string; type: string; period_start: string; content_md: string | null }
      return { id: r.id, type: r.type, weekStart: r.period_start, content: r.content_md ?? '' }
    },
  })
}

/**
 * A single report, as a document.
 *
 * Its own route rather than a modal, for three reasons that all come from the
 * same place — a report is a thing you return to: it needs a URL you can keep,
 * a full-width reading measure, and a print surface. "Save as PDF" is the
 * browser's own print pipeline (see the @media print block in globals.css), so
 * the output is real selectable text with its ASCII tables intact, not a
 * screenshot.
 */
export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isPending } = useReportDoc(id)

  const phase = data ? getWeekPhase(data.weekStart) : null
  const isSentinel = data?.type === SENTINEL_TYPE
  const title = data
    ? (weekLabelOf(data.weekStart) ?? new Date(`${data.weekStart}T12:00:00Z`)
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))
    : 'Report'

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 space-y-4 report-print">
      {/* Chrome — hidden when printing (data-print-hide). */}
      <div className="flex items-center gap-2 flex-wrap" data-print-hide>
        <Link href="/reports" className="btn-glass min-h-[40px] text-fluid-xs">
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Reports
        </Link>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!data?.content}
          className="btn-glass min-h-[40px] text-fluid-xs disabled:opacity-50"
        >
          <Printer className="w-3.5 h-3.5" aria-hidden="true" /> Save as PDF
        </button>
      </div>

      <header className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          {isSentinel && <Radar className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />}
          <h1 className="font-heading text-fluid-xl font-bold text-text">
            {isSentinel ? 'Sentinel-7 · ' : ''}{title}
          </h1>
          {phase && (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded"
              style={phaseBadgeStyle(phase.kind, true, phase.era)}>
              {phase.short}
            </span>
          )}
        </div>
        {data && <p className="text-muted text-fluid-xs">Cycle beginning {data.weekStart}</p>}
      </header>

      {isPending && <div className="helix-card h-64 animate-pulse" aria-hidden="true" />}
      {!isPending && !data && (
        <div className="helix-card text-center py-8">
          <p className="text-fluid-sm text-text">That report no longer exists.</p>
          <Link href="/reports" className="text-primary text-fluid-xs underline underline-offset-2">Back to reports</Link>
        </div>
      )}
      {data?.content && (
        // Pasted markdown is arbitrary text from an external model; a malformed
        // table shouldn't take the page down with it.
        <WidgetBoundary label="Report" minHeight={200}>
          <article className="helix-card !p-4 sm:!p-6">
            <MarkdownView md={data.content} />
          </article>
        </WidgetBoundary>
      )}
    </div>
  )
}
