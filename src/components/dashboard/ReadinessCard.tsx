import type { Tables } from '@/lib/supabase/types'
import { computeReadiness } from '@/lib/scoring/readiness'

interface ReadinessCardProps {
  score: Tables<'daily_scores'> | null
  sleep: Tables<'sleep_sessions'> | null
  isLoading?: boolean
}

export function ReadinessCard({ score, sleep: _sleep, isLoading }: ReadinessCardProps) {
  const sleepScore = score?.sleep_score ?? 0
  const batteryPct = score?.battery_pct ?? 0
  const recoveryScore = score?.recovery_score ?? 0

  const readiness = !score
    ? computeReadiness({ sleepScore: 0, recoveryScore: 0 }, 0)
    : computeReadiness({ sleepScore, recoveryScore }, batteryPct)

  const borderColor = readiness.level === 'train_hard'
    ? 'border-primary/30'
    : readiness.level === 'train_light'
    ? 'border-warn/30'
    : 'border-danger/30'

  const bgColor = readiness.level === 'train_hard'
    ? 'bg-primary/10'
    : readiness.level === 'train_light'
    ? 'bg-warn/10'
    : 'bg-danger/10'

  return (
    <div className={`vital-card border ${borderColor} ${bgColor}`}>
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
            <p
              className="font-heading font-bold text-xl"
              style={{ color: readiness.color }}
            >
              {readiness.label}
            </p>
            <span
              className="text-sm font-medium opacity-70"
              style={{ color: readiness.color }}
              dir="rtl"
              lang="he"
            >
              {readiness.labelHe}
            </span>
          </div>
          <p className="text-muted-vital text-sm">{readiness.reason}</p>
        </div>
      )}
    </div>
  )
}
