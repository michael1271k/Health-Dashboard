'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { m, AnimatePresence } from 'framer-motion'
import { Dumbbell, Trophy, Sparkles, Loader2, Trash2, ChevronRight, BatteryMedium, Moon, Camera } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useSaveReport, useDeleteReport } from '@/lib/hooks/useReports'
import { useTimelineWeeks, type TimelineWeekNode } from '@/lib/hooks/useTimelineWeeks'
import { weekStartOf, isoAddDays } from '@/lib/hooks/useWeekSessions'
import { splitColor } from '@/lib/types/workout'
import { logicalTodayISO } from '@/lib/utils/day'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { authedFetch } from '@/lib/utils/authedFetch'
import { blurOnTap } from '@/lib/utils/blurOnTap'
import { useEraFilter } from '@/lib/era/eraFilter'
import { EraFilterPills } from '@/components/era/EraFilterPills'
import { MarkdownView } from '@/components/reports/MarkdownView'

const GOLD = '#F5C15A'

type WeekNode = TimelineWeekNode

/** Dominant split of a week (for the node glow) — most frequent day split. */
function dominantSplit(days: TimelineWeekNode['days']): string | undefined {
  const counts = new Map<string, number>()
  for (const d of days) if (d.split) counts.set(d.split, (counts.get(d.split) ?? 0) + 1)
  let best: string | undefined, max = 0
  for (const [k, v] of counts) if (v > max) { max = v; best = k }
  return best
}

const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/**
 * The Cut-Program Timeline — a vertical glass spine where every saved weekly
 * report is a glowing node (plus a live node for the in-progress week). Nodes
 * reveal on scroll (opacity/translate only — no WebGL, iOS-60fps-safe) and
 * expand in place to a full week breakdown.
 */
export function ProgressionTimeline() {
  const { era } = useEraFilter()
  const { nodes, isPending } = useTimelineWeeks(era)
  const liveWeekStart = weekStartOf(logicalTodayISO())
  const [openWeek, setOpenWeek] = useState<string | null>(liveWeekStart)

  return (
    <div className="space-y-4">
      {/* Timeline is era-filterable too — default 'Helix 5.1', PPL legacy isolated. */}
      <EraFilterPills />

      {isPending ? (
        <div className="helix-card h-40 animate-pulse" aria-hidden="true" />
      ) : (
        <div className="relative pl-9">
          {/* Vertical glass spine */}
          <span aria-hidden="true" className="absolute left-[14px] top-1 bottom-1 w-px"
            style={{ background: 'linear-gradient(to bottom, rgba(34,211,238,0.55), rgba(255,255,255,0.10) 60%, transparent)' }} />

          <div className="space-y-3">
            {nodes.map((n) => (
              <TimelineNode
                key={n.weekStart}
                node={n}
                open={openWeek === n.weekStart}
                onToggle={() => setOpenWeek((w) => (w === n.weekStart ? null : n.weekStart))}
              />
            ))}
            {nodes.length === 0 && (
              <p className="text-fluid-sm text-muted py-8 text-center">No weeks in this era yet — log a session, then snapshot the week.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TimelineNode({ node, open, onToggle }: { node: WeekNode; open: boolean; onToggle: () => void }) {
  const color = splitColor(dominantSplit(node.days))
  const hasPRs = node.prs > 0

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="relative"
    >
      {/* Glowing node on the spine */}
      <span aria-hidden="true" className="absolute -left-[30px] top-4 h-3.5 w-3.5 rounded-full border-2"
        style={{
          borderColor: hasPRs ? GOLD : color,
          background: `${color}40`,
          boxShadow: `0 0 14px ${(hasPRs ? GOLD : color)}88`,
        }} />

      <button onClick={onToggle} onPointerUp={blurOnTap} className="helix-card w-full text-left px-4 py-3.5 active:opacity-90" style={{ borderColor: `${color}33` }}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-heading font-semibold text-fluid-sm text-text truncate">
            Week {node.weekNumber} · {label(node.weekStart)}–{label(isoAddDays(node.weekStart, 6))}
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
            <span className="helix-num" style={{ color: node.weightDelta <= 0 ? '#34D399' : '#FB7185' }}>
              {node.weightDelta > 0 ? '+' : ''}{node.weightDelta}{weightUnit()}
            </span>
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <WeekDetail node={node} />
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  )
}

function WeekDetail({ node }: { node: WeekNode }) {
  return (
    <div className="mt-2 ml-1 space-y-3 pb-1">
      {/* Split-colored session rows */}
      {node.days.length > 0 && (
        <div className="space-y-1.5">
          {node.days.map((d) => {
            const c = splitColor(d.split)
            return (
              <div key={d.date} className="flex items-center gap-3 rounded-lg bg-white/[0.02] px-3 py-2" style={{ borderLeft: `2px solid ${c}` }}>
                <span className="flex-1 min-w-0 text-fluid-sm font-medium truncate" style={{ color: c }}>{d.label}</span>
                {(d.prs ?? 0) > 0 && <span className="text-[10px] font-bold shrink-0" style={{ color: GOLD }}>{d.prs} PR</span>}
                <span className="helix-num text-fluid-xs text-muted tabular-nums shrink-0">{d.volumeKg != null ? `${Math.round(d.volumeKg).toLocaleString()}kg` : '—'}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Body deltas */}
      {(node.weightDelta != null || node.fatDelta != null) && (
        <div className="flex gap-5 text-fluid-xs">
          {node.weightDelta != null && (
            <span className="text-muted">Weight Δ <span className="helix-num font-bold" style={{ color: node.weightDelta <= 0 ? '#34D399' : '#FB7185' }}>{node.weightDelta > 0 ? '+' : ''}{node.weightDelta} {weightUnit()}</span></span>
          )}
          {node.fatDelta != null && (
            <span className="text-muted">Body-fat Δ <span className="helix-num font-bold" style={{ color: node.fatDelta <= 0 ? '#34D399' : '#FB7185' }}>{node.fatDelta > 0 ? '+' : ''}{node.fatDelta}%</span></span>
          )}
        </div>
      )}

      <WeekRecoveryStrip weekStart={node.weekStart} />

      {/* AI narrative or generate action */}
      {node.contentMd
        ? <div className="rounded-xl bg-black/20 border border-white/[0.06] p-4 max-h-[50vh] overflow-y-auto no-scrollbar"><MarkdownView md={node.contentMd} /></div>
        : <WeekActions node={node} />}
    </div>
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

function WeekActions({ node }: { node: WeekNode }) {
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
        // Real per-week stats now (the node carries aggregated sets/duration),
        // not the old hardcoded zeros. calories stays 0 — nutrition isn't
        // workout-derived; the AI report fills the richer picture.
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
        {/* Snapshot ANY week without a saved report — past weeks can be back-filled. */}
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
