'use client'

import { memo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Dumbbell, Check, TriangleAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

/**
 * Fuel → Force — visually links the day's nutrition to its training
 * session: session chip, protein-adequacy tick, and a jump to the Daily Nexus.
 * Renders nothing on days without a session.
 */
export const FuelForceBand = memo(function FuelForceBand({ date, proteinG, proteinGoal }: {
  date: string
  proteinG: number | null
  proteinGoal: number | null
}) {
  const { data: session } = useQuery({
    queryKey: ['fuel_force_session', date],
    queryFn: async () => {
      const next = (() => { const x = new Date(`${date}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10) })()
      const { data } = await supabase.from('workout_sessions')
        .select('split_day')
        .gte('started_at', `${date}T00:00:00Z`).lt('started_at', `${next}T00:00:00Z`)
        .order('started_at', { ascending: true }).limit(1)
      const rows = (data ?? []) as Array<{ split_day: string }>
      return rows[0] ?? null
    },
    staleTime: 5 * 60_000,
  })

  if (!session) return null

  const known = proteinG != null && proteinGoal != null
  const proteinOk = known && proteinG >= proteinGoal * 0.9
  const split = session.split_day ? session.split_day[0].toUpperCase() + session.split_day.slice(1) : 'Session'

  return (
    <Link href={`/day/${date}`} prefetch={false}
      className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 flex items-center gap-3 px-3.5 py-3 active:opacity-80"
      style={{ borderColor: '#8E9AAC30' }}>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0" style={{ background: '#8E9AAC1f', color: '#8E9AAC' }}>
        <Dumbbell className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        {/* ── THE RUN-ON NOTE IS GONE ────────────────────────────────────────
            This read `Fueled: Upper · 4.6t · 8 PR` — a split label, a tonnage
            and a PR count welded into one sentence, on the NUTRITION page. It
            restated three figures the Workout tab and the widgets already own,
            in the one place none of them are actionable, and it read as a
            leftover from the pasted-report machinery that was removed in
            ae680f2 (which is exactly what it looked like).
            What the band is FOR survives below: protein against target on a day
            you trained. That is a nutrition fact about a training day, which is
            the only reason this component sits on this page. */}
        <span className="block text-fluid-sm font-medium text-text truncate">
          {split} session logged
        </span>
        {known && (
          <span className="flex items-center gap-1 text-fluid-xs mt-0.5" style={{ color: proteinOk ? '#E0703C' : '#D4AF37' }}>
            {proteinOk ? <Check className="w-3 h-3" /> : <TriangleAlert className="w-3 h-3" />}
            {proteinOk ? 'protein target hit for this session' : 'protein below target on a training day'}
          </span>
        )}
      </div>
    </Link>
  )
})
