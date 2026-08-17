'use client'

import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * The app's back and step controls, as chevrons rather than boxes.
 *
 * ── WHY NOT `btn-glass` ──────────────────────────────────────────────────────
 * `btn-glass` is a filled, bordered, inset-shadowed surface — the treatment for
 * a thing you DO. Going back is not a thing you do; it is a direction, and iOS
 * has drawn it as a bare chevron since the first Settings app. Boxing it makes
 * the way out compete with the actions on the same bar for attention, and on a
 * pinned header three glass boxes in a row read as a toolbar of equals when
 * only one of them is a real action.
 *
 * The app already had it right in two places — the Pathfinder calendar and the
 * DatePicker step their months with bare chevrons — and wrong in eight others,
 * so this is less a redesign than an existing decision finally applied evenly.
 *
 * ── WHAT KEEPS IT TAPPABLE ───────────────────────────────────────────────────
 * Removing the background does not remove the target: the 44pt minimum comes
 * from padding, not from the fill, so the hit area is unchanged. Losing the
 * border loses the only affordance a glass box was carrying, which is why the
 * hover/active tint stays and why `aria-label` is required rather than optional.
 */

const BASE =
  'inline-flex items-center justify-center shrink-0 rounded-xl text-muted ' +
  'transition-colors hover:text-text hover:bg-white/[0.06] active:opacity-70 ' +
  'disabled:opacity-30 disabled:pointer-events-none'

/** Step controls: one axis, no label, minimum comfortable target. */
const STEP = `${BASE} min-h-[44px] min-w-[40px]`

export function NavChevron({
  direction, onClick, onPointerUp, href, disabled, label,
}: {
  direction: 'prev' | 'next'
  onClick?: () => void
  /** For `blurOnTap` — a nav control must not keep focus ring after a touch. */
  onPointerUp?: React.PointerEventHandler
  href?: string
  disabled?: boolean
  label: string
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight
  const icon = <Icon className="w-5 h-5" aria-hidden="true" />

  // A disabled link is not a link. `next/link` has no disabled state, so the
  // one case that needs it renders as an inert button instead of an <a> that
  // still navigates on Enter.
  if (href && !disabled) {
    return <Link href={href} onPointerUp={onPointerUp} aria-label={label} className={STEP}>{icon}</Link>
  }
  return (
    <button type="button" onClick={onClick} onPointerUp={onPointerUp} disabled={disabled}
      aria-label={label} className={STEP}>
      {icon}
    </button>
  )
}

/**
 * The way out. An arrow, optionally with a word after it.
 *
 * `ArrowLeft` rather than `ChevronLeft` when it stands alone: a chevron on its
 * own at the left of a bar is ambiguous with a "previous" step control, and the
 * two sit side by side in this app's headers. With a label the chevron reads
 * correctly, because the word disambiguates it.
 */
export function BackLink({
  onClick, onPointerUp, href, label = 'Back', showLabel = false,
}: {
  onClick?: () => void
  onPointerUp?: React.PointerEventHandler
  href?: string
  label?: string
  showLabel?: boolean
}) {
  const Icon = showLabel ? ChevronLeft : ArrowLeft
  const cls = `${BASE} min-h-[44px] ${showLabel ? 'gap-1 pl-1.5 pr-2.5 text-fluid-xs font-semibold' : 'min-w-[40px]'}`
  const body = (
    <>
      <Icon className="w-5 h-5" aria-hidden="true" />
      {showLabel && <span>{label}</span>}
    </>
  )

  if (href) {
    return (
      <Link href={href} onPointerUp={onPointerUp} aria-label={showLabel ? undefined : label} className={cls}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} onPointerUp={onPointerUp}
      aria-label={showLabel ? undefined : label} className={cls}>
      {body}
    </button>
  )
}
