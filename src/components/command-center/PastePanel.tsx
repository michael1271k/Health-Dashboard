'use client'

import { useState } from 'react'
import { ClipboardPaste, Sparkles, Zap } from 'lucide-react'
import { CoachReportSchema, coachReportToDraft } from '@/lib/coach/reportSchema'
import { parseHevyWorkout } from '@/lib/hevy/parse'
import { hevyWorkoutToDraft } from '@/lib/hevy/toDraft'
import type { SessionDraft } from '@/lib/sessions/draft'

/**
 * The deck's input gate — replaces the old chat popup. One textarea, two
 * deterministic client-side parsers, zero LLM calls:
 *   text starting "{"  →  strict coach-JSON contract (zod)
 *   anything else      →  Hevy "Share / Copy workout" text parser
 */
export function PastePanel({ onDraft }: { onDraft: (d: SessionDraft) => void }) {
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText()
      if (t) { setText(t); setErrors([]) }
    } catch { /* permission denied — manual paste still works */ }
  }

  function build() {
    const t = text.trim()
    if (!t) return
    if (t.startsWith('{')) {
      let json: unknown
      try { json = JSON.parse(t) } catch {
        setErrors(['Not valid JSON — the paste looks truncated or malformed.'])
        return
      }
      const parsed = CoachReportSchema.safeParse(json)
      if (!parsed.success) {
        setErrors(parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'report'}: ${i.message}`))
        return
      }
      onDraft(coachReportToDraft(parsed.data))
      return
    }
    const hevy = parseHevyWorkout(t)
    if (!hevy) {
      setErrors(['Not a recognizable Hevy export or coach JSON. Paste the full "Share → Copy workout" text from Hevy.'])
      return
    }
    onDraft(hevyWorkoutToDraft(hevy))
  }

  return (
    <div className="max-w-xl mx-auto space-y-3">
      <div className="helix-card holo-sheen !p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-primary/15 text-primary">
            <Zap className="w-4.5 h-4.5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-heading font-bold text-fluid-base text-text leading-tight">Paste your session</h3>
            <p className="text-xs text-muted">Hevy export or coach JSON — parsed instantly, on-device.</p>
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); if (errors.length) setErrors([]) }}
          rows={9}
          dir="auto"
          placeholder={'upper b, Thursday 16 jul…\n\nChest Press (Machine)\nSet 1: 35 kg x 12\n…'}
          className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-3 py-2.5 text-sm text-text
                     placeholder:text-muted/40 outline-none focus:border-primary/40 resize-y min-h-[180px] font-mono text-[13px]"
        />

        {errors.length > 0 && (
          <ul className="space-y-1" aria-live="polite">
            {errors.map((e) => (
              <li key={e} className="text-danger text-xs leading-snug" dir="auto">{e}</li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <button type="button" onClick={pasteFromClipboard}
            className="btn-glass min-h-[48px] shrink-0 text-fluid-xs" aria-label="Paste from clipboard">
            <ClipboardPaste className="w-4 h-4" aria-hidden="true" /> Paste
          </button>
          <button type="button" onClick={build} disabled={!text.trim()}
            className="btn-primary flex-1 justify-center min-h-[48px] disabled:opacity-50">
            <Sparkles className="w-4 h-4" aria-hidden="true" /> Build the Deck
          </button>
        </div>
      </div>
      <p className="text-[11px] text-muted/70 text-center px-4">
        The parsed deck is fully editable — sliders, drag-to-reorder, notes — before anything is committed.
      </p>
    </div>
  )
}
