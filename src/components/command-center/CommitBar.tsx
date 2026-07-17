'use client'

import { Check, Loader2, Trash2 } from 'lucide-react'
import { draftTotals, type SessionDraft } from '@/lib/sessions/draft'

/**
 * Sticky commit bar: live totals, discard, and the commit CTA. On /session the
 * BottomNav is hidden, so this bar owns the bottom safe area itself.
 */
export function CommitBar({ draft, busy, error, onCommit, onDiscard }: {
  draft: SessionDraft
  busy: boolean
  error: string | null
  onCommit: () => void
  onDiscard: () => void
}) {
  const totals = draftTotals(draft)

  return (
    <div className="sticky bottom-0 z-10 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] keyboard-safe space-y-2
                    bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/90 to-transparent">
      {error && <p className="text-danger text-fluid-sm" dir="auto">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDiscard}
          className="btn-ghost min-h-[52px] min-w-[52px] justify-center shrink-0 text-muted hover:text-danger"
          aria-label="Discard draft"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onCommit}
          disabled={busy || totals.sets === 0}
          className="btn-primary flex-1 justify-center disabled:opacity-50 min-h-[52px] text-fluid-base"
        >
          {busy
            ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Committing…</>
            : <><Check className="w-4 h-4" aria-hidden="true" />
                Finish Session
                <span className="text-xs opacity-70 ml-1">{totals.sets} sets · {totals.volumeKg.toLocaleString()}kg</span></>}
        </button>
      </div>
    </div>
  )
}
