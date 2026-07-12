'use client'

import { memo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Dumbbell, Check, TriangleAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { displayWeight, useUnitSystem } from '@/lib/utils/units'

/**
 * Fuel → Force — visually links the day's nutrition to its training
 * session: session chip, protein-adequacy tick, and a jump to the Day Vault.
 * Renders nothing on days without a session.
 */
export const FuelForceBand = memo(function FuelForceBand({ date, proteinG, proteinGoal }: {
  date: string
  proteinG: number | null
  proteinGoal: number | null
}) {
  const unit = useUnitSystem()
  const { data: session } = useQuery({
    queryKey: ['fuel_force_session', date],
    queryFn: async () => {
      const next = (() => { const x = new Date(`${date}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10) })()
      const { data } = await supabase.from('workout_sessions')
        .select('split_day, total_volume_kg, pr_count')
        .gte('started_at', `${date}T00:00:00Z`).lt('started_at', `${next}T00:00:00Z`)
        .order('started_at', { ascending: true }).limit(1)
      const rows = (data ?? []) as Array<{ split_day: string; total_volume_kg: number | null; pr_count: number | null }>
      return rows[0] ?? null
    },
    staleTime: 5 * 60_000,
  })

  if (!session) return null

  const known = proteinG != null && proteinGoal != null
  const proteinOk = known && proteinG >= proteinGoal * 0.9
  const split = session.split_day ? session.split_day[0].toUpperCase() + session.split_day.slice(1) : 'Session'
  const vol = session.total_volume_kg != null ? `${((displayWeight(session.total_volume_kg) ?? 0) / 1000).toFixed(1)}${unit === 'lb' ? 'k' : 't'}` : null

  return (
    <Link href={`/day/${date}`} prefetch={false}
      className="helix-card flex items-center gap-3 px-3.5 py-3 active:opacity-80"
      style={{ borderColor: '#3EE0FF30' }}>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0" style={{ background: '#3EE0FF1f', color: '#3EE0FF' }}>
        <Dumbbell className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="block text-fluid-sm font-medium text-text truncate">
          Fueled: {split}{vol ? ` · ${vol}` : ''}{(session.pr_count ?? 0) > 0 ? ` · ${session.pr_count} PR` : ''}
        </span>
        {known && (
          <span className="flex items-center gap-1 text-fluid-xs mt-0.5" style={{ color: proteinOk ? '#16F5C3' : '#FFB86B' }}>
            {proteinOk ? <Check className="w-3 h-3" /> : <TriangleAlert className="w-3 h-3" />}
            {proteinOk ? 'protein target hit for this session' : 'protein below target on a training day'}
          </span>
        )}
      </div>
    </Link>
  )
})
