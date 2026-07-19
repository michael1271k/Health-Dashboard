'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useReports, type ReportPayload } from '@/lib/hooks/useReports'
import { useWeightTrend } from '@/lib/hooks/useCharts'
import { weekStartOf, isoAddDays } from '@/lib/hooks/useWeekSessions'
import { weekNumberOf } from '@/lib/reports/weekNumber'
import { logicalTodayISO } from '@/lib/utils/day'
import { enumerateWeeks } from '@/lib/phases'
import { PROGRAMS, DEFAULT_PROGRAM_ID, eraForDate } from '@/lib/programs'
import { PHASES } from '@/lib/phases'
import type { EraFilter } from '@/lib/era/eraFilter'

export interface TimelineWeekNode {
  weekStart: string
  weekNumber: number
  sessions: number
  volumeKg: number
  sets: number
  durationMin: number
  prs: number
  weightDelta: number | null
  fatDelta: number | null
  days: ReportPayload['days']
  contentMd: string | null
  reportId?: string
  isLive: boolean
  era: 'ppl' | 'helix'
}

// Week → era map from the phase config. Crucially, Week 0 (weekStart 2026-07-12)
// is 'helix' here even though its Sunday precedes HELIX_CUT_START — so it counts
// as a Helix week under the 'axis' filter (eraForDate alone would misclass it).
const WEEK_ERA = new Map(
  enumerateWeeks(['cut', 'peak', 'bulk', 'maintenance']).map((w) => [w.weekStart, w.era]),
)
function weekEra(weekStart: string): 'ppl' | 'helix' {
  return WEEK_ERA.get(weekStart) ?? (eraForDate(weekStart) === 'axis' ? 'helix' : 'ppl')
}

/** Keep a week under the current era filter ('axis' ↔ helix phase era). */
function inEraFilter(nodeEra: 'ppl' | 'helix', filter: EraFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'axis') return nodeEra === 'helix'
  return nodeEra === 'ppl'
}

interface RawSession {
  id: string; started_at: string; day_key: string | null; split_day: string
  total_volume_kg: number | null; set_count: number | null; pr_count: number | null
  duration_min: number | null; notes: string | null
}

/**
 * Every timeline week — merges saved `reports` with weeks that have sessions but
 * no report yet (synthesized so they can be back-filled). One ranged
 * workout_sessions query grouped client-side by Sunday (no N-per-week fan-out).
 * Filtered by the training-era pills; Week 0 (partial Wed–Sat) now surfaces
 * because it has sessions, and any past week can be snapshotted.
 */
export function useTimelineWeeks(era: EraFilter) {
  const { data: reports } = useReports()
  const { data: weightRows } = useWeightTrend(400) // deep enough to cover the PPL era

  const sessionsQ = useQuery({
    queryKey: ['workout_sessions', 'timeline'],
    staleTime: 60_000,
    queryFn: async (): Promise<RawSession[]> => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('id, started_at, day_key, split_day, total_volume_kg, set_count, pr_count, duration_min, notes')
        .gte('started_at', `${PHASES[0].start}T00:00:00Z`)
        .order('started_at', { ascending: true })
        .limit(1000)
      if (error) throw error
      return ((data ?? []) as RawSession[]).filter((r) => !r.notes?.startsWith('__seed_'))
    },
  })

  const nodes = useMemo<TimelineWeekNode[]>(() => {
    const program = PROGRAMS[DEFAULT_PROGRAM_ID]
    const liveWeekStart = weekStartOf(logicalTodayISO())

    const weekDelta = (weekStart: string): { weightDelta: number | null; fatDelta: number | null } => {
      const end = isoAddDays(weekStart, 7)
      const rows = (weightRows ?? []).filter((r) => r.date >= weekStart && r.date < end).sort((a, b) => a.date.localeCompare(b.date))
      const w = rows.map((r) => r.weight_kg).filter((v): v is number => v != null)
      const f = rows.map((r) => r.body_fat_pct).filter((v): v is number => v != null)
      const delta = (xs: number[]) => (xs.length >= 2 ? Math.round((xs[xs.length - 1] - xs[0]) * 10) / 10 : null)
      return { weightDelta: delta(w), fatDelta: delta(f) }
    }

    // 1. Aggregate sessions into weeks.
    interface Agg { sessions: number; volumeKg: number; sets: number; durationMin: number; prs: number; days: ReportPayload['days'] }
    const byWeek = new Map<string, Agg>()
    for (const s of sessionsQ.data ?? []) {
      const date = s.started_at.slice(0, 10)
      const ws = weekStartOf(date)
      const a = byWeek.get(ws) ?? { sessions: 0, volumeKg: 0, sets: 0, durationMin: 0, prs: 0, days: [] }
      a.sessions += 1
      a.volumeKg += s.total_volume_kg ?? 0
      a.sets += s.set_count ?? 0
      a.durationMin += s.duration_min ?? 0
      a.prs += s.pr_count ?? 0
      a.days.push({
        date,
        label: (s.day_key && program.days.find((d) => d.key === s.day_key)?.label) ?? (s.split_day[0]?.toUpperCase() + s.split_day.slice(1)),
        volumeKg: s.total_volume_kg, prs: s.pr_count, split: s.split_day,
      })
      byWeek.set(ws, a)
    }

    const reportByWeek = new Map((reports ?? []).map((r) => [r.week_start, r]))
    const weekStarts = new Set<string>([...byWeek.keys(), ...reportByWeek.keys()])

    const out: TimelineWeekNode[] = []
    for (const ws of weekStarts) {
      const nodeEra = weekEra(ws)
      if (!inEraFilter(nodeEra, era)) continue
      const report = reportByWeek.get(ws)
      const isLive = ws === liveWeekStart
      if (report) {
        // Saved report wins — its frozen payload is authoritative.
        out.push({
          weekStart: ws, weekNumber: report.week_number,
          sessions: report.payload.sessions, volumeKg: report.payload.volumeKg,
          sets: report.payload.sets, durationMin: report.payload.durationMin, prs: report.payload.prs,
          weightDelta: report.payload.weightDelta, fatDelta: report.payload.fatDelta,
          days: report.payload.days, contentMd: report.content_md, reportId: report.id, isLive, era: nodeEra,
        })
      } else {
        const a = byWeek.get(ws)!
        out.push({
          weekStart: ws, weekNumber: weekNumberOf(ws),
          sessions: a.sessions, volumeKg: Math.round(a.volumeKg), sets: a.sets, durationMin: a.durationMin, prs: a.prs,
          ...weekDelta(ws),
          days: a.days, contentMd: null, isLive, era: nodeEra,
        })
      }
    }
    return out.sort((a, b) => b.weekStart.localeCompare(a.weekStart))
  }, [reports, sessionsQ.data, weightRows, era])

  return { nodes, isPending: !reports && sessionsQ.isPending }
}
