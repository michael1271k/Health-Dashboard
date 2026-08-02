'use client'

/**
 * A zone — one bordered container holding several related readouts, separated
 * by hairlines instead of by more cards.
 *
 * WHY
 * The Daily Nexus was ten `.helix-card`s stacked vertically. Each carries
 * `p-5` (20px), a `backdrop-filter: blur(40px)`, its own `<h3>` and 12px of gap
 * below it — roughly 400px of padding and 280px of headings before any data
 * renders, repeated whether or not the card had much to say. The information
 * was never the problem; the chrome around it was.
 *
 * Same move the Session Report made when it became a grouped ledger: one
 * container, hairline dividers, an inline 10px label per block rather than a
 * heading per card.
 */
export function Zone({ label, accent, children, className = '' }: {
  label: string
  /** Hex used for the label and a 2px rule down the left edge. */
  accent: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-2xl border overflow-hidden bg-white/[0.02] ${className}`}
      style={{ borderColor: `${accent}26` }}
      aria-label={label}
    >
      <div className="flex items-stretch">
        <span className="w-[2px] shrink-0" style={{ background: `${accent}59` }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <span className="block px-3 pt-2 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: accent }}>
            {label}
          </span>
          {children}
        </div>
      </div>
    </section>
  )
}

/**
 * One block inside a zone. `divide` draws the hairline above it — the first row
 * in a zone should omit it so the label doesn't sit on a line.
 */
export function ZoneRow({ children, divide = true, className = '', onClick, title }: {
  children: React.ReactNode
  divide?: boolean
  className?: string
  /** Rows can be interactive — the Fuel row keeps its double-tap-to-edit. */
  onClick?: () => void
  title?: string
}) {
  return (
    <div
      className={`px-3 py-2 ${className}`}
      style={divide ? { borderTop: '1px solid rgba(255,255,255,0.06)' } : undefined}
      onClick={onClick}
      title={title}
    >
      {children}
    </div>
  )
}

/**
 * A horizontally scrollable strip of inline value+label pairs.
 *
 * Replaces the 3×2 grid of bordered micro-tiles: six short numbers cost two
 * full rows of boxes, and adding a seventh metric opened a third. Scrolling
 * sideways keeps it at one row no matter how many arrive — the same fix
 * SessionHero's stat strip made.
 */
export function StatStrip({ stats }: {
  stats: Array<{ label: string; value: string | null; unit?: string; color: string }>
}) {
  return (
    <div className="flex items-baseline gap-3.5 overflow-x-auto no-scrollbar">
      {stats.map((s) => (
        <span key={s.label} className="inline-flex items-baseline gap-1 shrink-0">
          <span className="helix-num text-fluid-sm font-bold text-text tabular-nums leading-none">
            {s.value ?? '—'}{s.value != null && s.unit ? s.unit : ''}
          </span>
          <span className="text-[9px] uppercase tracking-wide" style={{ color: s.color }}>{s.label}</span>
        </span>
      ))}
    </div>
  )
}
