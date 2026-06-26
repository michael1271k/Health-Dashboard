import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: string | number | null
  unit?: string
  icon: LucideIcon
  iconColor?: string
  subtext?: string
  isLoading?: boolean
  trend?: 'up' | 'down' | 'neutral'
}

export function MetricCard({
  label,
  value,
  unit,
  icon: Icon,
  iconColor = 'text-muted-vital',
  subtext,
  isLoading,
}: MetricCardProps) {
  return (
    <div className="vital-card flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-vital font-medium">{label}</span>
        <Icon className={`w-4 h-4 ${iconColor}`} aria-hidden="true" />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-8 w-24 bg-surface-2 rounded-lg animate-pulse" />
          <div className="h-4 w-16 bg-surface-2 rounded animate-pulse" />
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="vital-number text-3xl font-bold text-text">
              {value ?? '—'}
            </span>
            {unit && <span className="text-muted-vital text-sm">{unit}</span>}
          </div>
          {subtext && (
            <p className="text-xs text-muted-vital">{subtext}</p>
          )}
        </>
      )}
    </div>
  )
}
