'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, Copy, Loader2, Printer, Radar } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { MarkdownView } from '@/components/reports/MarkdownView'
import { AppBar } from '@/components/nav/AppBar'
import { FmtV2Report } from '@/components/reports/FmtV2Report'
import { isFmtV2 } from '@/lib/reports/fmtV2'
import { WidgetBoundary } from '@/components/fx/WidgetBoundary'
import { getWeekPhase, phaseBadgeStyle, phaseRgb } from '@/lib/phases'
import { weekLabelOf } from '@/lib/reports/weekNumber'
import { SENTINEL_TYPE } from '@/lib/hooks/useSentinelExport'
import { WeekChipLabel } from '@/components/timeline/WeekChip'

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

type PrintState = 'idle' | 'working' | 'done' | 'unavailable' | 'copied'

/**
 * "Save as PDF" is the browser's own print pipeline (see the @media print block
 * in globals.css) — real selectable text with its tables intact, not a
 * screenshot. Two things were wrong with the old one-line `onClick`:
 *
 * 1. NO FEEDBACK. On desktop the print dialog takes a beat to appear and the
 *    button gave no sign it had been pressed, so it read as dead.
 * 2. IT GENUINELY DOES NOTHING IN A STANDALONE PWA. Installed to the iOS home
 *    screen, `window.print()` returns without opening anything — the most
 *    likely reading of "the button does nothing". There is no way to force it,
 *    so the honest move is to detect the silence and offer the thing that DOES
 *    work: the report's own markdown, on the clipboard.
 *
 * Detection uses `beforeprint`: if the dialog never announced itself, printing
 * isn't available here. Desktop blocks inside print() until the dialog closes,
 * so the timer is only ever read after the fact.
 */
function usePrintToPdf(markdown: string) {
  const [state, setState] = useState<PrintState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const reset = useCallback((ms = 2600) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), ms)
  }, [])

  const copyInstead = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown)
      setState('copied')
    } catch {
      setState('unavailable')
    }
    reset(3200)
  }, [markdown, reset])

  const save = useCallback(() => {
    if (!markdown) return
    if (typeof window.print !== 'function') { setState('unavailable'); reset(4000); return }

    let opened = false
    const onBefore = () => { opened = true }
    const onAfter = () => { setState('done'); reset() }
    window.addEventListener('beforeprint', onBefore, { once: true })
    window.addEventListener('afterprint', onAfter, { once: true })
    setState('working')

    try {
      window.print()
    } catch {
      window.removeEventListener('beforeprint', onBefore)
      window.removeEventListener('afterprint', onAfter)
      setState('unavailable'); reset(4000)
      return
    }

    // A standalone PWA returns from print() having done nothing and never fires
    // either event. Give it a beat, then say so rather than leaving a spinner.
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      window.removeEventListener('beforeprint', onBefore)
      window.removeEventListener('afterprint', onAfter)
      setState((s) => (s === 'working' ? (opened ? 'done' : 'unavailable') : s))
      reset(4000)
    }, 1500)
  }, [markdown, reset])

  return { state, save, copyInstead }
}

/**
 * A single report, as a document.
 *
 * Its own route rather than a modal, for three reasons that all come from the
 * same place — a report is a thing you return to: it needs a URL you can keep,
 * a full reading measure, and a print surface.
 *
 * LAYOUT: full-bleed. This page used to sit inside `max-w-3xl` INSIDE the app
 * shell's `max-w-7xl` INSIDE <main>'s gutters, then inside a `helix-card` with
 * its own padding — four nested boxes, so a 16 kB report read through a slot.
 * `data-fullbleed` hands the route the whole content area (see globals.css) and
 * the reading measure is applied once, here, where it can be tuned: edge-to-edge
 * on a phone, a generous 80ch on a desktop. The card is gone; a document does
 * not need a frame around it.
 */
