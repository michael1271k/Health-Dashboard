'use client'

import { Activity } from 'lucide-react'
import { useDoms, useLogDoms, DOMS_MUSCLES, DOMS_LEVELS } from '@/lib/hooks/useRecovery'
import { EMERALD, GOLD, EMBER, OXIDE, MUTED, HAIRLINE } from '@/lib/theme/palette'

const SEVERITY_COLOR = [MUTED, EMERALD, GOLD, OXIDE]

/**
 * DOMS tracker — rate leg soreness 24–48h AFTER a session, which is when
 * delayed-onset soreness actually peaks (rating it immediately post-workout
 * tells you nothing). Quads and hamstrings only: those are the two that gate
 * whether the next leg day runs as programmed. Editable all day — tapping a
 * different level replaces the rating.
 */
export function DomsTracker({ date }: { date: string }) {
  const { data: doms } = useDoms(date)
  const log = useLogDoms(date)

  return (
    <section className="helix-card space-y-2.5">
      <h3 className="font-heading font-bold text-fluid-sm text-text flex items-center gap-1.5">
        <Activity className="w-3.5 h-3.5" style={{ color: EMBER }} aria-hidden="true" /> Leg Soreness
      </h3>
      <p className="text-[10px] text-muted leading-snug">
        Rate 24–48h after training — that&apos;s when DOMS peaks. Tap again to change it.
      </p>
      <div className="space-y-2">
        {DOMS_MUSCLES.map((m) => {
          const cur = doms?.[m]
          return (
            <div key={m} className="flex items-center gap-2">
              <span className="text-fluid-xs text-text w-20 shrink-0 truncate">{m}</span>
              <div className="flex gap-1 flex-1">
                {DOMS_LEVELS.map((lv) => {
                  const on = cur === lv.v
                  const c = SEVERITY_COLOR[lv.v]
                  return (
                    <button
                      key={lv.v}
                      type="button"
                      onClick={() => log.mutate({ muscle: m, severity: lv.v })}
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
          )
        })}
      </div>
    </section>
  )
}
