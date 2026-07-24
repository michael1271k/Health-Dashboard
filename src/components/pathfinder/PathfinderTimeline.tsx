'use client'

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
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
import { useWeeklyExport, useWeeklyAiSummaries, useSaveWeeklyAiSummary } from '@/lib/hooks/useWeeklyLoop'
import { weekStartOf, isoAddDays } from '@/lib/utils/week'
import { splitColor } from '@/lib/types/workout'
import { logicalTodayISO } from '@/lib/utils/day'
import { displayWeight, weightUnit, useUnitSystem } from '@/lib/utils/units'
import { eraForDate, isTrainingDay } from '@/lib/programs'
import { blurOnTap } from '@/lib/utils/blurOnTap'
import { useEraFilter } from '@/lib/era/eraFilter'
import { MarkdownView } from '@/components/reports/MarkdownView'
import { Sheet } from '@/components/ui/Sheet'
import { DayCard } from '@/components/timeline/ContinuumTimeline'
import { GOLD, EMERALD, OXIDE, SAPPHIRE } from '@/lib/theme/palette'

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
  const toggle = (ws: string) => setOverrides((o) => ({ ...o, [ws]: !isOpen(ws) }))

  // Every date with a logged session — drives the ready-week aura.
  const loggedDates = useMemo(
    () => new Set((continuumDays ?? []).filter((d) => d.session).map((d) => d.date)),
    [continuumDays],
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
        <div className="helix-card h-40 animate-pulse" aria-hidden="true" />
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
                days={daysByWeek.get(n.weekStart) ?? []}
                unit={unit}
                ready={isWeekReady(n.weekStart, loggedDates, logicalTodayISO())}
                open={isOpen(n.weekStart)}
                onToggle={() => toggle(n.weekStart)}
                onOpenDay={(date) => router.push(`/day/${date}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const WeekCapsule = forwardRef<HTMLDivElement, {
  node: TimelineWeekNode
  days: ContinuumDay[]
  unit: string
  ready: boolean
  open: boolean
  onToggle: () => void
  onOpenDay: (date: string) => void
}>(function WeekCapsule({ node, days, unit, ready, open, onToggle, onOpenDay }, ref) {
  const color = splitColor(dominantSplit(node.days))
  const hasPRs = node.prs > 0

  return (
    <m.div ref={ref} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="relative scroll-mt-24">
      <span aria-hidden="true" className="absolute -left-[30px] top-4 h-3.5 w-3.5 rounded-full border-2"
        style={{ borderColor: hasPRs || ready ? GOLD : color, background: `${color}40`, boxShadow: `0 0 14px ${(hasPRs || ready ? GOLD : color)}88` }} />

      {/* READY WEEK: every scheduled training day done. A gold halo + a slow
          breathe — opacity-only so it costs one compositor layer and respects
          reduced motion via the global .aura-breathe guard. */}
      <button onClick={onToggle} onPointerUp={blurOnTap}
        className={`helix-card w-full text-left px-4 py-3.5 active:opacity-90 relative ${ready ? 'aura-breathe' : ''}`}
        style={ready
          ? { borderColor: `${GOLD}66`, boxShadow: `0 0 28px ${GOLD}33, inset 0 1px 0 ${GOLD}2e` }
          : { borderColor: `${color}33` }}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-heading font-semibold text-fluid-sm text-text truncate">
            {node.weekLabel} · {label(node.weekStart)}–{label(isoAddDays(node.weekStart, 6))}
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {ready && (
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{ color: GOLD, background: `${GOLD}1a`, border: `1px solid ${GOLD}55` }}>Complete</span>
            )}
            {node.isLive && <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ color, background: `${color}1a`, border: `1px solid ${color}44` }}>Live</span>}
            <ChevronRight className={`w-4 h-4 text-muted transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-fluid-xs text-muted">
          <span className="flex items-center gap-1"><Dumbbell className="w-3 h-3" />{node.sessions}</span>
          {node.volumeKg > 0 && <span className="helix-num">{((displayWeight(node.volumeKg) ?? 0) / 1000).toFixed(1)}t</span>}
          {hasPRs && <span className="flex items-center gap-1" style={{ color: GOLD }}><Trophy className="w-3 h-3" />{node.prs}</span>}
          {node.weightDelta != null && (
            <span className="helix-num" style={{ color: node.weightDelta <= 0 ? EMERALD : OXIDE }}>
              {node.weightDelta > 0 ? '+' : ''}{node.weightDelta}{weightUnit()}
            </span>
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="mt-2 ml-1 space-y-3 pb-1">
              {/* Individual day rows (the merged-in Journey continuum) */}
              {days.length > 0 && (
                <div className="space-y-1.5">
                  {days.map((d) => <DayCard key={d.date} d={d} unit={unit} active={false} onOpen={onOpenDay} />)}
                </div>
              )}

              {/* Body deltas */}
              {(node.weightDelta != null || node.fatDelta != null) && (
                <div className="flex gap-5 text-fluid-xs">
                  {node.weightDelta != null && (
                    <span className="text-muted">Weight Δ <span className="helix-num font-bold" style={{ color: node.weightDelta <= 0 ? EMERALD : OXIDE }}>{node.weightDelta > 0 ? '+' : ''}{node.weightDelta} {weightUnit()}</span></span>
                  )}
                  {node.fatDelta != null && (
                    <span className="text-muted">Body-fat Δ <span className="helix-num font-bold" style={{ color: node.fatDelta <= 0 ? EMERALD : OXIDE }}>{node.fatDelta > 0 ? '+' : ''}{node.fatDelta}%</span></span>
                  )}
                </div>
              )}

              <WeekRecoveryStrip weekStart={node.weekStart} />

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
})

/** Compact weekly recovery: avg battery & sleep score across the week. */
function WeekRecoveryStrip({ weekStart }: { weekStart: string }) {
  const end = isoAddDays(weekStart, 6)
  const { data } = useQuery({
    queryKey: ['week_recovery', weekStart],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('daily_scores')
        .select('battery_pct, sleep_score').gte('date', weekStart).lte('date', end)
      const rows = (data ?? []) as Array<{ battery_pct: number | null; sleep_score: number | null }>
      const avg = (xs: (number | null)[]) => {
        const n = xs.filter((v): v is number => v != null)
        return n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length) : null
      }
      return { battery: avg(rows.map((r) => r.battery_pct)), sleep: avg(rows.map((r) => r.sleep_score)) }
    },
  })
  if (!data || (data.battery == null && data.sleep == null)) return null
  return (
    <div className="flex gap-3">
      {data.battery != null && (
        <span className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-fluid-xs">
          <BatteryMedium className="w-3.5 h-3.5 text-primary" /> <span className="text-muted">Battery</span> <span className="helix-num font-bold text-text">{data.battery}%</span>
        </span>
      )}
      {data.sleep != null && (
        <span className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-fluid-xs">
          <Moon className="w-3.5 h-3.5 text-primary" /> <span className="text-muted">Sleep</span> <span className="helix-num font-bold text-text">{data.sleep}</span>
        </span>
      )}
    </div>
  )
}

/**
 * The week's AI loop — exactly two actions, per the brief:
 *   1. Export Week → a dense markdown payload on the clipboard.
 *   2. Paste AI Report → stored against this week and reopened via "Open Report".
 *
 * The old "Generate AI report" (a server round-trip that spent tokens on its own
 * prompt) and "Snapshot week" (a stats blob nobody read) are gone.
 */
function WeekActions({ node }: { node: TimelineWeekNode }) {
  const { data: payload, isLoading } = useWeeklyExport(node.weekStart)
  const { data: summaries } = useWeeklyAiSummaries()
  const save = useSaveWeeklyAiSummary()
  const [copied, setCopied] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const stored = summaries?.find((s) => s.weekStart === node.weekStart)

  const copy = async () => {
    if (!payload) return
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      // Clipboard blocked (insecure context / permissions) — drop the payload
      // into the textarea so it's never unreachable.
      setDraft(payload)
      setPasteOpen(true)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button onClick={copy} disabled={isLoading || !payload}
          className="btn-primary min-h-[40px] text-fluid-xs disabled:opacity-50"
          style={copied ? { background: EMERALD } : undefined}>
          {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Building…</>
            : copied ? <><Check className="w-4 h-4" /> Copied</>
            : <><ClipboardCopy className="w-4 h-4" /> Export week</>}
        </button>

        {stored ? (
          <button onClick={() => setReportOpen(true)} className="btn-glass min-h-[40px] text-fluid-xs"
            style={{ borderColor: `${GOLD}55`, color: GOLD }}>
            <BookOpen className="w-4 h-4" /> Open report
          </button>
        ) : null}

        <button onClick={() => { setDraft(stored?.content ?? ''); setPasteOpen(true) }}
          className="btn-glass min-h-[40px] text-fluid-xs">
          <Sparkles className="w-4 h-4" /> {stored ? 'Replace report' : 'Paste AI report'}
        </button>
      </div>

      {pasteOpen && (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            placeholder="Paste the AI's weekly summary here…"
            className="w-full rounded-xl border px-3 py-2.5 text-fluid-xs text-text bg-surface-2 outline-none focus:ring-2 focus:ring-primary/60"
            style={{ borderColor: 'rgba(255,255,255,0.10)' }}
          />
          <div className="flex gap-2">
            <button onClick={() => setPasteOpen(false)} className="btn-glass flex-1 justify-center min-h-[40px] text-fluid-xs">Cancel</button>
            <button
              onClick={() => save.mutate({ weekStart: node.weekStart, content: draft }, {
                onSuccess: () => { setPasteOpen(false); setReportOpen(true) },
              })}
              disabled={!draft.trim() || save.isPending}
              className="btn-primary flex-1 justify-center min-h-[40px] text-fluid-xs disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save report'}
            </button>
          </div>
          {save.isError && <p className="text-fluid-xs text-danger">{save.error instanceof Error ? save.error.message : 'Save failed'}</p>}
        </div>
      )}

      <Sheet open={reportOpen} onClose={() => setReportOpen(false)} title={`${node.weekLabel} · AI report`}>
        {stored && <MarkdownView md={stored.content} />}
      </Sheet>
    </div>
  )
}
