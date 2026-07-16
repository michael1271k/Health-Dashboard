'use client'

import { Flag, Sparkles } from 'lucide-react'
import type { SessionDraft } from '@/lib/sessions/draft'
import { draftTotals } from '@/lib/sessions/draft'

/**
 * Deck header: session identity + coach stats strip + the 2-sentence insight
 * and the gold next-session flag. Volume/set counts are LIVE — they re-derive
 * from the edited draft, not the coach's original numbers.
 */
export function CoachHeaderCard({ draft }: { draft: SessionDraft }) {
  const totals = draftTotals(draft)
  const s = draft.stats

  return (
    <div className="helix-card holo-sheen !p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading font-bold text-fluid-lg text-text leading-tight truncate">
            {draft.title ?? draft.splitDay.toUpperCase()}
          </h3>
          <p className="text-xs text-muted mt-0.5">
            {new Date(draft.date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            {draft.week != null && <> · Week {draft.week}</>}
            {draft.phase && <> · <span className="text-info font-semibold">{draft.phase === 'CUT' ? 'Helix 5.1 Cut' : draft.phase}</span></>}
          </p>
        </div>
        {draft.mode === 'review' && draft.clientSessionId && (
          <span className="shrink-0 text-[10px] text-muted font-mono mt-1">{draft.clientSessionId}</span>
        )}
      </div>

      {/* Stats strip — live draft totals + coach-reported context */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <Stat label="Volume" value={`${totals.volumeKg.toLocaleString()}kg`} />
        <Stat label="Sets" value={String(totals.sets)} />
        <Stat label="Duration" value={s?.duration_min ? `${s.duration_min}m` : '—'} />
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
