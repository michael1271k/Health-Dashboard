'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { useSaveSubjective } from '@/lib/hooks/useDayVault'

/**
 * Hard-coded, selectable mood chips — freestyle text is impossible to track, so
 * the journal is now a fixed vocabulary persisted (comma-joined) into
 * daily_logs.journal_md. The Perceived-Effort dial stays.
 */
const MOOD_CHIPS: Array<{ emoji: string; label: string }> = [
  { emoji: '😴', label: 'Tired' },
  { emoji: '⚡', label: 'Energized' },
  { emoji: '🤕', label: 'Sore' },
  { emoji: '💪', label: 'Strong' },
  { emoji: '🧠', label: 'Focused' },
  { emoji: '😩', label: 'Drained' },
  { emoji: '😌', label: 'Calm' },
  { emoji: '🤒', label: 'Sick' },
]
const MOOD_LABELS = new Set(MOOD_CHIPS.map((c) => c.label))
const parseMoods = (j: string | null): string[] =>
  (j ?? '').split(',').map((s) => s.trim()).filter((l) => MOOD_LABELS.has(l))

export function SubjectiveBlock({ date, effort, journal }: {
  date: string
  effort: number | null
  mood?: number | null
  journal: string | null
}) {
  const [e, setE] = useState<number | null>(effort)
  const [selected, setSelected] = useState<string[]>(() => parseMoods(journal))
  const [saved, setSaved] = useState(false)
  const save = useSaveSubjective(date)

  // Sync when the fetched row arrives after first render.
  useEffect(() => { setE(effort); setSelected(parseMoods(journal)) }, [effort, journal])

  const initialMoods = useMemo(() => parseMoods(journal), [journal])
  const moodsChanged = selected.length !== initialMoods.length || selected.some((s) => !initialMoods.includes(s))
  const dirty = e !== effort || moodsChanged

  const toggle = (label: string) =>
    setSelected((cur) => (cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]))

  return (
    <section className="helix-card space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-heading font-semibold text-text">Journal</h2>
        <span className="text-[10px] uppercase tracking-widest text-muted">how you feel</span>
      </div>

      {/* Effort dial 1-10 */}
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-fluid-xs text-muted">Perceived effort</span>
          <span className="helix-num text-fluid-sm font-bold" style={{ color: '#22D3EE' }}>{e ?? '—'}<span className="text-muted font-normal">/10</span></span>
        </div>
        <input
          type="range" min={1} max={10} step={1} value={e ?? 5}
          onChange={(ev) => setE(Number(ev.target.value))}
          className="w-full accent-[#22D3EE] min-h-[28px]"
          aria-label="Perceived effort 1 to 10"
        />
      </div>

      {/* Mood chips (multi-select) */}
      <div>
        <span className="block text-fluid-xs text-muted mb-2">Mood</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {MOOD_CHIPS.map(({ emoji, label }) => {
            const active = selected.includes(label)
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggle(label)}
                aria-pressed={active}
                className={`min-h-[44px] rounded-xl border text-fluid-xs font-semibold flex items-center justify-center gap-1.5 transition-colors
                  ${active ? 'border-primary/60 bg-primary/10 text-text' : 'border-white/[0.08] bg-white/[0.02] text-muted hover:text-text'}`}
              >
                <span aria-hidden="true">{emoji}</span> {label}
              </button>
            )
          })}
        </div>
      </div>

      <button
        onClick={() => save.mutate(
          { effort_rating: e, mood: null, journal_md: selected.join(', ') || null },
          { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 1600) } },
        )}
        disabled={!dirty || save.isPending}
        className="btn-glass w-full justify-center min-h-[44px] disabled:opacity-40"
      >
        {save.isPending ? 'Saving…' : saved ? <><Check className="w-4 h-4" /> Saved</> : 'Save journal'}
      </button>
      {save.isError && <p className="text-danger text-fluid-xs" role="alert">{(save.error as Error).message}</p>}
    </section>
  )
}
