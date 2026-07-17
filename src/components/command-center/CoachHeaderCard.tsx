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
            {draft.phase && <span className="text-info font-semibold">{draft.phase === 'CUT' ? 'Cut' : draft.phase}</span>}
          </p>
        </div>
        {/* Date chip — tap to back-date a late log; startedAt follows in lockstep */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={openPicker}
            className="flex items-center gap-2 px-3.5 min-h-[44px] rounded-xl text-fluid-sm font-semibold text-text
                       bg-primary/10 border border-primary/30 hover:bg-primary/15 hover:border-primary/50 transition-colors"
            aria-label={`Session date: ${dateLabel}. Tap to change`}
          >
            <CalendarDays className="w-4 h-4 text-primary" aria-hidden="true" />
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

      {/* Stats strip — live draft totals + reported context (colored badges,
          — when unknown). 3×2 in the narrow deck rail on every breakpoint. */}
      <div className="grid grid-cols-3 gap-2">
        <Badge label="Volume" value={`${totals.volumeKg.toLocaleString()}`} unit="kg" color="#16F5C3" />
        <Badge label="Sets" value={String(totals.sets)} color="#3EE0FF" />
        <Badge label="Duration" value={s?.duration_min != null ? `${s.duration_min}` : '—'} unit={s?.duration_min != null ? 'm' : undefined} color="#8B7CFF" />
        <Badge label="Avg HR" value={s?.avg_hr_bpm != null ? `${s.avg_hr_bpm}` : '—'} unit={s?.avg_hr_bpm != null ? 'bpm' : undefined} color="#FF5470" />
        <Badge label="Calories" value={s?.calories_kcal != null ? `${s.calories_kcal}` : '—'} unit={s?.calories_kcal != null ? 'kcal' : undefined} color="#FFB86B" />
        <Badge
          label="Δ vs prior"
          value={s?.volume_delta_pct_vs_prior != null ? `${s.volume_delta_pct_vs_prior > 0 ? '+' : ''}${s.volume_delta_pct_vs_prior}%` : '—'}
          color={s?.volume_delta_pct_vs_prior != null ? (s.volume_delta_pct_vs_prior >= 0 ? '#43F59B' : '#FF5470') : '#8B97B2'}
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

function Badge({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return (
    <div className="rounded-xl px-2 py-2 text-center" style={{ background: `${color}14`, border: `1px solid ${color}33` }}>
      <div className="helix-num font-bold text-fluid-base tabular-nums leading-tight" style={{ color }}>
        {value}{unit && <span className="text-[10px] font-normal ml-0.5 opacity-70">{unit}</span>}
      </div>
      <div className="text-[10px] text-muted mt-0.5">{label}</div>
    </div>
  )
}
