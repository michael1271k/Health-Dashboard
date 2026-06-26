import type { Tables } from '@/lib/supabase/types'

type ReadinessLevel = 'hard' | 'light' | 'rest'

function computeReadiness(
  score: Tables<'daily_scores'> | null,
  sleep: Tables<'sleep_sessions'> | null,
): ReadinessLevel {
  if (!score && !sleep) return 'rest'

  const sleepScore = score?.sleep_score ?? 50
  const batteryPct = score?.battery_pct ?? 50
  const recoveryScore = score?.recovery_score ?? 50

  const readiness = sleepScore * 0.4 + batteryPct * 0.4 + recoveryScore * 0.2

  if (readiness >= 70) return 'hard'
  if (readiness >= 45) return 'light'
  return 'rest'
}

const READINESS_CONFIG = {
  hard: {
    label: 'Train Hard',
    labelHe: 'אימון קשה',
    description: 'Your recovery is excellent. Push for PRs today.',
    color: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/30',
  },
  light: {
    label: 'Train Light',
    labelHe: 'אימון קל',
    description: 'Moderate recovery. Good for technique work.',
    color: 'text-warn',
    bg: 'bg-warn/10',
    border: 'border-warn/30',
  },
  rest: {
    label: 'Rest Today',
    labelHe: 'מנוחה',
    description: 'Recovery is low. Prioritize sleep and nutrition.',
    color: 'text-danger',
    bg: 'bg-danger/10',
    border: 'border-danger/30',
  },
}

interface ReadinessCardProps {
  score: Tables<'daily_scores'> | null
  sleep: Tables<'sleep_sessions'> | null
  isLoading?: boolean
}

export function ReadinessCard({ score, sleep, isLoading }: ReadinessCardProps) {
  const level = computeReadiness(score, sleep)
  const config = READINESS_CONFIG[level]

  return (
    <div className={`vital-card border ${config.border} ${config.bg}`}>
      <h2 className="font-heading font-semibold text-sm text-muted-vital uppercase tracking-wider mb-3">
        Readiness Coach
      </h2>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-7 w-32 bg-surface-2 rounded-lg animate-pulse" />
          <div className="h-4 w-48 bg-surface-2 rounded animate-pulse" />
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <p className={`font-heading font-bold text-xl ${config.color}`}>
              {config.label}
            </p>
            <span className={`text-sm font-medium ${config.color} opacity-70`} dir="rtl">
              {config.labelHe}
            </span>
          </div>
          <p className="text-muted-vital text-sm">{config.description}</p>
        </div>
      )}
    </div>
  )
}
