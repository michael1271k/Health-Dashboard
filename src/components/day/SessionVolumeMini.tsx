'use client'

import { memo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

const TEAL = '#8B5CF6'
const ICE = '#38BDF8'

/**
 * Inline, hardware-light SVG of a session's volume STRUCTURE — one bar per set,
 * height scaled to that set's volume (weight × reps), PR sets glow ice-blue.
 * Fetched only when a session id is present (never on rest days). No recharts.
 */
export const SessionVolumeMini = memo(function SessionVolumeMini({ sessionId }: { sessionId: string }) {
  const { data } = useQuery({
    queryKey: ['session_set_bars', sessionId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('workout_sets')
        .select('weight_kg, reps, is_pr, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
      return ((data ?? []) as Array<{ weight_kg: number; reps: number; is_pr: boolean }>)
        .map((s) => ({ v: (s.weight_kg || 0) * (s.reps || 0), pr: s.is_pr }))
    },
  })

  if (!data || data.length === 0) {
    return <div className="h-10 rounded-lg bg-white/[0.03]" aria-hidden="true" />
  }

  const max = Math.max(...data.map((d) => d.v), 1)
  const n = data.length
  const gap = 2
  const barW = Math.max(2, (100 - gap * (n - 1)) / n)

  return (
    <svg viewBox="0 0 100 40" width="100%" height="40" preserveAspectRatio="none"
      role="img" aria-label={`${n} sets, volume structure`}>
      {data.map((d, i) => {
        const h = Math.max(2, (d.v / max) * 38)
        const x = i * (barW + gap)
        return (
          <rect key={i} x={x} y={40 - h} width={barW} height={h} rx={0.8}
            fill={d.pr ? ICE : TEAL} opacity={d.pr ? 1 : 0.72}
            style={d.pr ? { filter: `drop-shadow(0 0 3px ${ICE})` } : undefined} />
        )
      })}
    </svg>
  )
})
