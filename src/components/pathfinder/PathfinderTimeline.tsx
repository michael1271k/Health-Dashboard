'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { m, AnimatePresence } from 'framer-motion'
import { Dumbbell, Trophy, Sparkles, Loader2, Trash2, ChevronRight, BatteryMedium, Moon, Camera } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useSaveReport, useDeleteReport } from '@/lib/hooks/useReports'
import { useTimelineWeeks, type TimelineWeekNode } from '@/lib/hooks/useTimelineWeeks'
import { useContinuum, type ContinuumDay } from '@/lib/hooks/useContinuum'
import { weekStartOf, isoAddDays } from '@/lib/utils/week'
import { splitColor } from '@/lib/types/workout'
import { logicalTodayISO } from '@/lib/utils/day'
import { displayWeight, weightUnit, useUnitSystem } from '@/lib/utils/units'
import { eraForDate } from '@/lib/programs'
import { authedFetch } from '@/lib/utils/authedFetch'
import { blurOnTap } from '@/lib/utils/blurOnTap'
import { useEraFilter } from '@/lib/era/eraFilter'
import { MarkdownView } from '@/components/reports/MarkdownView'
import { DayCard } from '@/components/timeline/ContinuumTimeline'

const GOLD = '#D4AF37'
const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function dominantSplit(days: TimelineWeekNode['days']): string | undefined {
  const counts = new Map<string, number>()
  for (const d of days) if (d.split) counts.set(d.split, (counts.get(d.split) ?? 0) + 1)
  let best: string | undefined, max = 0
  for (const [k, v] of counts) if (v > max) { max = v; best = k }
  return best
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

  return (
    <div className="space-y-4">
      {isPending ? (
        <div className="helix-card h-40 animate-pulse" aria-hidden="true" />
      ) : nodes.length === 0 ? (
        <p className="text-fluid-sm text-muted py-8 text-center">No weeks in this era yet — log a session, then snapshot the week.</p>
      ) : (
        <div className="relative pl-9">
          <span aria-hidden="true" className="absolute left-[14px] top-1 bottom-1 w-px"
            style={{ background: 'linear-gradient(to bottom, rgba(34,211,238,0.55), rgba(255,255,255,0.10) 60%, transparent)' }} />
          <div className="space-y-3">
            {nodes.map((n) => (
              <WeekCapsule
                key={n.weekStart}
                node={n}
                days={daysByWeek.get(n.weekStart) ?? []}
                unit={unit}
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

function WeekCapsule({ node, days, unit, open, onToggle, onOpenDay }: {
  node: TimelineWeekNode
  days: ContinuumDay[]
  unit: string
  open: boolean
  onToggle: () => void
  onOpenDay: (date: string) => void
}) {
  const color = splitColor(dominantSplit(node.days))
  const hasPRs = node.prs > 0

  return (
    <m.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="relative">
      <span aria-hidden="true" className="absolute -left-[30px] top-4 h-3.5 w-3.5 rounded-full border-2"
        style={{ borderColor: hasPRs ? GOLD : color, background: `${color}40`, boxShadow: `0 0 14px ${(hasPRs ? GOLD : color)}88` }} />

      <button onClick={onToggle} onPointerUp={blurOnTap} className="helix-card w-full text-left px-4 py-3.5 active:opacity-90" style={{ borderColor: `${color}33` }}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-heading font-semibold text-fluid-sm text-text truncate">
            {node.weekLabel} · {label(node.weekStart)}–{label(isoAddDays(node.weekStart, 6))}
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {node.isLive && <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ color, background: `${color}1a`, border: `1px solid ${color}44` }}>Live</span>}
            <ChevronRight className={`w-4 h-4 text-muted transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-fluid-xs text-muted">
          <span className="flex items-center gap-1"><Dumbbell className="w-3 h-3" />{node.sessions}</span>
          {node.volumeKg > 0 && <span className="helix-num">{((displayWeight(node.volumeKg) ?? 0) / 1000).toFixed(1)}t</span>}
          {hasPRs && <span className="flex items-center gap-1" style={{ color: GOLD }}><Trophy className="w-3 h-3" />{node.prs}</span>}
          {node.weightDelta != null && (
            <span className="helix-num" style={{ color: node.weightDelta <= 0 ? '#3E9E7A' : '#C4514E' }}>
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
                    <span className="text-muted">Weight Δ <span className="helix-num font-bold" style={{ color: node.weightDelta <= 0 ? '#3E9E7A' : '#C4514E' }}>{node.weightDelta > 0 ? '+' : ''}{node.weightDelta} {weightUnit()}</span></span>
                  )}
                  {node.fatDelta != null && (
                    <span className="text-muted">Body-fat Δ <span className="helix-num font-bold" style={{ color: node.fatDelta <= 0 ? '#3E9E7A' : '#C4514E' }}>{node.fatDelta > 0 ? '+' : ''}{node.fatDelta}%</span></span>
                  )}
                </div>
              )}

              <WeekRecoveryStrip weekStart={node.weekStart} />

              {node.contentMd
                ? <div className="rounded-xl bg-black/20 border border-white/[0.06] p-4 max-h-[50vh] overflow-y-auto no-scrollbar"><MarkdownView md={node.contentMd} /></div>
                : <WeekActions node={node} />}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  )
}

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

function WeekActions({ node }: { node: TimelineWeekNode }) {
  const save = useSaveReport()
  const del = useDeleteReport()
  const [aiBusy, setAiBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function generateAI() {
    setAiBusy(true); setErr(null)
    try {
      const res = await authedFetch('/api/ai/weekly-report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStart: node.weekStart }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') }
    finally { setAiBusy(false) }
  }

  function snapshot() {
    save.mutate({
      kind: 'weekly', week_start: node.weekStart, week_number: node.weekNumber,
      payload: {
        volumeKg: node.volumeKg, sets: node.sets, prs: node.prs, calories: 0, durationMin: node.durationMin,
        sessions: node.sessions, weightDelta: node.weightDelta, fatDelta: node.fatDelta, days: node.days,
      },
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button onClick={generateAI} disabled={aiBusy} className="btn-primary min-h-[40px] text-fluid-xs">
          {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {aiBusy ? 'Generating…' : 'Generate AI report'}
        </button>
        {!node.reportId && (
          <button onClick={snapshot} disabled={save.isPending} className="btn-glass min-h-[40px] text-fluid-xs">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Snapshot week
          </button>
        )}
        {node.reportId && (
          <button onClick={() => del.mutate(node.reportId!)} aria-label="Delete report"
            className="min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center text-muted hover:text-danger">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      {err && <p className="text-fluid-xs text-danger">{err}</p>}
    </div>
  )
}