export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isPending } = useReportDoc(id)
  const { state: printState, save, copyInstead } = usePrintToPdf(data?.content ?? '')

  const phase = data ? getWeekPhase(data.weekStart) : null
  const rgb = phase ? phaseRgb(phase.kind, phase.era) : null
  const isSentinel = data?.type === SENTINEL_TYPE
  const title = data
    ? (weekLabelOf(data.weekStart) ?? new Date(`${data.weekStart}T12:00:00Z`)
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))
    : 'Report'

  return (
    <div data-fullbleed className="report-print min-h-dvh">
      {/* The way out is pinned, always — a long document you have to scroll
          back up to escape is a trap. The phase colour bleeds along the top
          edge, saying which block of training this belongs to. */}
      <AppBar
        accent={rgb ? `rgb(${rgb})` : undefined}
        measure="doc"
        pad="roomy"
        printHidden
        below={printState === 'unavailable' ? (
          /* Said once, plainly, only when it is true. */
          <p className="px-3 sm:px-5 pb-2 text-[11px] text-muted mx-auto w-full max-w-[80ch]">
            Printing isn&rsquo;t available in the installed app. Open this page in Safari or Chrome to save a PDF —
            or tap again to copy the report text.
          </p>
        ) : undefined}
      >
          <Link
            href="/reports"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-2.5 min-h-[40px] text-fluid-xs font-semibold text-text hover:bg-white/[0.06] active:opacity-80 transition-colors"
            aria-label="Back to reports"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span className="hidden min-[380px]:inline">Reports</span>
          </Link>

          <span className="flex-1 min-w-0 flex flex-col leading-tight">
            <span className="flex items-center gap-1.5 min-w-0">
              {isSentinel && <Radar className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />}
              <span className="font-heading text-fluid-sm font-bold text-text truncate">{title}</span>
            </span>
            {data && <WeekChipLabel weekStart={data.weekStart} />}
          </span>

          <button
            type="button"
            onClick={printState === 'unavailable' ? copyInstead : save}
            disabled={!data?.content || printState === 'working'}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 min-h-[40px] text-fluid-xs font-semibold border transition-colors disabled:opacity-45"
            style={{
              color: rgb ? `rgb(${rgb})` : undefined,
              borderColor: rgb ? `rgba(${rgb},0.4)` : 'rgba(255,255,255,0.14)',
              background: rgb ? `rgba(${rgb},0.10)` : 'rgba(255,255,255,0.04)',
            }}
          >
            {printState === 'working' && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            {(printState === 'done' || printState === 'copied') && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
            {printState === 'unavailable' && <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
            {printState === 'idle' && <Printer className="w-3.5 h-3.5" aria-hidden="true" />}
            <span className="hidden sm:inline">
              {printState === 'working' ? 'Preparing…'
                : printState === 'done' ? 'Sent to print'
                : printState === 'copied' ? 'Copied'
                : printState === 'unavailable' ? 'Copy text'
                : 'Save as PDF'}
            </span>
          </button>
      </AppBar>

      {/* One reading measure, applied once. 80ch is wide enough for the FMT v2
          tables and still a comfortable line length for prose. */}
      <div className="mx-auto w-full max-w-[80ch] px-4 sm:px-6 pt-5 pb-10 space-y-5">
        {data && (
          <header className="space-y-1.5">
            <h1 className="font-heading text-fluid-2xl font-bold text-text leading-tight">
              {isSentinel ? 'Sentinel-7 · ' : ''}{title}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              {phase && (
                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded"
                  style={phaseBadgeStyle(phase.kind, true, phase.era)}>
                  {phase.short}
                </span>
              )}
              <p className="text-muted text-fluid-xs">Cycle beginning {data.weekStart}</p>
            </div>
          </header>
        )}

        {isPending && <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-64 animate-pulse" aria-hidden="true" />}
        {!isPending && !data && (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 text-center py-8">
            <p className="text-fluid-sm text-text">That report no longer exists.</p>
            <Link href="/reports" className="text-primary text-fluid-xs underline underline-offset-2">Back to reports</Link>
          </div>
        )}
        {data?.content && (
          // Pasted markdown is arbitrary text from an external model; a malformed
          // table shouldn't take the page down with it.
          <WidgetBoundary label="Report" minHeight={200}>
            {/* No card. The document IS the page — a frame inside a frame inside
                the shell is exactly what made this feel like reading through a
                letterbox. FMT v2 carries a TDEE ladder, a body-comp table and an
                asymmetry block that read badly as monospace on a phone; those
                become charts. Any other paste renders as written. */}
            <article className="report-body">
              {isFmtV2(data.content)
                ? <FmtV2Report md={data.content} />
                : <MarkdownView md={data.content} />}
            </article>
          </WidgetBoundary>
        )}
      </div>
    </div>
  )
}
