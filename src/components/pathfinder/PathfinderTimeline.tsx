'use client'

import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { m, AnimatePresence } from 'framer-motion'
import {
  Dumbbell, Trophy, Sparkles, Loader2, ChevronRight, BatteryMedium, Moon,
  ClipboardCopy, Check, BookOpen,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTimelineWeeks, type TimelineWeekNode } from '@/lib/hooks/useTimelineWeeks'
import { useContinuum, type ContinuumDay } from '@/lib/hooks/useContinuum'
import { useWeeklyExport, useWeeklyAiSummaries } from '@/lib/hooks/useWeeklyLoop'
import { useSentinelReports, useSaveSentinelReport } from '@/lib/hooks/useSentinelExport'
import { weekStartOf, isoAddDays, isWeekComplete } from '@/lib/utils/week'
import { splitColor } from '@/lib/types/workout'
import { logicalTodayISO } from '@/lib/utils/day'
import { displayWeight, weightUnit, useUnitSystem } from '@/lib/utils/units'
import { eraForDate, isTrainingDay, activePhase } from '@/lib/programs'
import { deltaColor } from '@/lib/body/deltaVerdict'
import type { ProgramPhase } from '@/lib/training/landmarks'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { WeekChipLabel } from '@/components/timeline/WeekChip'
import { blurOnTap } from '@/lib/utils/blurOnTap'
import { useEraFilter } from '@/lib/era/eraFilter'
// react-markdown + remark-gfm is a full parser. It was static here, so every
// Momentum visit downloaded it to render report bodies that are usually absent.
const MarkdownView = dynamic(() => import('@/components/reports/MarkdownView').then((m2) => m2.MarkdownView), { ssr: false })
import { Sheet } from '@/components/ui/Sheet'
import { DayCard } from '@/components/timeline/ContinuumTimeline'
import { SwapDayControl, RestTodayButton } from '@/components/day/SwapDayControl'
import { EMERALD, SAPPHIRE, WEEK_STATE } from '@/lib/theme/palette'

const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function dominantSplit(days: TimelineWeekNode['days']): string | undefined {
  const counts = new Map<string, number>()
  for (const d of days) if (d.split) counts.set(d.split, (counts.get(d.split) ?? 0) + 1)
  let best: string | undefined, max = 0
  for (const [k, v] of counts) if (v > max) { max = v; best = k }
  return best
}

/**
 * A week is READY when every scheduled training day in it that has already
 * passed carries a logged session — i.e. you did the work the program asked for.
 * Ready weeks get the gold aura: the visual reward for a complete week, and the
 * cue that it's worth exporting for review.
 *
 * `today` bounds it so the live week can be ready on its last training day
 * rather than only after Saturday midnight.
 */
export function isWeekReady(weekStart: string, loggedDates: Set<string>, today: string): boolean {
  const due = Array.from({ length: 7 }, (_, i) => isoAddDays(weekStart, i))
    .filter((d) => d <= today && isTrainingDay(d))
  if (!due.length) return false
  return due.every((d) => loggedDates.has(d))
}

// `isWeekComplete` moved to lib/utils/week.ts. It lived here, where the
// dashboard could not reach it, and the dashboard duly grew a second and looser
// rule of its own that fired a day early. Re-exported so this file's importers
// are unaffected.
export { isWeekComplete }

/** Stable empty ref — a fresh `[]` per render defeats the capsule's memo. */
const NO_DAYS: ContinuumDay[] = []

/**
 * Pathfinder timeline — the unified life-over-time spine merging the old Journey
 * (daily) and Progress (weekly) tabs. Every program week is a rich capsule
 * (sessions · volume · PRs · weight Δ, plus Snapshot / AI-report actions);
 * expanding it reveals that week's individual day rows (score · macros ·
 * session/rest · kcal), each tapping into its Daily Nexus. The current and prior
 * week open by default; older weeks collapse to just the capsule.
 */
