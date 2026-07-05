'use client'

import type { Tables } from '@/lib/supabase/types'

const SCORE_COMPONENTS = [
  { key: 'sleep_score',     label: 'Sleep',      weight: 25, color: '#38BDF8' },
  { key: 'nutrition_score', label: 'Nutrition',   weight: 30, color: '#00E5A0' },
  { key: 'activity_score',  label: 'Activity',    weight: 20, color: '#7C5CFF' },
  { key: 'workout_score',   label: 'Workout',     weight: 15, color: '#FFB020' },
  { key: 'recovery_score',  label: 'Recovery',    weight: 10, color: '#94A3B8' },
] as const

type ScoreKey = typeof SCORE_COMPONENTS[number]['key']

function RingSegment({
  value,
  color,
  label,
  weight,
}: {
  value: number | null
  color: string
  label: string
  weight: number
}) {
  const isNull = value == null
  const pct = value ?? 0
  const r = 16
  const circ = 2 * Math.PI * r
  const fill = circ * (pct / 100)

  return (
    <div className="flex flex-col items-center gap-1.5 group cursor-default" title={`${label}: ${isNull ? 'no data' : pct + '/100'}`}>
      <div className="relative w-10 h-10">
        <svg viewBox="0 0 40 40" className="-rotate-90 w-full h-full" aria-hidden="true">
          <circle cx="20" cy="20" r={r} fill="none" stroke="#243040" strokeWidth="4" strokeDasharray={isNull ? '2 3' : undefined} />
          {!isNull && (
            <circle
              cx="20" cy="20" r={r}
              fill="none"
              stroke={color}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${fill} ${circ - fill}`}
              style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1)' }}
            />
          )}
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center vital-number text-[10px] font-bold"
          style={{ color: isNull ? '#5A6B85' : color }}
        >
          {isNull ? '—' : pct}
        </span>
      </div>
      <span className="text-[10px] text-muted-vital">{label}</span>
      <span className="text-[9px] text-muted-vital/60">{weight}%</span>
    </div>
  )
}

interface ScoreCardProps {
  score: Tables<'daily_scores'> | null
  isLoading?: boolean
}

export function ScoreCard({ score, isLoading }: ScoreCardProps) {
  const totalScore = score?.score ?? null

  const scoreColor =
    totalScore == null ? 'text-muted-vital' :
    totalScore >= 80 ? 'text-primary' :
    totalScore >= 60 ? 'text-info' :
    totalScore >= 40 ? 'text-warn' :
    'text-danger'

  return (
    <div className="vital-card flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading font-semibold text-lg">Daily Score</h2>
        <span className="text-xs text-muted-vital uppercase tracking-wider">Today</span>
      </div>

      {isLoading ? (
        <div className="flex-1 space-y-4">
          <div className="h-16 bg-surface-2 rounded-xl animate-pulse" />
          <div className="flex justify-between gap-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex-1 h-16 bg-surface-2 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-5">
          {/* Total score display */}
          <div className="flex items-baseline gap-2">
            <span
              className={`vital-number text-6xl font-bold leading-none ${scoreColor}`}
              aria-label={totalScore == null ? 'Daily score: no data yet' : `Daily score: ${totalScore} out of 100`}
            >
              {totalScore ?? '—'}
            </span>
            <span className="text-muted-vital text-lg">{totalScore == null ? 'no data yet' : '/100'}</span>
          </div>

          {/* Component rings */}
          <div className="flex items-end justify-between gap-2" role="list" aria-label="Score components">
            {SCORE_COMPONENTS.map(({ key, label, weight, color }) => (
              <div key={key} role="listitem">
                <RingSegment
                  value={score?.[key as ScoreKey] ?? null}
                  color={color}
                  label={label}
                  weight={weight}
                />
              </div>
            ))}
          </div>

          {/* Sync time */}
          {score?.computed_at && (
            <p className="text-xs text-muted-vital mt-auto">
              Last sync{' '}
              {new Intl.DateTimeFormat('en-IL', {
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(score.computed_at))}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
