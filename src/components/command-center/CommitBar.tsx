'use client'

import { Check, Loader2, Trash2 } from 'lucide-react'
import { draftTotals, type SessionDraft } from '@/lib/sessions/draft'

/**
 * Sticky commit bar: live totals, discard, and the commit CTA. Live mode
 * commits only checked-off sets and says so.
 */
export function CommitBar({ draft, busy, error, onCommit, onDiscard }: {
  draft: SessionDraft
  busy: boolean
  error: string | null
  onCommit: () => void
  onDiscard: () => void
}) {
  const live = draft.mode === 'live'
  const totals = draftTotals(draft, live)
  const committable = live ? totals.doneSets : totals.sets

  return (
    <div className="sticky bottom-0 z-10 pt-2 keyboard-safe space-y-2">
      {error && <p className="text-danger text-fluid-sm" dir="auto">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDiscard}
          className="btn-ghost min-h-[48px] min-w-[48px] justify-center shrink-0 text-muted hover:text-danger"
          aria-label="Discard draft"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onCommit}
          disabled={busy || committable === 0}
          className="btn-primary flex-1 justify-center disabled:opacity-50 min-h-[48px]"
        >
          {busy
            ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Committing…</>
            : <><Check className="w-4 h-4" aria-hidden="true" />
                {live ? `Commit ${totals.doneSets}/${totals.sets} sets` : 'Commit Session'}
                <span className="text-xs opacity-70 ml-1">({totals.volumeKg.toLocaleString()}kg)</span></>}
        </button>
      </div>
    </div>
  )
}
