'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { PPL_SPLITS } from '@/lib/types/workout'
import type { SplitDay } from '@/lib/types/workout'

export interface WorkoutSessionRow {
  id: string
  date: string           // YYYY-MM-DD derived from started_at
  startedAt: string
  splitDay: SplitDay
  splitLabel: string
  splitColor: string
  totalVolumeKg: number | null
  setCount: number | null
  avgBpm: number | null
  durationMin: number | null
  notes: string | null
  isGhost: boolean       // auto-detected Health workout pending a report
  isoWeek: string        // e.g. "2026-W26" for grouping
}

function isoWeek(date: Date): string {
  const tmp = new Date(date)
  tmp.setHours(0, 0, 0, 0)
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
  const week1 = new Date(tmp.getFullYear(), 0, 4)
  const weekNum = 1 + Math.round(
    ((tmp.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7,
  )
  return `${tmp.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

export function useWorkoutHistory(limit = 300) {
  return useQuery({
    queryKey: ['workout_sessions', 'history', limit],
    queryFn: async (): Promise<WorkoutSessionRow[]> => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('id, started_at, split_day, total_volume_kg, set_count, avg_bpm, duration_min, notes, report_md, status')
        .order('started_at', { ascending: false })
        .limit(limit)

      if (error) throw error

      const rows = (data ?? []) as Array<{
        id: string
        started_at: string
        split_day: string
        total_volume_kg: number | null
        set_count: number | null
        avg_bpm: number | null
        duration_min: number | null
        notes: string | null
        report_md: string | null
        status: string | null
      }>

      // Filter out seed sessions (their notes are __seed_*__ sentinel values)
      return rows
        .filter((r) => !r.notes?.startsWith('__seed_'))
        .map((r): WorkoutSessionRow => {
          const split  = r.split_day as SplitDay
          const splitCfg = PPL_SPLITS[split] ?? { label: r.split_day, color: '#8A97B0' }
          const date   = new Date(r.started_at)
          return {
            id:            r.id,
            date:          date.toLocaleDateString('en-CA'),
            startedAt:     r.started_at,
            splitDay:      split,
            splitLabel:    splitCfg.label,
            splitColor:    splitCfg.color,
            totalVolumeKg: r.total_volume_kg,
            setCount:      r.set_count,
            avgBpm:        r.avg_bpm,
            durationMin:   r.duration_min,
            notes:         r.notes,
            isGhost:       r.status === 'ghost',
            isoWeek:       isoWeek(date),
          }
        })
    },
    staleTime: 60_000,
  })
}

/** Delete a workout session (and its sets) — for managing ghost/test data. */
export function useDeleteSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('workout_sets').delete().eq('session_id', id)
      const { error } = await supabase.from('workout_sessions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout_sessions'] })
      qc.invalidateQueries({ queryKey: ['gym_reports'] })
    },
  })
}
