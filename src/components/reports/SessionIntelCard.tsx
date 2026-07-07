'use client'

import { useState } from 'react'
import { Star, ChevronDown } from 'lucide-react'
import type { GymReportRow } from '@/lib/hooks/useWeekly'
import { useSessionIntel } from '@/lib/hooks/useSessionIntel'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { MarkdownView } from './MarkdownView'

function Chip({ label, value, accent = '#16F5C3' }: { label: string; value: string; accent?: string }) {
  return (
    <span className="inline-flex flex-col rounded-xl px-3 py-1.5 border" style={{ borderColor: `${accent}40`, background: `${accent}14` }}>
      <span className="text-[9px] uppercase tracking-wide text-muted-vital leading-none">{label}</span>
      <span className="helix-num text-fluid-sm font-bold leading-tight" style={{ color: accent }}>{value}</span>
    </span>
  )
}

const DELTA = { 1: ['▲', '#43F59B'], 0: ['═', '#5A6B85'], [-1]: ['▼', '#FF5470'] } as const

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

  return (
    <div className="space-y-4">
      {/* Hero chips */}
      <div className="flex flex-wrap gap-2">
        {session.durationMin != null && <Chip label="Duration" value={`${session.durationMin}m`} />}
        {session.avgBpm != null && <Chip label="Avg BPM" value={`${session.avgBpm}`} accent="#FF9F7A" />}
        {session.volumeKg != null && <Chip label="Volume" value={`${Math.round(displayWeight(session.volumeKg) ?? 0).toLocaleString()} ${unit}`} accent="#3EE0FF" />}
        {session.setCount != null && <Chip label="Sets" value={`${session.setCount}`} accent="#8B7CFF" />}
      </div>

      {/* PR spotlight */}
      {!!intel?.prs.length && (
        <div className="rounded-2xl border px-3 py-2.5 space-y-1" style={{ borderColor: '#E8C57A55', background: '#E8C57A12', boxShadow: '0 0 18px #E8C57A22' }}>
          {intel.prs.map((pr) => (
            <div key={pr.name} className="flex items-center gap-2 text-fluid-sm">
              <Star className="w-3.5 h-3.5 shrink-0" style={{ color: '#E8C57A', filter: 'drop-shadow(0 0 4px #E8C57A)' }} />
              <span className="text-text font-medium truncate">{pr.name}</span>
              <span className="helix-num ml-auto font-bold" style={{ color: '#E8C57A' }}>{displayWeight(pr.kg)}{unit} × {pr.reps}</span>
            </div>
          ))}
        </div>
      )}

      {/* Exercise Δ table */}
      {isLoading ? (
        <div className="h-32 rounded-2xl bg-surface-2/60 animate-pulse" />
      ) : !!intel?.deltas.length && (
        <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
          <table className="w-full text-fluid-xs">
            <thead>
              <tr className="border-b border-white/[0.08] text-muted-vital">
                <th className="px-3 py-2 text-left font-semibold">Exercise</th>
                <th className="px-2 py-2 text-right font-semibold">Top set</th>
                <th className="px-2 py-2 text-right font-semibold">Prev</th>
                <th className="px-3 py-2 text-right font-semibold">Δ</th>
              </tr>
            </thead>
            <tbody>
              {intel.deltas.map((d) => {
                const [sym, color] = DELTA[d.delta]
                return (
                  <tr key={d.name} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-3 py-1.5 text-text/90 truncate max-w-[130px]">{d.name}{d.isPr && <Star className="inline w-3 h-3 ml-1 -mt-0.5" style={{ color: '#E8C57A' }} />}</td>
                    <td className="px-2 py-1.5 text-right helix-num text-text">{displayWeight(d.topKg)}{unit} × {d.topReps}</td>
                    <td className="px-2 py-1.5 text-right helix-num text-muted-vital">{d.prevKg != null ? `${displayWeight(d.prevKg)}${unit}` : '—'}</td>
                    <td className="px-3 py-1.5 text-right font-bold" style={{ color }}>{sym}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Volume trail vs last same-split sessions */}
      {(intel?.volumes.length ?? 0) >= 2 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-vital mb-1.5">Volume vs previous {intel!.volumes.length - 1} session{intel!.volumes.length > 2 ? 's' : ''}</p>
          <div className="flex items-end gap-2 h-14">
            {intel!.volumes.map((v, i) => {
              const isThis = i === intel!.volumes.length - 1
              return (
                <div key={v.date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t-md" style={{
                    height: `${Math.max(8, (v.volumeKg / maxVol) * 44)}px`,
                    background: isThis ? '#16F5C3' : 'rgba(255,255,255,0.12)',
                    boxShadow: isThis ? '0 0 10px #16F5C366' : undefined,
                  }} />
                  <span className="text-[8px] text-muted-vital helix-num">{new Date(v.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Coach Notes — the old markdown, demoted + collapsible */}
      {session.reportMd && (
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
          <button onClick={() => setNotesOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2.5 text-fluid-sm text-muted-vital hover:text-text">
            Coach Notes
            <ChevronDown className={`w-4 h-4 transition-transform ${notesOpen ? 'rotate-180' : ''}`} />
          </button>
          {notesOpen && (
            <div className="px-3 pb-3 max-h-[45vh] overflow-y-auto no-scrollbar">
              <MarkdownView md={session.reportMd} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
