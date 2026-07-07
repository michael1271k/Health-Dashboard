'use client'

import { memo } from 'react'
import { Dumbbell, FileText } from 'lucide-react'
import type { ReportRow, GymReportRow } from '@/lib/hooks/useWeekly'
import { enumerateWeeks, type ProgramWeek } from '@/lib/phases'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'

const KIND_COLOR: Record<string, string> = { cut: '#3EE0FF', bulk: '#43F59B', maintenance: '#8B7CFF', peak: '#16F5C3' }

/**
 * The Helix Timeline Spine — Journey's navigation. A vertical double-strand
 * spine; every program week is a node with an alternating glass card (label,
 * era badge, sessions · volume · files). HELIX weeks glow bioluminescent;
 * PPL Legacy renders muted below an era-boundary divider. Newest at top.
 */
export const JourneyTimeline = memo(function JourneyTimeline({ reports, gymReports, era, onOpenWeek }: {
  reports: ReportRow[]
  gymReports: GymReportRow[]
  era: 'all' | 'ppl' | 'axis'
  onOpenWeek: (w: ProgramWeek) => void
}) {
  const unit = useUnitSystem()
  const weeks = enumerateWeeks(['cut', 'bulk', 'maintenance', 'peak'])
    .filter((w) => era === 'all' || (era === 'axis' ? w.era === 'helix' : w.era === 'ppl'))

  const statsFor = (w: ProgramWeek) => {
    const sessions = gymReports.filter((g) => g.date >= w.weekStart && g.date <= w.weekEnd)
    const volume = sessions.reduce((s, g) => s + (g.volumeKg ?? 0), 0)
    const files = reports.filter((r) => r.period_start >= w.weekStart && r.period_start <= w.weekEnd).length
    return { sessions: sessions.length, volume, files }
  }

  let boundaryDrawn = false

  return (
    <div className="relative">
      {/* The double-strand spine */}
      <svg className="absolute left-[18px] top-0 bottom-0 h-full w-4" preserveAspectRatio="none" viewBox="0 0 16 100" aria-hidden="true">
        <path d="M5 0 C11 12, -1 22, 5 34 C11 46, -1 56, 5 68 C11 80, -1 90, 5 100" fill="none" stroke="#16F5C3" strokeOpacity="0.35" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <path d="M11 0 C5 12, 17 22, 11 34 C5 46, 17 56, 11 68 C5 80, 17 90, 11 100" fill="none" stroke="#3EE0FF" strokeOpacity="0.35" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="space-y-3 pl-11">
        {weeks.map((w) => {
          const helix = w.era === 'helix'
          const showBoundary = !helix && !boundaryDrawn && era === 'all'
          if (showBoundary) boundaryDrawn = true
          const color = helix ? (KIND_COLOR[w.kind] ?? '#16F5C3') : '#8B97B2'
          const s = statsFor(w)
          const empty = s.sessions === 0 && s.files === 0
          return (
            <div key={w.weekStart}>
              {showBoundary && (
                <div className="flex items-center gap-2 py-2 -ml-11 pl-11">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-vital">era boundary · 19 Jul 2026</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
              )}
              <div className="relative">
                {/* Node on the strand */}
                <span
                  className="absolute -left-[30px] top-4 h-3.5 w-3.5 rounded-full border-2"
                  style={{ borderColor: color, background: `${color}30`, boxShadow: empty ? undefined : `0 0 10px ${color}66` }}
                  aria-hidden="true"
                />
                <button
                  onClick={() => onOpenWeek(w)}
                  disabled={empty}
                  className={`helix-card w-full text-left px-3.5 py-3 ${empty ? 'opacity-45 cursor-default' : 'active:opacity-80'}`}
                  style={{ borderColor: `${color}30` }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-heading font-semibold text-fluid-sm text-text truncate">
                      {w.label === `Week ${w.n}` ? `${w.eraTag} · Week ${w.n}` : w.label}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 rounded shrink-0"
                      style={{ color, background: `${color}1a`, border: `1px solid ${color}40` }}>
                      {helix ? 'HELIX' : 'PPL'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-fluid-xs text-muted-vital">
                    <span className="helix-num">{new Date(w.weekStart + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                    <span className="flex items-center gap-1"><Dumbbell className="w-3 h-3" />{s.sessions}</span>
                    {s.volume > 0 && <span className="helix-num">{((displayWeight(s.volume) ?? 0) / 1000).toFixed(1)}{unit === 'lb' ? 'k' : 't'}</span>}
                    <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{s.files}</span>
                    {empty && <span className="italic">empty</span>}
                  </div>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})
