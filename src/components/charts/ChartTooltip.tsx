interface TooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string; unit?: string; dataKey?: string }>
  label?: string
  /**
   * Show ONLY this series (matched on `dataKey`, falling back to `name`).
   *
   * Recharts' own `shared={false}` is the documented way to do this and it does
   * not work here: item-level tooltips are driven by per-point mouse handlers,
   * and every line in these charts renders `dot={false}` for density, so there
   * is nothing to hit-test and the tooltip simply stops appearing. Focus is
   * therefore chosen explicitly — by tapping a legend entry — which behaves the
   * same under a finger as under a cursor.
   */
  focus?: string | null
}

export function ChartTooltip({ active, payload, label, focus }: TooltipProps) {
  if (!active || !payload?.length) return null
  const rows = focus
    ? payload.filter((e) => (e.dataKey ?? e.name) === focus || e.name === focus)
    : payload
  if (!rows.length) return null

  return (
    <div
      className="rounded-xl px-3 py-2 text-sm"
      role="tooltip"
      style={{
        // SOLID dark surface — a translucent glass tooltip absorbed the chart's
        // neon fill on mobile and made the text unreadable.
        background: 'rgba(12,13,17,0.96)',
        border: '1px solid rgba(255,255,255,0.16)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
      }}
    >
      {label && (
        <p className="text-muted text-xs mb-1.5 font-medium">{label}</p>
      )}
      <div className="space-y-1">
        {rows.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
              aria-hidden="true"
            />
            <span className="text-muted">{entry.name}:</span>
            <span className="helix-num font-semibold text-text">
              {typeof entry.value === 'number'
                ? entry.value % 1 === 0
                  ? entry.value.toLocaleString()
                  : entry.value.toFixed(1)
                : entry.value}
              {entry.unit && <span className="text-muted ml-0.5">{entry.unit}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
