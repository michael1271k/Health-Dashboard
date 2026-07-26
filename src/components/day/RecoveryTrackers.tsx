'use client'

import { Activity, Dumbbell } from 'lucide-react'
import { useDoms, useLogDoms, useDomsSources, DOMS_MUSCLES, DOMS_LEVELS } from '@/lib/hooks/useRecovery'
import { EMERALD, GOLD, EMBER, OXIDE, MUTED, HAIRLINE } from '@/lib/theme/palette'

const SEVERITY_COLOR = [MUTED, EMERALD, GOLD, OXIDE]
const OFFSET_LABEL = ['same day', '+1 day', '+2 days']

/**
 * DOMS tracker — rate delayed-onset soreness in the 72h AFTER a session, which is
 * when it actually shows up and fades. Whole-body now (Quads · Hamstrings · Calves
 * · Back · Chest · Arms · Shoulders); each muscle's rating is auto-attributed to
 * the most recent session that TRAINED it, so "sore chest" ties to the last Upper
 * day and "sore quads" to the last leg day — filtered by each session's muscle tags.
 */
export function DomsTracker({ date }: { date: string }) {
  const { data: doms } = useDoms(date)
  const { data: sources } = useDomsSources(date)
  const log = useLogDoms(date)

  return (
    <section className="helix-card space-y-2.5">
      <h3 className="font-heading font-bold text-fluid-sm text-text flex items-center gap-1.5">
        <Activity className="w-3.5 h-3.5" style={{ color: EMBER }} aria-hidden="true" /> DOMS
      </h3>
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
                <span className="text-fluid-xs text-text w-14 shrink-0 truncate">{m}</span>
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
                <div className="flex items-center gap-1 pl-16 text-[9px] text-muted">
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
    </section>
  )
}
