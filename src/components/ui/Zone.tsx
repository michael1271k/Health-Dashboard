'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { tapLight } from '@/lib/native/haptics'

/**
 * The band system — one instrument surface instead of a grid of floating cards.
 *
 * WHY
 * The Daily Nexus was ten `.helix-card`s stacked vertically. Each carried
 * `p-5` (20px), a `backdrop-filter: blur(40px)`, its own `<h3>` and 12px of gap
 * below it — roughly 400px of padding and 280px of headings before any data
 * rendered, repeated whether or not the card had much to say. The information
 * was never the problem; the chrome around it was.
 *
 * HOW IT IS SHAPED
 * `Surface` is the only primitive. It is a region of the page with an optional
 * accent rule, a measure for its content, and nothing else. Everything with a
 * name — a labelled band, a header, a skeleton, an empty state, a metric tile —
 * composes it. That split is what stops `Zone` collecting a prop for every
 * shape in the app: if a thing has no label, it is not a Zone, it is a Surface.
 */

/**
 * How wide the CONTENT gets, never the surface.
 *
 * A band must reach both screen edges — that is the whole point — while the
 * text inside it still takes a readable column on a 27" monitor. Splitting the
 * two is what lets one component serve a phone and a desktop.
 *
 * `read` is prose, ledgers, stat rows. `data` is charts, tables and calendars,
 * which a 68ch column strangles into a postage stamp. `grid` is the dashboard
 * bento, which genuinely wants the old 7xl. `full` opts out.
 *
 * Literal strings, not built from a template: Tailwind scans source text, so a
 * dynamically assembled class name is never generated.
 */
const MEASURE = {
  read: 'mx-auto w-full max-w-[68ch]',
  data: 'mx-auto w-full max-w-[96ch]',
  grid: 'mx-auto w-full max-w-[80rem]',
  full: 'w-full',
} as const

export type Measure = keyof typeof MEASURE

/**
 * `band` is edge-to-edge with a bottom hairline — the default, and what makes
 * consecutive sections read as one surface rather than as scattered panels.
 * `inset` is a rounded container, for something nested INSIDE a band.
 * `hero` is a band with room to breathe and an accent wash.
 * `raised` is an inset that lifts, for a row you can pick up and drag.
 */
export type SurfaceVariant = 'band' | 'inset' | 'hero' | 'raised'

const VARIANT: Record<SurfaceVariant, string> = {
  band: 'border-b bg-white/[0.02]',
  inset: 'rounded-2xl border bg-white/[0.02]',
  hero: 'border-b',
  raised: 'rounded-2xl border bg-white/[0.03] shadow-[0_8px_24px_rgba(0,0,0,0.4)]',
}

/**
 * Inner padding.
 *
 * `none` is right for a band whose children are ZoneRows (they pad themselves).
 * `card` is the old `.helix-card` p-5, for a self-contained panel that is not
 * a row list — a chart frame, a settings group, a hero.
 */
const SURFACE_PAD = {
  none: '',
  card: 'p-5',
  snug: 'p-4',
} as const

