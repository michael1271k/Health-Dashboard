'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export interface ReportPayload {
  volumeKg: number
  sets: number
  prs: number
  calories: number
  durationMin: number
  sessions: number
  weightDelta: number | null
  fatDelta: number | null
  days: Array<{ date: string; label: string; volumeKg: number | null; prs: number | null; split?: string }>
  verdict?: string
}

/** One saved report row — unified schema: (user_id, kind, week_start) is the key,
 * `payload` holds the deterministic stats and `content_md` the AI narrative. */
export interface ReportRow {
  id: string
  kind: string
  week_start: string
  week_number: number
  payload: ReportPayload
  content_md: string | null
  metrics: Record<string, unknown> | null
  created_at: string
}

const EMPTY_PAYLOAD: ReportPayload = {
  volumeKg: 0, sets: 0, prs: 0, calories: 0, durationMin: 0, sessions: 0,
  weightDelta: null, fatDelta: null, days: [],
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Coerce a raw JSONB payload into a well-formed ReportPayload. Rows written by
 * older schemas (or with a null payload) repair to zeroed stats instead of
 * crashing the render — the node still shows its `content_md` narrative.
 */
export function repairReportPayload(raw: unknown): ReportPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_PAYLOAD, days: [] }
  const p = raw as Record<string, unknown>
  const days = Array.isArray(p.days)
    ? p.days
        .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
        .map((d) => ({
          date: str(d.date),
          label: str(d.label),
          volumeKg: numOrNull(d.volumeKg),
          prs: numOrNull(d.prs),
          ...(typeof d.split === 'string' ? { split: d.split } : {}),
        }))
    : []
  return {
    volumeKg: num(p.volumeKg),
    sets: num(p.sets),
    prs: num(p.prs),
    calories: num(p.calories),
    durationMin: num(p.durationMin),
    sessions: num(p.sessions),
    weightDelta: numOrNull(p.weightDelta),
    fatDelta: numOrNull(p.fatDelta),
    days,
    ...(typeof p.verdict === 'string' ? { verdict: p.verdict } : {}),
  }
}

/** Saved reports, newest first. Degrades to [] before the `reports` table exists. */
export function useReports() {
  return useQuery({
    queryKey: ['reports', 'list'],
    staleTime: 60_000,
    queryFn: async (): Promise<ReportRow[]> => {
      const { data, error } = await supabase.from('reports')
        .select('id, kind, week_start, week_number, payload, content_md, metrics, created_at')
        .order('week_start', { ascending: false })
      if (error) return []
      return ((data ?? []) as Array<Omit<ReportRow, 'payload'> & { payload: unknown }>)
        .map((r) => ({ ...r, payload: repairReportPayload(r.payload) }))
    },
  })
}

export function useSaveReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (row: { kind: string; week_start: string; week_number: number; payload: ReportPayload }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      // Upsert on (user, kind, week_start) so re-generating a week overwrites.
      const { error } = await supabase.from('reports')
        .upsert({ user_id: user.id, ...row } as unknown as never, { onConflict: 'user_id,kind,week_start' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  })
}

export function useDeleteReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reports').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  })
}
