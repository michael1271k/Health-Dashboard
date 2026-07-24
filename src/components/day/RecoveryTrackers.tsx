'use client'

import { useEffect, useState } from 'react'
import { Activity, Ruler } from 'lucide-react'
import {
  useDoms, useLogDoms, useMeasurements, useSaveMeasurement,
  DOMS_MUSCLES, DOMS_LEVELS,
} from '@/lib/hooks/useRecovery'
import { EMERALD, GOLD, EMBER, OXIDE, MUTED, HAIRLINE, SAPPHIRE } from '@/lib/theme/palette'

const SEVERITY_COLOR = [MUTED, EMERALD, GOLD, OXIDE]

/**
 * DOMS tracker — rate soreness per muscle 24–48h AFTER a session, which is when
 * delayed-onset soreness actually peaks (rating it immediately post-workout tells
 * you nothing). Feeds the coach's recovery logic.
 */
export function DomsTracker({ date }: { date: string }) {
  const { data: doms } = useDoms(date)
  const log = useLogDoms(date)

  return (
    <section className="helix-card space-y-2.5">
      <h3 className="font-heading font-bold text-fluid-sm text-text flex items-center gap-1.5">
        <Activity className="w-3.5 h-3.5" style={{ color: EMBER }} aria-hidden="true" /> Soreness (DOMS)
      </h3>
      <p className="text-[10px] text-muted leading-snug">
        Rate 24–48h after training — that&apos;s when DOMS peaks.
      </p>
      <div className="space-y-1.5">
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
                      className="flex-1 rounded-md py-1 text-[9px] font-bold uppercase tracking-wide transition-colors"
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

const FIELDS = [
  { key: 'navelWaistCm', label: 'Navel waist', color: EMBER },
  { key: 'relaxedArmCm', label: 'Relaxed arm', color: SAPPHIRE },
  { key: 'thighCm', label: 'Thigh', color: EMERALD },
] as const

/**
 * Tape measurements — waist / relaxed arm / thigh. BIA body-fat% is too noisy to
 * steer a recomp; a tape at the navel is not. Shows the delta vs the previous
 * entry (waist down = good, limbs up = good).
 */
export function MeasurementsCard({ date }: { date: string }) {
  const { data: rows } = useMeasurements()
  const save = useSaveMeasurement()
  const todayRow = rows?.find((r) => r.date === date)
  const prevRow = rows?.find((r) => r.date < date)
  const [vals, setVals] = useState<Record<string, string>>({ navelWaistCm: '', relaxedArmCm: '', thighCm: '' })

  useEffect(() => {
    setVals({
      navelWaistCm: todayRow?.navelWaistCm != null ? String(todayRow.navelWaistCm) : '',
      relaxedArmCm: todayRow?.relaxedArmCm != null ? String(todayRow.relaxedArmCm) : '',
      thighCm: todayRow?.thighCm != null ? String(todayRow.thighCm) : '',
    })
  }, [todayRow?.navelWaistCm, todayRow?.relaxedArmCm, todayRow?.thighCm])

  const num = (s: string) => (s.trim() === '' ? null : Number(s))
  const dirty = FIELDS.some((f) => num(vals[f.key]) !== (todayRow?.[f.key] ?? null))

  return (
    <section className="helix-card space-y-2.5">
      <h3 className="font-heading font-bold text-fluid-sm text-text flex items-center gap-1.5">
        <Ruler className="w-3.5 h-3.5" style={{ color: SAPPHIRE }} aria-hidden="true" /> Measurements
      </h3>
      <p className="text-[10px] text-muted leading-snug">
        Tape beats BIA for recomp — scale body-fat% is too noisy to steer on.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {FIELDS.map((f) => {
          const prev = prevRow?.[f.key] ?? null
          const cur = num(vals[f.key])
          const delta = prev != null && cur != null ? Math.round((cur - prev) * 10) / 10 : null
          // Waist down is progress; arm/thigh up is progress.
          const good = delta == null || delta === 0 ? null
            : f.key === 'navelWaistCm' ? delta < 0 : delta > 0
          return (
            <label key={f.key} className="block">
              <span className="text-[9px] uppercase tracking-wide" style={{ color: f.color }}>{f.label}</span>
              <input
                type="number" inputMode="decimal" step="0.1" placeholder="—"
                value={vals[f.key]}
                onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                className="mt-1 w-full rounded-lg border bg-surface-2 px-2 py-1.5 text-fluid-sm helix-num font-bold text-text outline-none focus:ring-2 focus:ring-primary/60"
                style={{ borderColor: HAIRLINE }}
                aria-label={f.label}
              />
              <span className="block text-[9px] mt-0.5 helix-num" style={{ color: good == null ? MUTED : good ? EMERALD : OXIDE }}>
                {delta == null ? 'cm' : `${delta > 0 ? '+' : ''}${delta} cm`}
              </span>
            </label>
          )
        })}
      </div>
      <button
        onClick={() => save.mutate({
          date,
          navelWaistCm: num(vals.navelWaistCm),
          relaxedArmCm: num(vals.relaxedArmCm),
          thighCm: num(vals.thighCm),
        })}
        disabled={!dirty || save.isPending}
        className="btn-glass w-full justify-center min-h-[40px] text-fluid-xs disabled:opacity-40"
      >
        {save.isPending ? 'Saving…' : 'Save measurements'}
      </button>
      {save.isError && <p className="text-danger text-[11px]">{save.error instanceof Error ? save.error.message : 'Save failed'}</p>}
    </section>
  )
}
