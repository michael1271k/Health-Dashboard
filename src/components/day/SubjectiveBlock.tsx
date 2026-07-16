'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useSaveSubjective } from '@/lib/hooks/useDayVault'

const MOODS = ['😖', '😕', '😐', '🙂', '🔥'] as const

/**
 * Subjective block — the journal half of the Daily Nexus master record.
 * Effort (RPE 1-10), mood (1-5) and a free-form note, saved onto the day's
 * daily_logs row. Replaces the Notion daily journal.
 */
export function SubjectiveBlock({ date, effort, mood, journal }: {
  date: string
  effort: number | null
  mood: number | null
  journal: string | null
}) {
  const [e, setE] = useState<number | null>(effort)
  const [m, setM] = useState<number | null>(mood)
  const [note, setNote] = useState(journal ?? '')
  const [saved, setSaved] = useState(false)
  const save = useSaveSubjective(date)

  // Sync when the fetched row arrives after first render.
  useEffect(() => { setE(effort); setM(mood); setNote(journal ?? '') }, [effort, mood, journal])

  const dirty = e !== effort || m !== mood || note !== (journal ?? '')

  return (
    <section className="helix-card space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-heading font-semibold text-text">Journal</h2>
        <span className="text-[10px] uppercase tracking-widest text-muted">subjective</span>
      </div>

      {/* Effort dial 1-10 */}
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-fluid-xs text-muted">Perceived effort</span>
          <span className="helix-num text-fluid-sm font-bold" style={{ color: '#3EE0FF' }}>{e ?? '—'}<span className="text-muted font-normal">/10</span></span>
        </div>
        <input
          type="range" min={1} max={10} step={1} value={e ?? 5}
          onChange={(ev) => setE(Number(ev.target.value))}
          className="w-full accent-[#3EE0FF] min-h-[28px]"
          aria-label="Perceived effort 1 to 10"
        />
      </div>

      {/* Mood 1-5 */}
      <div>
        <span className="block text-fluid-xs text-muted mb-1.5">Mood</span>
        <div className="flex gap-2">
          {MOODS.map((emoji, i) => {
            const v = i + 1
            const active = m === v
            return (
              <button key={v} onClick={() => setM(active ? null : v)}
                className={`flex-1 min-h-[44px] rounded-xl border text-lg transition-colors ${active ? 'border-primary/60 bg-primary/10' : 'border-white/[0.06] bg-white/[0.02]'}`}
                aria-pressed={active} aria-label={`Mood ${v} of 5`}>
                {emoji}
              </button>
            )
          })}
        </div>
      </div>

      {/* Note */}
      <textarea
        value={note} onChange={(ev) => setNote(ev.target.value)} rows={3}
        placeholder="How did today actually feel?"
        className="w-full rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5 text-fluid-sm text-text placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
        aria-label="Daily journal note"
      />

      <button
        onClick={() => save.mutate({ effort_rating: e, mood: m, journal_md: note || null }, { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 1600) } })}
        disabled={!dirty || save.isPending}
        className="btn-glass w-full justify-center min-h-[44px] disabled:opacity-40"
      >
        {save.isPending ? 'Saving…' : saved ? <><Check className="w-4 h-4" /> Saved</> : 'Save journal'}
      </button>
      {save.isError && <p className="text-danger text-fluid-xs" role="alert">{(save.error as Error).message}</p>}
    </section>
  )
}
