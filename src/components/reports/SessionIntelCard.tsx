'use client'

import { useState } from 'react'
import { Star, ChevronDown, Sparkles } from 'lucide-react'
import type { GymReportRow } from '@/lib/hooks/useWeekly'
import { useSessionIntel } from '@/lib/hooks/useSessionIntel'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { MarkdownView } from './MarkdownView'

function Chip({ label, value, accent = '#8B5CF6' }: { label: string; value: string; accent?: string }) {
  return (
    <span className="inline-flex flex-col rounded-xl px-3 py-1.5 border" style={{ borderColor: `${accent}40`, background: `${accent}14` }}>
      <span className="text-[9px] uppercase tracking-wide text-muted leading-none">{label}</span>
      <span className="helix-num text-fluid-sm font-bold leading-tight" style={{ color: accent }}>{value}</span>
    </span>
  )
}

/** Strict progression glyphs: ⬆️ improved · ✅ matched/defended · ⬇️ regressed;
 *  🆕 = first time this exercise is logged (no baseline). */
function deltaGlyph(delta: -1 | 0 | 1 | null): string {
  if (delta == null) return '🆕'
  return delta === 1 ? '⬆️' : delta === -1 ? '⬇️' : '✅'
}

/**
 * Session Intel Card — the data-first report view: metadata chips, a gold PR
 * spotlight, a per-exercise Δ-vs-last table, a volume trail vs the last same-split
 * sessions, and the markdown prose demoted to a collapsible "Coach Notes".
 */
