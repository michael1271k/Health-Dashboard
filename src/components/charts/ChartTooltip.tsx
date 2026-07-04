interface TooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string; unit?: string }>
  label?: string
}

export function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div
      className="rounded-xl px-3 py-2 text-sm"
      role="tooltip"
      style={{
        // SOLID dark surface — a translucent glass tooltip absorbed the chart's
        // neon fill on mobile and made the text unreadable.
        background: 'rgba(9,12,24,0.97)',
        border: '1px solid rgba(255,255,255,0.16)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
      }}
    >
      {label && (
        <p className="text-muted-vital text-xs mb-1.5 font-medium">{label}</p>
      )}
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
              aria-hidden="true"
            />
            <span className="text-muted-vital">{entry.name}:</span>
            <span className="vital-number font-semibold text-text">
              {typeof entry.value === 'number'
                ? entry.value % 1 === 0
                  ? entry.value.toLocaleString()
                  : entry.value.toFixed(1)
                : entry.value}
              {entry.unit && <span className="text-muted-vital ml-0.5">{entry.unit}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