export function Surface({
  children,
  variant = 'band',
  accent,
  measure = 'read',
  pad = 'none',
  as = 'section',
  href,
  onPress,
  className = '',
  style,
  label,
}: {
  children: React.ReactNode
  variant?: SurfaceVariant
  /** Hex. Drives the left rule, the border tint, and the hero wash. */
  accent?: string
  measure?: Measure
  pad?: keyof typeof SURFACE_PAD
  /** `button` renders a real button with press feedback. Ignored when `href` is set. */
  as?: 'section' | 'div' | 'button'
  href?: string
  onPress?: () => void
  className?: string
  style?: React.CSSProperties
  /** Accessible name. Required for `button`/`href`, optional otherwise. */
  label?: string
}) {
  const bleeds = variant === 'band' || variant === 'hero'
  const interactive = Boolean(href || onPress || as === 'button')

  const borderColor = accent && !bleeds ? `${accent}26` : 'rgba(255,255,255,0.07)'
  const body = (
    <div className="flex items-stretch">
      {accent && (
        <span
          className={bleeds ? 'w-[3px] shrink-0' : 'w-[2px] shrink-0'}
          style={{ background: `${accent}59` }}
          aria-hidden="true"
        />
      )}
      <div className={`min-w-0 flex-1 ${MEASURE[measure]} ${SURFACE_PAD[pad]}`}>{children}</div>
    </div>
  )

  const cls = [
    VARIANT[variant],
    variant === 'hero' ? 'py-2' : '',
    interactive ? 'w-full text-left active:opacity-80 transition-opacity' : '',
    className,
  ].filter(Boolean).join(' ')

  const merged: React.CSSProperties = {
    borderColor,
    ...(variant === 'hero' && accent
      ? { background: `linear-gradient(180deg, ${accent}10, transparent 70%)` }
      : null),
    ...style,
  }

  // Feedback on pointer-DOWN, not on release: a press that only acknowledges
  // itself once the finger lifts reads as lag, however fast the handler is.
  const press = interactive ? { onPointerDown: () => { void tapLight() } } : {}

  if (href) {
    return (
      <Link href={href} className={cls} style={merged} aria-label={label} {...press}>
        {body}
      </Link>
    )
  }
  if (as === 'button') {
    return (
      <button type="button" onClick={onPress} className={cls} style={merged} aria-label={label} {...press}>
        {body}
      </button>
    )
  }
  const Tag = as
  return (
    <Tag className={cls} style={merged} aria-label={label}>
      {body}
    </Tag>
  )
}

/**
 * A labelled band. The label is a 10px rule-line, not an `<h3>` — a heading per
 * section was most of the vertical space the cards wasted.
 */
export function Zone({ label, accent, children, className = '', variant = 'band', measure = 'read', action }: {
  label: string
  /** Hex used for the label and the rule down the left edge. */
  accent: string
  children: React.ReactNode
  className?: string
  variant?: 'band' | 'inset'
  measure?: Measure
  /** Rendered on the label line, right-aligned: a toggle, a count, a chip. */
  action?: React.ReactNode
}) {
  return (
    <Surface variant={variant} accent={accent} measure={measure} className={className} label={label}>
      <div className="flex items-center gap-2 px-3 pt-2">
        <span className="block text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: accent }}>
          {label}
        </span>
        {action && <span className="ml-auto shrink-0">{action}</span>}
      </div>
      {children}
    </Surface>
  )
}

/**
 * A richer header for a Zone whose label alone is not enough — a title with a
 * subtitle, an icon, or a control on the right. Renders as the first row, so it
 * omits the divider.
 */