export function SessionIntelCard({ session }: { session: GymReportRow }) {
  const { data: intel, isLoading } = useSessionIntel(session.id)
  const [notesOpen, setNotesOpen] = useState(false)
  const unit = useUnitSystem()

  const maxVol = Math.max(...(intel?.volumes.map((v) => v.volumeKg) ?? [1]), 1)

  // The coach output is now a brief 2-sentence insight, surfaced up top. Older
  // sessions may still carry a long markdown report — those stay collapsible.
  const md = session.reportMd?.trim() ?? ''
  const insight = md && md.length <= 280 && !md.includes('#') ? md : null
  const longNotes = md && !insight ? md : null

  return (
    <div className="space-y-4">
      {/* Coach insight — 2 sentences, front and centre (numbers are charted below) */}
      {insight && (
        <div className="rounded-2xl border px-3.5 py-3 flex gap-2.5 items-start"
          style={{ borderColor: '#8B5CF633', background: '#8B5CF60d', boxShadow: '0 0 18px #8B5CF614' }}>
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#8B5CF6', filter: 'drop-shadow(0 0 4px #8B5CF6)' }} aria-hidden="true" />
          <p className="text-fluid-sm text-text/90 leading-relaxed">{insight}</p>
        </div>
      )}

      {/* Hero chips — volume + sets GUARANTEED (computed from sets when the row lacks them) */}
      <div className="flex flex-wrap gap-2">
        {session.durationMin != null && <Chip label="Duration" value={`${session.durationMin}m`} />}
        {session.avgBpm != null && <Chip label="Avg BPM" value={`${session.avgBpm}`} accent="#FF9F7A" />}
        <Chip label="Volume" value={`${Math.round(displayWeight(session.volumeKg ?? intel?.computedVolumeKg ?? 0) ?? 0).toLocaleString()} ${unit}`} accent="#22D3EE" />
        <Chip label="Sets" value={`${session.setCount ?? intel?.computedSets ?? '—'}`} accent="#EC4899" />
      </div>

      {/* Δ vs the previous session of this EXACT type (Upper A vs last Upper A) */}
      {intel?.volumeDeltaPct != null && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 flex items-center gap-2 text-fluid-xs">
          <span className="text-muted">vs last <span className="text-text font-medium">{intel.typeLabel}</span>:</span>
          <span className="helix-num font-bold" style={{ color: intel.volumeDeltaPct >= 0 ? '#34D399' : '#FB7185' }}>
            volume {intel.volumeDeltaPct >= 0 ? '+' : ''}{intel.volumeDeltaPct}%
          </span>
          {intel.setsDelta != null && (
            <span className="helix-num text-muted">· sets {intel.setsDelta > 0 ? `+${intel.setsDelta}` : intel.setsDelta === 0 ? '=' : intel.setsDelta}</span>
          )}
        </div>
      )}

      {/* PR spotlight */}
      {!!intel?.prs.length && (
        <div className="rounded-2xl border px-3 py-2.5 space-y-1" style={{ borderColor: '#F5C15A55', background: '#F5C15A12', boxShadow: '0 0 18px #F5C15A22' }}>
          {intel.prs.map((pr) => (
            <div key={pr.name} className="flex items-center gap-2 text-fluid-sm">
              <Star className="w-3.5 h-3.5 shrink-0" style={{ color: '#F5C15A', filter: 'drop-shadow(0 0 4px #F5C15A)' }} />
              <span className="text-text font-medium truncate">{pr.name}</span>
              <span className="helix-num ml-auto font-bold" style={{ color: '#F5C15A' }}>{displayWeight(pr.kg)}{unit} × {pr.reps}</span>
            </div>
          ))}
        </div>
      )}

      {/* First session of this type → nothing to compare against yet. */}
      {!isLoading && intel?.isFirstOfType && !!intel.deltas.length && (
        <p className="text-fluid-xs text-muted flex items-center gap-1.5">
          <span aria-hidden="true">💪</span> First {intel.typeLabel || 'session'} of this era — baseline set. Progression appears next time.
        </p>
      )}

      {/* Exercise Δ table — only once there's a baseline to compare against */}
      {isLoading ? (
        <div className="h-32 rounded-2xl bg-surface-2/60 animate-pulse" />
      ) : (!intel?.isFirstOfType && !!intel?.deltas.length) && (
        <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
          <table className="w-full text-fluid-xs">
            <thead>
              <tr className="border-b border-white/[0.08] text-muted">
                <th className="px-3 py-2 text-left font-semibold">Exercise</th>
                <th className="px-2 py-2 text-right font-semibold">Top set</th>
                <th className="px-2 py-2 text-right font-semibold">Prev</th>
                <th className="px-3 py-2 text-right font-semibold">Δ</th>
              </tr>
            </thead>
            <tbody>
              {intel.deltas.map((d) => (
                <tr key={d.name} className="border-b border-white/[0.06] last:border-0">
                  <td className="px-3 py-2.5 text-text/90 truncate max-w-[130px]">{d.name}{d.isPr && <Star className="inline w-3 h-3 ml-1 -mt-0.5" style={{ color: '#F5C15A' }} />}</td>
                  <td className="px-2 py-2.5 text-right helix-num text-text">{displayWeight(d.topKg)}{unit} × {d.topReps}</td>
                  <td className="px-2 py-2.5 text-right helix-num text-muted">{d.prevKg != null ? `${displayWeight(d.prevKg)}${unit}` : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-base leading-none" aria-label={d.delta == null ? 'new' : d.delta === 1 ? 'improved' : d.delta === -1 ? 'regressed' : 'matched'}>{deltaGlyph(d.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Volume trail vs last same-split sessions (hidden on the first of a type) */}
      {!intel?.isFirstOfType && (intel?.volumes.length ?? 0) >= 2 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">Volume vs previous {intel!.volumes.length - 1} session{intel!.volumes.length > 2 ? 's' : ''}</p>
          <div className="flex items-end gap-2 h-14">
            {intel!.volumes.map((v, i) => {
              const isThis = i === intel!.volumes.length - 1
              return (
                <div key={v.date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t-md" style={{
                    height: `${Math.max(8, (v.volumeKg / maxVol) * 44)}px`,
                    background: isThis ? '#8B5CF6' : 'rgba(255,255,255,0.12)',
                    boxShadow: isThis ? '0 0 10px #8B5CF666' : undefined,
                  }} />
                  <span className="text-[8px] text-muted helix-num">{new Date(v.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Legacy long-form report — demoted + collapsible (new sessions use the insight banner) */}
      {longNotes && (
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
          <button onClick={() => setNotesOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2.5 text-fluid-sm text-muted hover:text-text">
            Coach Notes
            <ChevronDown className={`w-4 h-4 transition-transform ${notesOpen ? 'rotate-180' : ''}`} />
          </button>
          {notesOpen && (
            <div className="px-3 pb-3 max-h-[45vh] overflow-y-auto no-scrollbar">
              <MarkdownView md={longNotes} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
