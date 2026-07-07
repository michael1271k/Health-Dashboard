interface StatTileProps {
  label: string
  value: string | number | null | undefined
  unit?: string
  sub?: string
  /** Hex accent for the value — defaults to primary text. */
  accent?: string
  isLoading?: boolean
}

/**
 * A single metric cell inside a domain detail sheet: label on top, large value, an
 * optional unit and a smaller sub-line. Renders an em-dash for missing values.
 */
export function StatTile({ label, value, unit, sub, accent, isLoading }: StatTileProps) {
  const display = value === null || value === undefined || value === '' ? '—' : value

  return (
    <div className="rounded-xl bg-surface-2/40 px-3 py-2.5 flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-vital leading-none">{label}</span>
      {isLoading ? (
        <div className="h-6 w-16 bg-surface-2 rounded animate-pulse mt-0.5" />
      ) : (
        <div className="flex items-baseline gap-1">
          <span
            className="helix-num text-xl font-bold leading-none"
            style={{ color: accent ?? 'var(--color-text)' }}
          >
            {display}
          </span>
          {unit && display !== '—' && <span className="text-[11px] text-muted-vital">{unit}</span>}
        </div>
      )}
      {sub && <span className="text-[10px] text-muted-vital leading-none">{sub}</span>}
    </div>
  )
}
