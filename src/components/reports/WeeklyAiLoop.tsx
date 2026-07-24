'use client'

import { useState } from 'react'
import { ClipboardCopy, Check, Sparkles, Loader2 } from 'lucide-react'
import { useWeeklyExport, useWeeklyAiSummaries, useSaveWeeklyAiSummary } from '@/lib/hooks/useWeeklyLoop'
import { weekStartOf, isoAddDays } from '@/lib/utils/week'
import { logicalTodayISO } from '@/lib/utils/day'
import { EMBER, GOLD, EMERALD, SAPPHIRE, HAIRLINE } from '@/lib/theme/palette'

/** Render the AI summary text: `## h2`, `- bullets`, `**bold**`, plain paras. */
function SummaryBody({ text }: { text: string }) {
  const blocks = text.split('\n').filter((l) => l.trim().length > 0)
  return (
    <div className="space-y-1.5">
      {blocks.map((raw, i) => {
        const line = raw.trim()
        const bold = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((part, j) =>
          j % 2 === 1 ? <strong key={j} className="text-text font-semibold">{part}</strong> : <span key={j}>{part}</span>)
        if (/^#{1,3}\s/.test(line)) {
          return (
            <h4 key={i} className="font-heading font-bold text-fluid-sm text-text pt-1.5 first:pt-0">
              {line.replace(/^#{1,3}\s*/, '')}
            </h4>
          )
        }
        if (/^[-*•]\s/.test(line)) {
          return (
            <p key={i} className="text-fluid-xs text-muted leading-snug flex gap-1.5">
              <span className="shrink-0" style={{ color: EMBER }}>▸</span>
              <span>{bold(line.replace(/^[-*•]\s*/, ''))}</span>
            </p>
          )
        }
        return <p key={i} className="text-fluid-xs text-muted leading-snug">{bold(line)}</p>
      })}
    </div>
  )
}

/**
 * The weekly AI loop.
 *
 * 1. "Export Week" copies a dense, structured payload of the week (daily
 *    weights/macros/steps/sleep, every session + exercise, and direct-set volume
 *    vs target) to the clipboard, pre-framed as a coaching prompt.
 * 2. Paste the AI's reply back in and it's stored against that week and rendered
 *    as a proper insight card. Re-pasting the same week replaces it (upsert).
 */
export function WeeklyAiLoop() {
  const today = logicalTodayISO()
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today))
  const { data: payload, isLoading } = useWeeklyExport(weekStart)
  const { data: summaries } = useWeeklyAiSummaries()
  const save = useSaveWeeklyAiSummary()
  const [copied, setCopied] = useState(false)
  const [draft, setDraft] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)

  const stored = summaries?.find((s) => s.weekStart === weekStart)

  const copy = async () => {
    if (!payload) return
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      // Clipboard blocked (insecure context / permissions) — fall back to a
      // selectable textarea so the payload is never unreachable.
      setDraft(payload)
      setPasteOpen(true)
    }
  }

  return (
    <section className="helix-card space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 shrink-0" style={{ color: GOLD }} aria-hidden="true" />
        <h2 className="font-heading font-bold text-fluid-base text-text">Weekly AI Review</h2>
        <span className="ml-auto text-[10px] text-muted helix-num">
          {weekStart} → {isoAddDays(weekStart, 6)}
        </span>
      </div>

      {/* Week stepper */}
      <div className="flex items-center gap-1.5">
        <button onClick={() => setWeekStart((w) => isoAddDays(w, -7))}
          className="btn-glass !px-2 !py-1 text-[11px]">← Prev</button>
        <button onClick={() => setWeekStart(weekStartOf(today))}
          className="btn-glass !px-2 !py-1 text-[11px]">This week</button>
        <button onClick={() => setWeekStart((w) => (isoAddDays(w, 7) <= weekStartOf(today) ? isoAddDays(w, 7) : w))}
          disabled={isoAddDays(weekStart, 7) > weekStartOf(today)}
          className="btn-glass !px-2 !py-1 text-[11px] disabled:opacity-40">Next →</button>
      </div>

      {/* 1 · Export */}
      <button
        onClick={copy}
        disabled={isLoading || !payload}
        className="btn-primary w-full justify-center min-h-[46px] disabled:opacity-50"
        style={copied ? { background: EMERALD } : undefined}
      >
        {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Building week…</>
          : copied ? <><Check className="w-4 h-4" /> Copied — paste into your AI</>
          : <><ClipboardCopy className="w-4 h-4" /> Export Week</>}
      </button>

      {/* 2 · Paste the reply back */}
      {!pasteOpen ? (
        <button onClick={() => { setDraft(stored?.content ?? ''); setPasteOpen(true) }}
          className="btn-glass w-full justify-center min-h-[42px] text-fluid-xs">
          {stored ? 'Edit this week’s summary' : 'Paste AI summary'}
        </button>
      ) : (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            placeholder="Paste the AI's Weekly Summary here…"
            className="w-full rounded-xl border px-3 py-2.5 text-fluid-xs text-text bg-surface-2 outline-none focus:ring-2 focus:ring-primary/60"
            style={{ borderColor: HAIRLINE }}
          />
          <div className="flex gap-2">
            <button onClick={() => setPasteOpen(false)} className="btn-glass flex-1 justify-center min-h-[42px] text-fluid-xs">Cancel</button>
            <button
              onClick={() => save.mutate({ weekStart, content: draft }, { onSuccess: () => setPasteOpen(false) })}
              disabled={!draft.trim() || save.isPending}
              className="btn-primary flex-1 justify-center min-h-[42px] text-fluid-xs disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save summary'}
            </button>
          </div>
          {save.isError && <p className="text-danger text-[11px]">{save.error instanceof Error ? save.error.message : 'Save failed'}</p>}
        </div>
      )}

      {/* 3 · The stored summary, rendered */}
      {stored && !pasteOpen && (
        <div className="rounded-xl p-3" style={{ background: `${SAPPHIRE}0d`, border: `1px solid ${SAPPHIRE}26` }}>
          <SummaryBody text={stored.content} />
        </div>
      )}
      {!stored && !pasteOpen && (
        <p className="text-[11px] text-muted leading-snug">
          Export the week, run it through your AI, then paste the summary back here — it&apos;s stored
          against this week and shown as an insight card.
        </p>
      )}
    </section>
  )
}
