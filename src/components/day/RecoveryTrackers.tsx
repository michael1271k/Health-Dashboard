'use client'

import { useState } from 'react'
import { Activity, Dumbbell, ChevronDown } from 'lucide-react'
import { useDoms, useLogDoms, useDomsSources, DOMS_MUSCLES, DOMS_LEVELS, type DomsMuscle } from '@/lib/hooks/useRecovery'
import { EMERALD, GOLD, EMBER, OXIDE, MUTED, HAIRLINE } from '@/lib/theme/palette'

/**
 * One severity ramp for the whole app. Exported because the collapsed panel,
 * the editor and any future body overlay must agree — it was previously
 * declared here, used only by the editor, and the summary line rendered
 * everything in the same flat grey.
 */
export const SEVERITY_COLOR = [MUTED, EMERALD, GOLD, OXIDE]
export const SEVERITY_WORD = ['none', 'mild', 'moderate', 'severe']
const OFFSET_LABEL = ['same day', '+1 day', '+2 days']

/** How many bar segments a severity fills, out of `SEGMENTS`. */
const SEGMENTS = 12

export interface SorenessSummary {
  /** Muscles rated above zero, worst first, then in display order. */
  sore: Array<{ muscle: DomsMuscle; severity: number }>
  /** Everything else — rendered as one muted line, not eight empty rows. */
  clear: DomsMuscle[]
  /** The worst severity present, 0 when nothing is logged. */
  peak: number
}

/**
 * Split today's ratings into the sore rows and the all-clear remainder.
 *
 * Pure and exported so the ordering is testable: the panel's whole claim is
 * that the worst thing is at the top.
 */
export function sorenessSummary(doms: Partial<Record<DomsMuscle, number>> | undefined): SorenessSummary {
  const sore: SorenessSummary['sore'] = []
  const clear: DomsMuscle[] = []
  for (const muscle of DOMS_MUSCLES) {
    const severity = doms?.[muscle] ?? 0
    if (severity > 0) sore.push({ muscle, severity })
    else clear.push(muscle)
  }
  // Stable within a severity: DOMS_MUSCLES order breaks ties, so the list does
  // not reshuffle when two muscles are rated the same.
  sore.sort((a, b) => b.severity - a.severity
    || DOMS_MUSCLES.indexOf(a.muscle) - DOMS_MUSCLES.indexOf(b.muscle))
  return { sore, clear, peak: sore[0]?.severity ?? 0 }
}

/** A 12-segment intensity bar, filled `severity/3` and tinted by severity. */
function SeverityBar({ severity }: { severity: number }) {
  const filled = Math.round((severity / 3) * SEGMENTS)
  const c = SEVERITY_COLOR[severity] ?? MUTED
  return (
    <span className="flex gap-px flex-1 min-w-[64px]" aria-hidden="true">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span key={i} className="h-2 flex-1 rounded-[1px]"
          style={{ background: i < filled ? c : 'rgba(255,255,255,0.06)' }} />
      ))}
    </span>
  )
}

/**
 * DOMS tracker — rate delayed-onset soreness in the 72h AFTER a session, which is
 * when it actually shows up and fades. Whole-body (Chest · Back · Arms · Shoulders
 * · Glutes · Quads · Hamstrings · Calves); each muscle's rating is auto-attributed
 * to the most recent session that TRAINED it, so "sore chest" ties to the last
 * Upper day and "sore glutes" to the last leg day, filtered by muscle tags.
 *
 * The collapsed state used to be a single truncated grey line —
 * `Quads (severe) · Chest (mild)` at 10px, capped at three muscles, with the
 * severity ramp defined two lines above and never applied. It is now a real
 * panel: one bar per sore muscle, worst first, and the untouched muscles folded
 * into one muted line so eight muscles cost three rows instead of eight.
 */