export function ZoneHeader({ title, subtitle, icon: Icon, accent, action }: {
  title: string
  subtitle?: string
  icon?: LucideIcon
  accent?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      {Icon && <Icon className="w-4 h-4 shrink-0" style={{ color: accent }} aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <span className="block font-heading font-semibold text-fluid-sm text-text truncate">{title}</span>
        {subtitle && <span className="block text-[11px] text-muted truncate">{subtitle}</span>}
      </div>
      {action && <span className="shrink-0">{action}</span>}
    </div>
  )
}

/**
 * One block inside a zone. `divide` draws the hairline above it — the first row
 * in a zone should omit it so the label doesn't sit on a line.
 */
export function ZoneRow({
  children, divide = true, className = '', onClick, title, asButton = false, href, feedback,
}: {
  children: React.ReactNode
  divide?: boolean
  className?: string
  /** Rows can be interactive — the Fuel row keeps its double-tap-to-edit. */
  onClick?: () => void
  title?: string
  /**
   * Render a real `<button>` rather than a clickable div.
   *
   * Set this whenever the row NAVIGATES (the water row jumps the pager to
   * Hydration): a div with an onClick is invisible to the keyboard and to a
   * screen reader. The Fuel row deliberately stays a div — its handler is a
   * double-tap gesture, not a single activation, so button semantics would
   * promise something it doesn't do.
   */
  asButton?: boolean
  /** Renders a link row. Takes precedence over `asButton`. */
  href?: string
  /** Haptic + press state on pointer-down. Implied by `href`/`asButton`. */
  feedback?: boolean
}) {
  const style = divide ? { borderTop: '1px solid rgba(255,255,255,0.06)' } : undefined
  const wantsFeedback = feedback ?? Boolean(href || asButton)
  const press = wantsFeedback ? { onPointerDown: () => { void tapLight() } } : {}
  const base = `px-3 py-2 ${className}`

  if (href) {
    return (
      <Link href={href} className={`block w-full active:opacity-80 ${base}`} style={style} title={title} {...press}>
        {children}
      </Link>
    )
  }
  if (asButton) {
    return (
      <button type="button" className={`w-full text-left active:opacity-80 ${base}`} style={style} onClick={onClick} title={title} {...press}>
        {children}
      </button>
    )
  }
  return (
    <div className={base} style={style} onClick={onClick} title={title}>
      {children}
    </div>
  )
}

/**
 * A band-shaped loading state.
 *
 * Reserves the height the real content will take, so arriving data does not
 * shove the rest of the page down. A skeleton that collapses is worse than no
 * skeleton at all.
 */
export function ZoneSkeleton({ label, accent = '#79808C', height, rows = 3 }: {
  label?: string
  accent?: string
  /** Explicit height in px when the content is a chart or a fixed visual. */
  height?: number
  /** Otherwise, how many text lines to stand in for. */
  rows?: number
}) {
  return (
    <Surface variant="band" accent={accent} label={label ? `${label} loading` : 'Loading'}>
      {label && (
        <div className="px-3 pt-2">
          <span className="block text-[10px] font-bold uppercase tracking-[0.16em] opacity-40" style={{ color: accent }}>
            {label}
          </span>
        </div>
      )}
      <div className="px-3 py-2 space-y-2" aria-hidden="true">
        {height != null ? (
          <div className="w-full rounded-xl bg-white/[0.04] animate-pulse" style={{ height }} />
        ) : (
          Array.from({ length: rows }, (_, i) => (
            <div key={i} className="h-4 rounded bg-white/[0.04] animate-pulse" style={{ width: `${88 - i * 16}%` }} />
          ))
        )}
      </div>
    </Surface>
  )
}

/**
 * Nothing to show, said usefully.
 *
 * An empty band still answers "what would be here?" and, where there is one,
 * offers the way to fill it — an empty state with no exit is a dead end.
 */
export function ZoneEmpty({ icon: Icon, title, hint, action }: {
  icon?: LucideIcon
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="px-3 py-6 flex flex-col items-center gap-1.5 text-center">
      {Icon && <Icon className="w-5 h-5 text-muted/60" aria-hidden="true" />}
      <span className="text-fluid-sm text-text/80">{title}</span>
      {hint && <span className="text-[11px] text-muted max-w-[42ch]">{hint}</span>}
      {action && <span className="mt-1.5">{action}</span>}
    </div>
  )
}

/**
 * One metric cell for a grid inside a band: label, large value, optional unit
 * and sub-line. Renders an em-dash for a missing value rather than collapsing,
 * so the grid keeps its shape when a reading is absent.
 */
export function Tile({ label, value, unit, sub, accent, icon: Icon, isLoading }: {
  label: string
  value: string | number | null | undefined
  unit?: string
  sub?: string
  /** Hex accent for the value — defaults to primary text. */
  accent?: string
  icon?: LucideIcon
  isLoading?: boolean
}) {
  const display = value === null || value === undefined || value === '' ? '—' : value
  return (
    <div className="rounded-xl bg-white/[0.03] px-3 py-2.5 flex flex-col gap-1 min-w-0">
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted leading-none">
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: accent }} aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </span>
      {isLoading ? (
        <div className="h-6 w-16 bg-white/[0.06] rounded animate-pulse mt-0.5" />
      ) : (
        <div className="flex items-baseline gap-1 min-w-0">
          <span className="helix-num text-xl font-bold leading-none truncate" style={{ color: accent ?? 'var(--color-text)' }}>
            {display}
          </span>
          {unit && display !== '—' && <span className="text-[11px] text-muted shrink-0">{unit}</span>}
        </div>
      )}
      {sub && <span className="text-[10px] text-muted leading-none truncate">{sub}</span>}
    </div>
  )
}

/**
 * A horizontally scrollable strip of inline value+label pairs.
 *
 * Replaces the 3×2 grid of bordered micro-tiles: six short numbers cost two
 * full rows of boxes, and adding a seventh opened a third. Scrolling sideways
 * keeps it at one row no matter how many arrive.
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
