'use client'

import { authedFetch } from '@/lib/utils/authedFetch'
import { logicalTodayISO } from '@/lib/utils/day'
import type { Tables } from '@/lib/supabase/types'

/** The single bundled "today" payload served by `GET /api/today`. */
export interface TodayBundle {
  date: string
  score: Tables<'daily_scores'> | null
  dailyLog: Tables<'daily_logs'> | null
  metrics: Tables<'daily_metrics'> | null
  nutrition: Tables<'nutrition_entries'> | null
  sleep: Tables<'sleep_sessions'> | null
  goals: Tables<'user_goals'> | null
}

/** Shared query key — every "today" selector hook subscribes to this ONE query,
 *  so React Query dedupes them into a single network request. */
export const todayBundleKey = (date = logicalTodayISO()): [string, string] => ['today', date]

const EMPTY: Omit<TodayBundle, 'date'> = {
  score: null, dailyLog: null, metrics: null, nutrition: null, sleep: null, goals: null,
}

/** One authed round-trip for the whole dashboard "today" view. */
export async function fetchTodayBundle(date = logicalTodayISO()): Promise<TodayBundle> {
  const res = await authedFetch(`/api/today?date=${date}`)
  if (!res.ok) throw new Error(`today bundle ${res.status}`)
  const body = (await res.json()) as Partial<TodayBundle>
  return { date, ...EMPTY, ...body }
}
