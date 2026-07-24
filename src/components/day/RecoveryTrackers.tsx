'use client'

import { Activity, Dumbbell } from 'lucide-react'
import { useDoms, useLogDoms, useDomsSource, DOMS_MUSCLES, DOMS_LEVELS } from '@/lib/hooks/useRecovery'
import { EMERALD, GOLD, EMBER, OXIDE, MUTED, HAIRLINE } from '@/lib/theme/palette'

const SEVERITY_COLOR = [MUTED, EMERALD, GOLD, OXIDE]
const OFFSET_LABEL = ['same day', '+1 day', '+2 days']

/**
 * DOMS tracker — rate leg soreness in the 72h AFTER a session, which is when
 * delayed-onset soreness actually shows up and fades (rating it immediately
 * post-workout tells you nothing). Quads and hamstrings only: those are the two
 * that gate whether the next leg day runs as programmed.
 *
 * The rating is attributed to the session that caused it, so "moderate quads"
 * reads back as "moderate quads, +2 days after Legs & Core B" rather than a
 * free-floating number on a date.
 */
export function DomsTracker({ date }: { date: string }) {
  const { data: doms } = useDoms(date)
  const { data: source } = useDomsSource(date)
  const log = useLogDoms(date)

  return (
    <section className="helix-card space-y-2.5">
      <h3 className="font-heading font-bold text-fluid-sm text-text flex items-center gap-1.5">
        <Activity className="w-3.5 h-3.5" style={{ color: EMBER }} aria-hidden="true" /> Leg Soreness
      </h3>

      {source ? (
        <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px]"
          style={{ background: `${EMBER}12`, border: `1px solid ${EMBER}2e` }}>
          <Dumbbell className="w-3 h-3 shrink-0" style={{ color: EMBER }} aria-hidden="true" />
          <span className="text-muted">
            Soreness from <span className="font-semibold" style={{ color: EMBER }}>{source.label}</span>
            {' · '}{OFFSET_LABEL[source.dayOffset] ?? `+${source.dayOffset} days`}
          </span>
        </div>
      ) : (
        <p className="text-[10px] text-muted leading-snug">
          Rate 24–72h after a leg session — that&apos;s when DOMS peaks. Tap again to change it.
        </p>
      )}

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
                      onClick={() => log.mutate({ muscle: m, severity: lv.v, source })}
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