export function PathfinderTimeline() {
  const { era } = useEraFilter()
  const router = useRouter()
  const unit = useUnitSystem()
  const { nodes, isPending } = useTimelineWeeks(era)
  const { data: continuumDays } = useContinuum(true)
  const liveWeekStart = weekStartOf(logicalTodayISO())
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  // Rescheduling from the timeline: hold a day row (or tap its ⇄) to move it.
  const [swapDate, setSwapDate] = useState<string | null>(null)
  const openSwap = useCallback((date: string) => setSwapDate(date), [])

  // Group every logged/tracked day under its Sunday week, filtered at the day
  // level by the training-era boundary (so the boundary week doesn't leak PPL
  // days into the Helix view).
  const daysByWeek = useMemo(() => {
    const map = new Map<string, ContinuumDay[]>()
    for (const d of continuumDays ?? []) {
      if (era !== 'all' && eraForDate(d.date) !== era) continue
      const ws = weekStartOf(d.date)
      const arr = map.get(ws) ?? []
      arr.push(d)
      map.set(ws, arr)
    }
    return map
  }, [continuumDays, era])

  // Only the current week is expanded by default; every past week auto-collapses.
  const isOpen = (ws: string) => overrides[ws] ?? (ws === liveWeekStart)
  // Stable identity so a memoized capsule isn't invalidated by its own handlers.
  // The default has to be recomputed inside the updater rather than captured,
  // because `isOpen` closes over the pre-update `overrides`.
  const toggle = useCallback((ws: string) => {
    setOverrides((o) => ({ ...o, [ws]: !(o[ws] ?? (ws === liveWeekStart)) }))
  }, [liveWeekStart])
  const openDay = useCallback((date: string) => router.push(`/day/${date}`), [router])

  // Every date with a logged session — drives the ready-week aura.
  const loggedDates = useMemo(
    () => new Set((continuumDays ?? []).filter((d) => d.session).map((d) => d.date)),
    [continuumDays],
  )

  // Readiness ran per capsule, per render — each call built a 7-element array
  // and filtered it. Computed once per data change instead.
  const today = logicalTodayISO()
  // isWeekReady asks isTrainingDay which day was DUE, so a swap changes the
  // answer — and a swap can arrive from another device at any moment.
  const scheduleVersion = useScheduleVersion()
  const readyWeeks = useMemo(() => {
    void scheduleVersion   // isTrainingDay reads the store; this is the read
    return new Set(nodes.filter((n) => isWeekReady(n.weekStart, loggedDates, today)).map((n) => n.weekStart))
  }, [nodes, loggedDates, today, scheduleVersion])
  const completeWeeks = useMemo(
    () => new Set(nodes.filter((n) => isWeekComplete(n.weekStart, today)).map((n) => n.weekStart)),
    [nodes, today],
  )

  // Land on the CURRENT week. It's expanded by default but sat below whatever
  // was above it, so opening the tab showed the top of the list rather than
  // where you actually are.
  const liveRef = useRef<HTMLDivElement | null>(null)
  const scrolled = useRef(false)
  useEffect(() => {
    if (scrolled.current || isPending || !liveRef.current) return
    scrolled.current = true
    liveRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [isPending, nodes.length])

  return (
    <div className="space-y-4">
      {isPending ? (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-40 animate-pulse" aria-hidden="true" />
      ) : nodes.length === 0 ? (
        <p className="text-fluid-sm text-muted py-8 text-center">No weeks in this era yet — log a session to start the timeline.</p>
      ) : (
        <div className="relative pl-9">
          <span aria-hidden="true" className="absolute left-[14px] top-1 bottom-1 w-px"
            style={{ background: `linear-gradient(to bottom, ${SAPPHIRE}8c, rgba(255,255,255,0.10) 60%, transparent)` }} />
          <div className="space-y-3">
            {nodes.map((n) => (
              <WeekCapsule
                key={n.weekStart}
                ref={n.weekStart === liveWeekStart ? liveRef : undefined}
                node={n}
                days={daysByWeek.get(n.weekStart) ?? NO_DAYS}
                unit={unit}
                ready={readyWeeks.has(n.weekStart)}
                complete={completeWeeks.has(n.weekStart)}
                open={isOpen(n.weekStart)}
                onToggle={toggle}
                onOpenDay={openDay}
                onSwapDay={openSwap}
              />
            ))}
          </div>
        </div>
      )}

      {/* Reschedule sheet — reached by holding a day row or tapping its ⇄.
          Retroactive as well as forward: the timeline is where you notice that
          a week went sideways, so it is where fixing it belongs. */}
      <Sheet open={swapDate != null} onClose={() => setSwapDate(null)} title={swapDate ? `Reschedule ${swapDate}` : ''}>
        {swapDate && (
          <div className="space-y-3">
            <RestTodayButton date={swapDate} label="Make it a rest day" />
            <SwapDayControl date={swapDate} bare />
          </div>
        )}
      </Sheet>
    </div>
  )
}

/**
 * One week. `memo`'d because the timeline renders every week you have ever
 * trained: without it, expanding a single capsule re-rendered all of them, each
 * one recomputing its dominant split and its readiness. Handlers take the week
 * start rather than closing over it so the parent can hand down ONE stable
 * function instead of a fresh arrow per node.
 */
const WeekCapsule = memo(forwardRef<HTMLDivElement, {
  node: TimelineWeekNode
  days: ContinuumDay[]
  unit: string
  ready: boolean
  complete: boolean
  open: boolean
  onToggle: (weekStart: string) => void
  onOpenDay: (date: string) => void
  onSwapDay: (date: string) => void
}>(function WeekCapsule({ node, days, unit, ready, complete, open, onToggle, onOpenDay, onSwapDay }, ref) {
  const color = useMemo(() => splitColor(dominantSplit(node.days)), [node.days])
  const hasPRs = node.prs > 0
  const handleToggle = useCallback(() => onToggle(node.weekStart), [onToggle, node.weekStart])
  // A week that HAS a report gets a direct link on the capsule itself. It used
  // to live inside WeekActions, below the day rows, the recovery strip and the
  // inline body — three scrolls and an expand away from a thing you return to.
  const reportHref = node.reportId && node.contentMd ? `/report/${node.reportId}` : null

  return (
    <m.div ref={ref} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="relative scroll-mt-24">
      {/* The spine dot carries the week's own split colour, always. It used to
          go gold for `hasPRs || ready` — two different meanings collapsed into
          one boolean and one colour, on the one mark whose job is to say WHICH
          week this is. Status lives in the aura and the chips now. */}
      <span aria-hidden="true" className="absolute -left-[30px] top-4 h-3.5 w-3.5 rounded-full border-2"
        style={{ borderColor: color, background: `${color}40`, boxShadow: `0 0 14px ${color}88` }} />

      {/* READY WEEK: every scheduled training day done. An EMERALD halo and a
          slow breathe — opacity-only, so it costs one compositor layer and
          respects reduced motion via the global .aura-breathe guard.
          Emerald, not gold: doing the work you planned is not the same
          achievement as setting a record, and they used to look identical.
          `--aura` feeds the keyframe, so the glow's colour says what it means.
          The card is a ROW, not a button: the report link has to be a sibling of
          the toggle, since a link inside a button is neither valid nor tappable. */}
      <div className={`rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 w-full !px-0 !py-0 flex items-stretch relative overflow-hidden ${ready ? 'aura-breathe' : ''}`}
        style={ready
          ? {
              borderColor: `${WEEK_STATE.ready}66`,
              boxShadow: `0 0 28px ${WEEK_STATE.ready}33, inset 0 1px 0 ${WEEK_STATE.ready}2e`,
              ['--aura' as string]: '62,158,122',
            }
          : { borderColor: `${color}33` }}>
        <button onClick={handleToggle} onPointerUp={blurOnTap}
          className="flex-1 min-w-0 text-left px-4 py-3.5 active:opacity-90">
          <div className="flex items-center justify-between gap-2">
            {/* Was `{node.weekLabel} · 19 Jul–25 Jul` — one grey run-on string.
                The date range is the stable part and stays as the heading; the
                plan/phase/week identity sits above it as a coloured chip. */}
            <span className="min-w-0 flex flex-col gap-0.5">
              <WeekChipLabel weekStart={node.weekStart} />
              <span className="font-heading font-semibold text-fluid-sm text-text truncate">
                {label(node.weekStart)}–{label(isoAddDays(node.weekStart, 6))}
              </span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {/* COMPLETE means the week is OVER, not that you finished its work
                  early — this was gated on `ready` and so appeared mid-week. */}
              {complete && (
                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                  style={{ color: WEEK_STATE.complete, background: `${WEEK_STATE.complete}1a`, border: `1px solid ${WEEK_STATE.complete}44` }}>Complete</span>
              )}
              {node.isLive && <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ color, background: `${color}1a`, border: `1px solid ${color}44` }}>Live</span>}
              <ChevronRight className={`w-4 h-4 text-muted transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-fluid-xs text-muted">
            <span className="flex items-center gap-1"><Dumbbell className="w-3 h-3" />{node.sessions}</span>
            {node.volumeKg > 0 && <span className="helix-num">{((displayWeight(node.volumeKg) ?? 0) / 1000).toFixed(1)}t</span>}
            {/* The only gold left on this capsule, which is the point. */}
            {hasPRs && <span className="flex items-center gap-1" style={{ color: WEEK_STATE.pr }}><Trophy className="w-3 h-3" />{node.prs}</span>}
            {node.weightDelta != null && (
              <span className="helix-num" style={{ color: deltaColor('weight', node.weightDelta, activePhase() as ProgramPhase) }}>
                {node.weightDelta > 0 ? '+' : ''}{node.weightDelta}{weightUnit()}
              </span>
            )}
          </div>
        </button>

        {reportHref && (
          <Link href={reportHref} onPointerUp={blurOnTap} aria-label={`Open the ${node.weekLabel} report`}
            className="shrink-0 self-stretch w-14 flex flex-col items-center justify-center gap-0.5 border-l active:opacity-80 transition-colors"
            style={{ borderColor: `${WEEK_STATE.report}2e`, background: `${WEEK_STATE.report}12`, color: WEEK_STATE.report }}>
            <BookOpen className="w-4 h-4" aria-hidden="true" />
            <span className="text-[8px] font-bold uppercase tracking-wide">Report</span>
          </Link>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="mt-2 ml-1 space-y-3 pb-1">
              {/* Individual day rows (the merged-in Journey continuum) */}
              {days.length > 0 && (
                <div className="space-y-1.5">
                  {days.map((d) => (
                    <DayCard key={d.date} d={d} unit={unit} active={false} onOpen={onOpenDay} onSwap={onSwapDay} />
                  ))}
                </div>
              )}

              {/* ── ONE VITALS ROW ──
                  Weight Δ and body-fat Δ used to float as loose text above two
                  free-standing recovery chips: four readings, three visual
                  treatments, no alignment between them. They are all the same
                  KIND of fact — how the week left your body — so they are one
                  row of four cells now. */}
              <WeekVitalsRow node={node} />

              {/* A legacy generated report (pre-paste-loop) still renders inline.
                  The actions ALWAYS render now — WeekActions is the report
                  surface, so hiding it behind contentMd made a week with an old
                  report un-exportable. */}
              {node.contentMd && (
                <div className="rounded-xl bg-black/20 border border-white/[0.06] p-4 max-h-[50vh] overflow-y-auto no-scrollbar">
                  <MarkdownView md={node.contentMd} />
                </div>
              )}
              <WeekActions node={node} />
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  )
}))

/**
 * The week's vitals: weight, body fat, battery, sleep — one row, four cells.
 *
 * ── WHY THE COLOURS MOVED ────────────────────────────────────────────────────
 * Both deltas were painted `delta <= 0 ? green : red` inline. That is the CUT
 * rule, hardcoded, and it was wrong on a bulk in the least visible way possible:
 * a bulk gaining 0.4 kg is doing exactly what it was asked to, and the app drew
 * it in the same red it uses for a failure. `deltaVerdict` has encoded the
 * phase-aware rule (including "fat gain in a bulk is NEUTRAL, not green") since
 * it was written, and nine surfaces were quietly not using it.
 */
function WeekVitalsRow({ node }: { node: TimelineWeekNode }) {
  const end = isoAddDays(node.weekStart, 6)
  const phase = activePhase() as ProgramPhase
  const { data } = useQuery({
    queryKey: ['week_recovery', node.weekStart],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('daily_scores')
        .select('battery_pct, sleep_score').gte('date', node.weekStart).lte('date', end)
      const rows = (data ?? []) as Array<{ battery_pct: number | null; sleep_score: number | null }>
      const avg = (xs: (number | null)[]) => {
        const n = xs.filter((v): v is number => v != null)
        return n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length) : null
      }
      return { battery: avg(rows.map((r) => r.battery_pct)), sleep: avg(rows.map((r) => r.sleep_score)) }
    },
  })

  const cells: Array<{ key: string; label: string; value: string; color?: string; icon?: typeof Moon }> = []
  if (node.weightDelta != null) {
    cells.push({
      key: 'weight', label: 'Weight Δ',
      value: `${node.weightDelta > 0 ? '+' : ''}${node.weightDelta} ${weightUnit()}`,
      color: deltaColor('weight', node.weightDelta, phase),
    })
  }
  if (node.fatDelta != null) {
    cells.push({
      key: 'fat', label: 'Fat Δ',
      value: `${node.fatDelta > 0 ? '+' : ''}${node.fatDelta}%`,
      color: deltaColor('fat', node.fatDelta, phase),
    })
  }
  if (data?.battery != null) {
    cells.push({ key: 'battery', label: 'Battery', value: `${data.battery}%`, icon: BatteryMedium })
  }
  if (data?.sleep != null) {
    cells.push({ key: 'sleep', label: 'Sleep', value: `${data.sleep}`, icon: Moon })
  }
  if (!cells.length) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.06)' }}>
      {cells.map((c) => (
        <div key={c.key} className="px-2.5 py-1.5" style={{ background: 'rgb(12,13,16)' }}>
          <div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.08em] text-muted">
            {c.icon && <c.icon className="w-2.5 h-2.5" aria-hidden="true" />}
            {c.label}
          </div>
          <div className="helix-num text-fluid-xs font-bold tabular-nums" style={{ color: c.color ?? undefined }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The week's report loop — copy the raw data out, paste the finished report back.
 *
 * There is exactly ONE payload and it is the week's MEASUREMENTS. The second
 * button used to copy a "SENTINEL-7 audit brief": the same data plus every
 * derived figure pre-computed, wrapped in a hardcoded §0–§7 report contract. A
 * report format compiled into the app is a format that needs a release to
 * change, which defeats the point of the paste loop — so the template and its
 * five supporting modules were deleted. Whatever structure you want, you ask
 * for outside the app.
 *
 * The button only COPIES. This app has no model integration of any kind — no
 * API route, no SDK, no key. The verb is deliberately "Copy" so nothing here
 * ever reads as generation.
 */
function WeekActions({ node }: { node: TimelineWeekNode }) {
  // DISABLED, driven by an explicit refetch on click. Expanding a week capsule
  // used to fire ~21 Supabase round-trips building export strings nobody had
  // asked for; on Momentum, with the live week open by default, that was most
  // of the page's cold-start cost.
  const raw = useWeeklyExport(node.weekStart, false)
  const { data: summaries } = useWeeklyAiSummaries()
  const { data: sentinelReports } = useSentinelReports()
  const saveSentinel = useSaveSentinelReport()
  const [copied, setCopied] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const stored = summaries?.find((s) => s.weekStart === node.weekStart)
  const storedSentinel = sentinelReports?.find((s) => s.weekStart === node.weekStart)

  const copy = async () => {
    // Cached from a previous click → the write stays inside the user gesture.
    // First click has to build the payload first, which on Safari can cost the
    // gesture; the catch below is what makes that survivable.
    let text = raw.data
    if (!text) text = (await raw.refetch()).data
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      // Clipboard blocked (insecure context / permissions / lost gesture) —
      // drop the payload into the textarea so it's never unreachable.
      setDraft(text)
      setPasteOpen(true)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button onClick={copy} disabled={raw.isFetching}
          className="btn-primary min-h-[40px] text-fluid-xs disabled:opacity-50"
          style={copied ? { background: EMERALD } : undefined}>
          {raw.isFetching ? <><Loader2 className="w-4 h-4 animate-spin" /> Building…</>
            : copied ? <><Check className="w-4 h-4" /> Copied</>
            : <><ClipboardCopy className="w-4 h-4" /> Copy raw data</>}
        </button>

        {/* No "Open report" button here any more — the capsule header carries a
            direct link to /report/[id], which is the full document surface
            (charts, print, a URL you can keep). Two ways in, one of them worse,
            was the "digging through menus" this replaced. */}
        <button onClick={() => { setDraft(storedSentinel?.content ?? stored?.content ?? ''); setPasteOpen(true) }}
          className="btn-glass min-h-[40px] text-fluid-xs">
          <Sparkles className="w-4 h-4" /> {storedSentinel || stored ? 'Replace report' : 'Paste report'}
        </button>
      </div>

      {pasteOpen && (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            placeholder="Paste the finished report here…"
            className="w-full rounded-xl border px-3 py-2.5 field-compact text-text bg-surface-2 outline-none focus:ring-2 focus:ring-primary/60"
            style={{ borderColor: 'rgba(255,255,255,0.10)' }}
          />
          <p className="text-[11px] text-muted leading-snug">
            Offline by design — Helix never calls a model, and defines no report format. Copy the raw data, analyse it wherever you like, paste the result back in any shape you want.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPasteOpen(false)} className="btn-glass flex-1 justify-center min-h-[40px] text-fluid-xs">Cancel</button>
            <button
              onClick={() => {
                // Every pasted report saves under the same type, which gets it
                // a real page at /report/[id]. The old sniff routed §-numbered
                // text one way and prose another — a classifier for a format
                // the app no longer defines, so it could only ever be wrong.
                saveSentinel.mutate({ weekStart: node.weekStart, contentMd: draft }, {
                  onSuccess: () => setPasteOpen(false),
                })
              }}
              disabled={!draft.trim() || saveSentinel.isPending}
              className="btn-primary flex-1 justify-center min-h-[40px] text-fluid-xs disabled:opacity-50"
            >
              {saveSentinel.isPending ? 'Saving…' : 'Save report'}
            </button>
          </div>
          {saveSentinel.isError && (
            <p className="text-fluid-xs text-danger">
              {saveSentinel.error instanceof Error ? saveSentinel.error.message : 'Save failed'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