export function DomsTracker({ date }: { date: string }) {
  const { data: doms } = useDoms(date)
  const { data: sources } = useDomsSources(date)
  const log = useLogDoms(date)
  // Collapsed by default — the EDITOR is tall and only needed after training.
  const [expanded, setExpanded] = useState(false)

  const { sore, clear, peak } = sorenessSummary(doms)

  return (
    <section className="helix-card space-y-2.5">
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}
        className="w-full flex items-center gap-1.5 text-left min-h-[32px]">
        <Activity className="w-3.5 h-3.5 shrink-0" style={{ color: EMBER }} aria-hidden="true" />
        <h3 className="font-heading font-bold text-fluid-sm text-text">Soreness</h3>
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {sore.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: SEVERITY_COLOR[peak] }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: SEVERITY_COLOR[peak] }} aria-hidden="true" />
              {sore.length} sore · {SEVERITY_WORD[peak]}
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: MUTED }}>
            {expanded ? 'Done' : 'Edit'}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
          </span>
        </span>
      </button>

      {/* ── The map. Always visible: this is the READING of the data. ── */}
      {!expanded && (
        <div className="space-y-1">
          {sore.map(({ muscle, severity }) => {
            const src = sources?.[muscle]
            return (
              <div key={muscle} className="flex items-center gap-2">
                <span className="text-fluid-xs text-text w-[68px] shrink-0 truncate">{muscle}</span>
                <SeverityBar severity={severity} />
                <span className="text-[9px] uppercase tracking-wide w-14 shrink-0 text-right"
                  style={{ color: SEVERITY_COLOR[severity] }}>{SEVERITY_WORD[severity]}</span>
                {src && (
                  <span className="hidden sm:flex items-center gap-1 text-[9px] text-muted shrink-0 max-w-[120px]">
                    <Dumbbell className="w-2.5 h-2.5 shrink-0" style={{ color: EMBER }} aria-hidden="true" />
                    <span className="truncate">{src.label}</span>
                  </span>
                )}
              </div>
            )
          })}
          {clear.length > 0 && (
            <p className="text-[10px] text-muted leading-snug pt-0.5">
              {sore.length === 0 ? 'No soreness logged · ' : 'Clear · '}
              {clear.join('  ')}
            </p>
          )}
        </div>
      )}

      {/* ── The editor. Unchanged behaviour: one 4-way picker per muscle. ── */}
      {expanded && (<>
      <p className="text-[10px] text-muted leading-snug">
        Rate 24–72h after training — that&apos;s when soreness peaks. Each muscle links to the workout that caused it.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
        {DOMS_MUSCLES.map((m) => {
          const cur = doms?.[m]
          const src = sources?.[m]
          return (
            <div key={m} className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-fluid-xs text-text w-[68px] shrink-0 truncate">{m}</span>
                <div className="flex gap-1 flex-1">
                  {DOMS_LEVELS.map((lv) => {
                    const on = cur === lv.v
                    const c = SEVERITY_COLOR[lv.v]
                    return (
                      <button
                        key={lv.v}
                        type="button"
                        onClick={() => log.mutate({ muscle: m, severity: lv.v, source: src })}
                        aria-pressed={on}
                        aria-label={`${m}: ${lv.label}`}
                        className="flex-1 rounded-md py-1.5 text-[9px] font-bold uppercase tracking-wide transition-colors"
                        style={{
                          color: on ? c : MUTED,
                          background: on ? `${c}1f` : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${on ? `${c}66` : HAIRLINE}`,
                        }}
                      >
                        {lv.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              {/* Attribution chip — the workout this muscle's soreness maps to. */}
              {src && cur != null && cur > 0 && (
                <div className="flex items-center gap-1 pl-[76px] text-[9px] text-muted">
                  <Dumbbell className="w-2.5 h-2.5 shrink-0" style={{ color: EMBER }} aria-hidden="true" />
                  <span className="truncate">
                    <span className="font-semibold" style={{ color: EMBER }}>{src.label}</span>
                    {' · '}{OFFSET_LABEL[src.dayOffset] ?? `+${src.dayOffset} days`}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      </>)}
    </section>
  )
}
