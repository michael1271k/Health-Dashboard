'use client'

import { ScoreRings } from './ScoreRings'

interface BatteryCardProps {
  battery: number | null
  sleepScore?: number | null
  recoveryScore?: number | null
  isLoading?: boolean
}

function batteryLabel(battery: number): { label: string; color: string } {
  if (battery >= 80) return { label: 'Fully Charged', color: '#43F59B' }  // mint
  if (battery >= 60) return { label: 'Good Energy', color: '#19E3B1' }    // teal
  if (battery >= 40) return { label: 'Moderate', color: '#FFB020' }
  if (battery >= 20) return { label: 'Low Energy', color: '#FFB020' }
  return { label: 'Depleted', color: '#FF5470' }
}

/**
 * Daily Battery hero — concentric glowing glass rings (no 3D/R3F). Outer ring is
 * battery charge; inner rings give sleep + recovery context. Null-aware: an
 * un-computed score shows "Awaiting score", never a misleading red 0%.
 */
export function BatteryCard({ battery, sleepScore, recoveryScore, isLoading }: BatteryCardProps) {
  const hasData = battery !== null && battery !== undefined
  const value = hasData ? battery : 0
  const { label, color } = hasData
    ? batteryLabel(value)
    : { label: 'Awaiting score', color: 'var(--color-muted-vital)' }

  const rings = hasData
    ? [
        { label: 'Battery', value, color },
        { label: 'Sleep', value: sleepScore ?? 0, color: '#38E1FF' },     // cyan
        { label: 'Recovery', value: recoveryScore ?? 0, color: '#43F59B' }, // mint
      ]
    : [{ label: 'Battery', value: 6, color: '#3A4A66' }]

  return (
    <div className="vital-card flex flex-col h-full min-h-[240px] sm:min-h-[280px]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading font-semibold text-fluid-lg">Daily Battery</h2>
        <span className="text-fluid-xs text-muted-vital uppercase tracking-wider">Today</span>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-32 h-32 rounded-full bg-surface-2 animate-pulse" aria-hidden="true" />
        </div>
      ) : (
        <div
          className="flex-1 flex flex-col items-center justify-center gap-4"
          aria-label={hasData ? `Battery: ${value}%` : 'Battery: awaiting today’s score'}
        >
          <ScoreRings
            testId="battery-orb"
            centerValue={hasData ? value : '—'}
            centerUnit={hasData ? '%' : undefined}
            rings={rings}
            caption={label}
            captionColor={color}
          />
          <p className="text-fluid-xs text-muted-vital text-center">
            {hasData ? 'Sleep · Recovery context rings' : 'Syncing today’s data…'}
          </p>
        </div>
      )}
    </div>
  )
}
