import type { PointerEvent } from 'react'

/**
 * iOS Safari sets (and matches `:focus-visible` on) a `<button>` when it's
 * tapped, and does NOT clear it when you navigate away and back — so a bare
 * `helix-card` button keeps the global 2px aurora-violet outline stuck on it.
 * Blurring on pointer-up clears the focus for touch/pen only (mouse & keyboard
 * focus rings stay intact for accessibility), and never cancels the click.
 */
export function blurOnTap(e: PointerEvent<HTMLElement>) {
  if (e.pointerType === 'touch' || e.pointerType === 'pen') e.currentTarget.blur()
}
