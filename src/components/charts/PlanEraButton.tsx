'use client'

import { Sparkles } from 'lucide-react'
import { useUserGoals } from '@/lib/hooks/useDashboard'
import { HELIX_CUT_START } from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'

const GOLD = '#D4AF37'

const daysBetween = (fromISO: string, toISO: string): number =>
  Math.max(1, Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86_400_000) + 1)

/**
 * "[Plan] Era" range button — sets the chart window to span the whole of the
 * currently active plan/phase, from its start (`user_goals.phase_started_on`,
 * set when a phase is chosen in Settings) to today. Falls back to the Helix Cut
 * start when the phase was never switched / the column isn't migrated.
 */
export function PlanEraButton({ value, onChange, label = 'Helix Era' }: {
  value: number
  onChange: (days: number) => void
  label?: string
}) {
  const { data: goals } = useUserGoals()
  const start = (goals as { phase_started_on?: string | null } | null)?.phase_started_on || HELIX_CUT_START
  const days = daysBetween(start, logicalTodayISO())
  const active = value === days
  return (
    <button
      onClick={() => onChange(days)}
      aria-pressed={active}
      title={`Since ${start}`}
      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-fluid-xs font-semibold min-h-[40px] border transition-colors shrink-0"
      style={active
        ? { color: GOLD, borderColor: `${GOLD}55`, background: `${GOLD}1f`, boxShadow: `0 0 10px ${GOLD}33` }
        : { color: '#79808C', borderColor: 'transparent' }}
    >
      <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> {label}
    </button>
  )
}
