'use client'

import { Star, TrendingUp } from 'lucide-react'
import { useSessionIntel } from '@/lib/hooks/useSessionIntel'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'

const GOLD = '#C9A227', VIOLET = '#E2683A', TEAL = '#4FB477', ROSE = '#D5514E'

/**
 * Historical comparison for the session: volume Δ vs the previous SAME-TYPE
 * session, a gold PR spotlight, and a volume trail across the last few sessions
 * of this type. Complements the hero (stat tiles) and the exercise breakdown
 * (per-set detail); degrades to a "baseline set" note on the first of a type.
 */
export function ProgressionTrail({ sessionId }: { sessionId: string }) {
  const { data: intel, isLoading } = useSessionIntel(sessionId)
  const unit = useUnitSystem()

  if (isLoading) return <div className="helix-card h-40 animate-pulse" aria-hidden="true" />
  if (!intel) return null

  const maxVol = Math.max(...(intel.volumes.map((v) => v.volumeKg) ?? [1]), 1)

  return (
    <section className="helix-card space-y-3" style={{ borderColor: `${VIOLET}28` }}>
      <h2 className="font-heading text-fluid-base font-bold text-text flex items-center gap-2">
        <TrendingUp className="w-4 h-4" style={{ color: VIOLET }} aria-hidden="true" /> Progression
      </h2>

      {intel.volumeDeltaPct != null ? (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 flex items-center gap-2 text-fluid-xs flex-wrap">
          <span className="text-muted">vs last <span className="text-text font-medium">{intel.typeLabel}</span>:</span>
          <span className="helix-num font-bold" style={{ color: intel.volumeDeltaPct >= 0 ? TEAL : ROSE }}>
            volume {intel.volumeDeltaPct >= 0 ? '+' : ''}{intel.volumeDeltaPct}%
          </span>
          {intel.setsDelta != null && (
            <span className="helix-num text-muted">· sets {intel.setsDelta > 0 ? `+${intel.setsDelta}` : intel.setsDelta === 0 ? '=' : intel.setsDelta}</span>
          )}
        </div>
      ) : intel.isFirstOfType ? (
        <p className="text-fluid-xs text-muted flex items-center gap-1.5">
          <span aria-hidden="true">💪</span> First {intel.typeLabel || 'session'} of this era — baseline set. Progression appears next time.
        </p>
      ) : null}

      {!!intel.prs.length && (
        <div className="rounded-2xl border px-3 py-2.5 space-y-1" style={{ borderColor: `${GOLD}55`, background: `${GOLD}12`, boxShadow: `0 0 18px ${GOLD}22` }}>
          {intel.prs.map((pr) => (
            <div key={pr.name} className="flex items-center gap-2 text-fluid-sm">
              <Star className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD, filter: `drop-shadow(0 0 4px ${GOLD})` }} />
              <span className="text-text font-medium truncate">{pr.name}</span>
              <span className="helix-num ml-auto font-bold" style={{ color: GOLD }}>{displayWeight(pr.kg)}{unit} × {pr.reps}</span>
            </div>
          ))}
        </div>
      )}

      {!intel.isFirstOfType && intel.volumes.length >= 2 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">Volume vs previous {intel.volumes.length - 1} session{intel.volumes.length > 2 ? 's' : ''}</p>
          <div className="flex items-end gap-2 h-16">
            {intel.volumes.map((v, i) => {
              const isThis = i === intel.volumes.length - 1
              return (
                <div key={v.date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="helix-num text-[8px] text-muted">{Math.round((displayWeight(v.volumeKg) ?? 0) / 1000 * 10) / 10}k</span>
                  <div className="w-full rounded-t-md" style={{
                    height: `${Math.max(8, (v.volumeKg / maxVol) * 44)}px`,
                    background: isThis ? VIOLET : 'rgba(255,255,255,0.12)',
                    boxShadow: isThis ? `0 0 10px ${VIOLET}66` : undefined,
                  }} />
                  <span className="text-[8px] text-muted helix-num">{new Date(v.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
