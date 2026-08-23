'use client'

import { Loader2, Trash2, X } from 'lucide-react'
import type { SessionDraft } from '@/lib/sessions/draft'

/**
 * Sticky bar for the two DESTRUCTIVE actions, and the one place a failed commit
 * says so.
 *
 * It used to carry the session-effort scale and commit directly. Both moved into
 * `FinishSheet`: the CR10 row sat above the CTA for the whole session, and
 * committing from here meant the three end-of-session numbers had to be asked
 * somewhere they could not be answered — the top of the deck.
 *
 * ── AND THEN FINISH LEFT TOO (2026-08-23) ────────────────────────────────────
 * "Finish Session" was the full-width primary here, at the BOTTOM of a deck that
 * is taller than the viewport by the third exercise. So the action that ends the
 * workout sat under the same thumb that ticks sets, and sat at the opposite end
 * of the document from the title, the date and the totals it is a decision
 * about. It lives in the header now — in `LiveSessionHero` and in
 * `LiveSessionBar`, so it is one tap away at any scroll position (see
 * `FinishButton`).
 *
 * What is left here is what SHOULD cost a scroll: the two ways to throw work
 * away. EDIT mode (draft.replaceSessionId set) exposes both, so they're never
 * confused:
 *   · "Cancel Edit" (X)  — exit edit mode, leave the committed workout untouched.
 *   · Trash              — ALWAYS deletes the actual committed session.
 * A brand-new draft keeps the single trash = discard-draft behaviour.
 *
 * The commit ERROR still surfaces here, because this bar is the only chrome that
 * can afford a full sentence — the header pair is two 44px targets.
 */
export function CommitBar({ draft, error, deleting, onDiscard, onCancelEdit, onDelete }: {
  draft: SessionDraft
  error: string | null
  deleting?: boolean
  onDiscard: () => void
  onCancelEdit?: () => void
  onDelete?: () => void
}) {
  const isEdit = !!draft.replaceSessionId

  return (
    <div className="sticky bottom-0 z-10 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] keyboard-safe space-y-2
                    bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/90 to-transparent">
      {error && <p className="text-danger text-fluid-sm" dir="auto">{error}</p>}
      <div className="flex items-center gap-2">
        {isEdit ? (
          <>
            {/* Cancel Edit — exits edit mode, keeps the committed workout. */}
            <button
              type="button"
              onClick={onCancelEdit ?? onDiscard}
              className="btn-ghost min-h-[52px] justify-center shrink-0 text-muted hover:text-text px-3"
              aria-label="Cancel edit — keep the saved workout"
            >
              <X className="w-4 h-4" aria-hidden="true" />
              <span className="text-fluid-sm hidden sm:inline">Cancel Edit</span>
            </button>
            {/* Trash — ALWAYS deletes the actual session. */}
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="btn-ghost min-h-[52px] min-w-[52px] justify-center shrink-0 text-muted hover:text-danger disabled:opacity-50"
              aria-label="Delete this workout permanently"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Trash2 className="w-4 h-4" aria-hidden="true" />}
            </button>
          </>
        ) : (
          /* Labelled, not a lone glyph. It used to sit beside a full-width
             primary that gave it context; on its own, an unlabelled bin at the
             foot of a live session is a question rather than a control. */
          <button
            type="button"
            onClick={onDiscard}
            className="btn-ghost min-h-[52px] justify-center shrink-0 text-muted hover:text-danger px-3"
            aria-label="Discard draft"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            <span className="text-fluid-sm">Discard draft</span>
          </button>
        )}
        {/* The muscle figure USED TO SIT HERE, and so did Finish Session. Both
            answer a question you have at the TOP of the deck — "where is this
            landing" and "am I done" — and both were reachable only by scrolling
            past every set you had not done yet. They live in the header now, in
            the hero and in the pinned bar. See `LiveSessionHero`. */}
      </div>
    </div>
  )
}
