import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface DomainWidgetProps {
  title: string
  icon: LucideIcon
  /** Hex theme accent (e.g. '#7C5CFF' violet). Tints the header + icon chip. */
  accent: string
  children: ReactNode
  /** Optional footer line under the tile grid. */
  footer?: ReactNode
}

/**
 * A glassmorphic domain card: tinted header (icon chip + title) above a uniform
 * 2-column grid of StatTiles. The accent hex is applied via inline styles so any
 * theme colour works without bespoke Tailwind classes.
 */
export function DomainWidget({ title, icon: Icon, accent, children, footer }: DomainWidgetProps) {
  return (
    <div
      className="vital-card flex flex-col gap-3 h-full"
      style={{ borderColor: `${accent}33` }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
          style={{ background: `${accent}22`, color: accent }}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="font-heading text-sm font-semibold text-text">{title}</h2>
      </div>

      <div className="grid grid-cols-2 gap-2.5">{children}</div>

      {footer && <div className="text-xs text-muted-vital pt-0.5">{footer}</div>}
    </div>
  )
}
