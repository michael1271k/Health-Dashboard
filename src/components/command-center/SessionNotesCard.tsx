'use client'

import { NotebookPen } from 'lucide-react'

/** Session-level notes — highly visible, edit any time (also post-paste). */
export function SessionNotesCard({ notes, onChange }: { notes: string; onChange: (v: string) => void }) {
  return (
    <div className="helix-card !p-4 space-y-2">
      <div className="flex items-center gap-1.5 text-muted">
        <NotebookPen className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="text-[11px] font-bold uppercase tracking-wide">Session Notes</span>
      </div>
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        dir="auto"
        placeholder="How did it feel? Anything to remember for next time…"
        className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-3 py-2.5 text-sm text-text
                   placeholder:text-muted/50 outline-none focus:border-primary/40 resize-y min-h-[76px]"
      />
    </div>
  )
}
