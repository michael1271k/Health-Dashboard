'use client'

import { Check, Loader2, Trash2, X } from 'lucide-react'
import { draftTotals, type SessionDraft } from '@/lib/sessions/draft'
import { fmtVolume } from '@/lib/utils/units'

/**
 * Sticky commit bar: live totals, discard/cancel, delete, and the commit CTA.
 *
 * EDIT mode (draft.replaceSessionId set) exposes TWO distinct destructive
 * actions so they're never confused:
 *   · "Cancel Edit" (X)  — exit edit mode, leave the committed workout untouched.
 *   · Trash              — ALWAYS deletes the actual committed session.
 * A brand-new draft keeps the single trash = discard-draft behaviour.
 */
export function CommitBar({ draft, busy, error, deleting, onCommit, onDiscard, onCancelEdit, onDelete }: {
  draft: SessionDraft
  busy: boolean
  error: string | null
  deleting?: boolean
  onCommit: () => void
  onDiscard: () => void
  onCancelEdit?: () => void
  onDelete?: () => void
}) {
  const totals = draftTotals(draft)
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
          <button
            type="button"
            onClick={onDiscard}
            className="btn-ghost min-h-[52px] min-w-[52px] justify-center shrink-0 text-muted hover:text-danger"
            aria-label="Discard draft"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={onCommit}
          disabled={busy || totals.sets === 0}
          className="btn-primary flex-1 justify-center disabled:opacity-50 min-h-[52px] text-fluid-base"
        >
          {busy
            ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {isEdit ? 'Saving…' : 'Committing…'}</>
            : <><Check className="w-4 h-4" aria-hidden="true" />
                {isEdit ? 'Save Edits' : 'Finish Session'}
                <span className="text-xs opacity-70 ml-1">{totals.sets} sets · {fmtVolume(totals.volumeKg)}kg</span></>}
        </button>
      </div>
    </div>
  )
}
