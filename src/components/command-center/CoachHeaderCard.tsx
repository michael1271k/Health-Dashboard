'use client'

import { useRef } from 'react'
import { CalendarDays, Flag, Sparkles } from 'lucide-react'
import type { SessionDraft } from '@/lib/sessions/draft'
import { draftTotals } from '@/lib/sessions/draft'
import { logicalTodayISO } from '@/lib/utils/day'

/**
 * Deck header: session identity, the date picker (late logging), the stats
 * strip, the coach insight and the gold next-session flag. Volume/set counts
 * are LIVE — they re-derive from the edited draft, not the source numbers.
 */
export function CoachHeaderCard({ draft, onSetDate }: {
  draft: SessionDraft
  onSetDate: (dateISO: string) => void
}) {
  const totals = draftTotals(draft)
  const s = draft.stats
  const dateInputRef = useRef<HTMLInputElement>(null)

  // Native <input type="date"> behind a styled chip: zero deps, native iOS
  // wheel. showPicker() where supported; focus() opens it on older Safari.
  const openPicker = () => {
    const el = dateInputRef.current
    if (!el) return
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); return } catch { /* fall through */ }
    }
    el.focus()
    el.click()
  }

  const dateLabel = new Date(draft.date + 'T12:00:00Z')
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="helix-card holo-sheen !p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading font-bold text-fluid-xl text-text leading-tight truncate">
            {draft.title ?? draft.splitDay.toUpperCase()}
          </h3>
          <p className="text-xs text-muted mt-0.5">
            {draft.week != null && <>Week {draft.week} · </>}
            {draft.phase && <span className="text-info font-semibold">{draft.phase === 'CUT' ? 'Helix Cut' : draft.phase}</span>}
          </p>
        </div>
        {/* Date chip — tap to back-date a late log; startedAt follows in lockstep */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={openPicker}
            className="glass-card flex items-center gap-1.5 px-2.5 min-h-[40px] text-fluid-xs font-semibold text-text
                       hover:border-primary/40 transition-colors"
            aria-label={`Session date: ${dateLabel}. Tap to change`}
          >
            <CalendarDays className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
            {dateLabel}
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={draft.date}
            max={logicalTodayISO()}
            onChange={(e) => { if (e.target.value) onSetDate(e.target.value) }}
            className="absolute inset-0 opacity-0 pointer-events-none"
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Stats strip — live draft totals + reported context (— when unknown) */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 text-center">
        <Stat label="Volume" value={`${totals.volumeKg.toLocaleString()}kg`} />
        <Stat label="Sets" value={String(totals.sets)} />
        <Stat label="Duration" value={s?.duration_min != null ? `${s.duration_min}m` : '—'} />
        <Stat label="Avg HR" value={s?.avg_hr_bpm != null ? `${s.avg_hr_bpm}` : '—'} />
        <Stat label="Calories" value={s?.calories_kcal != null ? `${s.calories_kcal}` : '—'} />
        <Stat
          label="Δ vs prior"
          value={s?.volume_delta_pct_vs_prior != null ? `${s.volume_delta_pct_vs_prior > 0 ? '+' : ''}${s.volume_delta_pct_vs_prior}%` : '—'}
          color={s?.volume_delta_pct_vs_prior != null ? (s.volume_delta_pct_vs_prior >= 0 ? '#43F59B' : '#FF5470') : undefined}
        />
      </div>

      {draft.coachInsight && (
        <div className="rounded-xl px-3 py-2.5 flex gap-2 items-start"
          style={{ background: 'rgba(22,245,195,0.06)', border: '1px solid rgba(22,245,195,0.22)' }}>
          <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" aria-hidden="true" />
          <p className="text-sm text-text leading-relaxed" dir="auto">{draft.coachInsight}</p>
        </div>
      )}

      {draft.nextSessionFlag && (
        <div className="rounded-xl px-3 py-2.5 flex gap-2 items-start"
          style={{ background: 'rgba(232,197,122,0.07)', border: '1px solid rgba(232,197,122,0.35)' }}>
          <Flag className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: '#E8C57A' }} aria-hidden="true" />
          <p className="text-sm leading-relaxed" style={{ color: '#E8C57A' }} dir="auto">{draft.nextSessionFlag}</p>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="glass-card py-2">
      <div className="helix-num font-bold text-fluid-sm tabular-nums" style={{ color: color ?? 'var(--color-text)' }}>{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  )
}
