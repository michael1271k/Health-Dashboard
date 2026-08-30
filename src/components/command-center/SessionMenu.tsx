'use client'

import { useState } from 'react'
import { MoreHorizontal, Trash2, X } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { SheetMenuRow } from './SheetMenuRow'
import { tapLight } from '@/lib/native/haptics'
import { OXIDE, STEEL } from '@/lib/theme/palette'

/**
 * Everything you do to a SESSION that is not logging it.
 *
 * ── WHY IT REPLACED THE STICKY BAR ───────────────────────────────────────────
 * These two actions lived in `CommitBar`, a sticky strip pinned to the bottom of
 * the deck. Once Finish moved to the header that bar had exactly one control
 * left in it, and it was still paying full rent: 52px of button, its own
 * `pt-2`, a `pb-[max(0.75rem,safe-area)]` AND a `keyboard-safe` padding that
 * adds a second one, and a fade gradient tall enough to sell the illusion that
 * something was pinned there. On a phone that is most of the dead space under
 * the last exercise — a permanent bottom-of-screen band for a button pressed
 * once a month.
 *
 * ── AND WHY IT IS NOT JUST A BUTTON IN THE HEADER ────────────────────────────
 * Because of what these actions ARE. Discarding a draft throws away a workout
 * you are standing in the middle of, and edit mode's trash deletes a committed
 * session permanently. `apple-design` §16.2 — agency backed by forgiveness —
 * wants those one level deeper than the controls you use every set, not
 * adjacent to Finish where a thumb aiming for one can find the other.
 *
 * A sheet, not a dropdown: it is the app's existing overflow idiom
 * (`SetActionSheet` does the same for a set), it puts 52px targets under the
 * thumb rather than 32px ones at the top of the screen, and it is dismissible
 * by swipe, which a menu is not.
 */
export function SessionMenu({ isEdit, deleting, tools, onDiscard, onCancelEdit, onDelete }: {
  /** `draft.replaceSessionId` is set — this deck is rewriting a committed session. */
  isEdit: boolean
  deleting?: boolean
  /**
   * Rows for the things the header no longer has room for — the rest timer and
   * the muscle figure, each rendering its own `SheetMenuRow` and its own sheet.
   *
   * A slot rather than props, because those two components own their open state
   * and their sheet bodies; the menu's job is to be the place they are reached
   * from, not to know what they are. They render ABOVE the divider: neither
   * destroys anything, and mixing them in with Discard would undo the whole
   * reason these actions were moved a level deeper.
   */
  tools?: React.ReactNode
  onDiscard: () => void
  onCancelEdit?: () => void
  onDelete?: () => void
}) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <>
      <button
        type="button"
        onPointerDown={() => { void tapLight() }}
        onClick={() => setOpen(true)}
        aria-label="Session options"
        aria-haspopup="dialog"
        title="Session options"
        className="shrink-0 w-11 min-h-[44px] rounded-xl flex items-center justify-center
                   active:scale-95 transition-transform"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <MoreHorizontal className="w-4 h-4" style={{ color: STEEL }} aria-hidden="true" />
      </button>

      <Sheet open={open} onClose={close} title={isEdit ? 'Edit options' : 'Session options'} accent={OXIDE}>
        <div className="space-y-2 pb-2">
          {tools}
          {tools && <div className="h-px bg-white/[0.07] my-1" aria-hidden="true" />}
          {isEdit ? (
            <>
              {/* Exits edit mode and leaves the committed workout untouched. The
                  two are deliberately never one control: one keeps the workout,
                  the other destroys it. */}
              <SheetMenuRow
                icon={<X className="w-4 h-4" aria-hidden="true" />}
                label="Cancel edit"
                hint="Leave the saved workout exactly as it is"
                onClick={() => { close(); (onCancelEdit ?? onDiscard)() }}
              />
              <SheetMenuRow
                danger
                busy={deleting}
                icon={<Trash2 className="w-4 h-4" aria-hidden="true" />}
                label="Delete workout"
                hint="Removes the committed session and its sets. This cannot be undone."
                onClick={() => { close(); onDelete?.() }}
              />
            </>
          ) : (
            <SheetMenuRow
              danger
              icon={<Trash2 className="w-4 h-4" aria-hidden="true" />}
              label="Discard draft"
              hint="Throws away everything logged in this session so far"
              onClick={() => { close(); onDiscard() }}
            />
          )}
        </div>
      </Sheet>
    </>
  )
}
