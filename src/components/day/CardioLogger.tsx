'use client'

import { useState } from 'react'
import { Footprints, Zap, Plus, Trash2, X, Info, HeartPulse } from 'lucide-react'
import { useCardioLogs, useAddCardio, useDeleteCardio, useZone2Week, ZONE2_WEEKLY_TARGET } from '@/lib/hooks/useCardio'
import { paceMinPerKm, formatPace, activeKcalOf } from '@/lib/cardio/metrics'
import { normalizeCr10, cr10Color } from '@/lib/training/effort'
import { EffortScale } from '@/components/ui/EffortScale'

const EMERALD = '#3E9E7A'
const EMBER = '#E0703C'
const AZURE = '#3D7AB8'

/**
 * Cardio (walk / run) logger — km · min · kcal. Stored in cardio_logs, a ledger
 * kept SEPARATE from Active Energy: manual cardio kcal is never summed into the
 * day's HealthKit active total, so a walk Apple already counted can't be
 * double-counted. When Active Energy exists for the day we say so explicitly.
 */
export function CardioLogger({ date, hkActiveEnergy }: { date: string; hkActiveEnergy?: number | null }) {
  const { data: logs } = useCardioLogs(date)
  const { data: zone2 } = useZone2Week(date)
  const add = useAddCardio(date)
  const del = useDeleteCardio(date)

  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'walk' | 'run'>('walk')
  const [km, setKm] = useState('')
  const [min, setMin] = useState('')
  const [activeKcal, setActiveKcal] = useState('')
  const [totalKcal, setTotalKcal] = useState('')
  const [avgHr, setAvgHr] = useState('')
  const [effort, setEffort] = useState<number | null>(null)

  const num = (s: string): number | null => { const n = parseFloat(s); return s.trim() !== '' && Number.isFinite(n) ? n : null }

  // Live pace preview — derived from what's typed, never stored.
  const draftPace = formatPace(paceMinPerKm(
    num(km) != null ? Math.round((num(km) as number) * 1000) : null,
    num(min),
  ))

  const reset = () => {
    setKm(''); setMin(''); setActiveKcal(''); setTotalKcal(''); setAvgHr(''); setEffort(null)
  }

  const submit = () => {
    const distance = num(km)
    add.mutate(
      {
        kind,
        distance_m: distance != null ? Math.round(distance * 1000) : null,
        duration_min: num(min),
        active_kcal: num(activeKcal),
        total_kcal: num(totalKcal),
        avg_hr: num(avgHr),
        effort: normalizeCr10(effort),
      },
      { onSuccess: () => { reset(); setOpen(false) } },
    )
  }

  const entries = logs ?? []
  const anyInput = !!(km || min || activeKcal || totalKcal || avgHr) || effort != null

  return (
    <section className="helix-card space-y-2.5" style={{ borderColor: `${EMERALD}26` }}>
      <div className="flex items-center gap-2">
        <Footprints className="w-3.5 h-3.5" style={{ color: EMERALD }} aria-hidden="true" />
        <h3 className="font-heading font-bold text-fluid-sm text-text flex-1">Cardio</h3>
        <button onClick={() => setOpen((v) => !v)} className="btn-glass min-h-[36px] text-fluid-xs px-2.5">
          {open ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Zone-2 weekly goal: 2× 20–30 min steady sessions on rest days. Visual only. */}
      <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
        style={{ background: `${AZURE}12`, border: `1px solid ${AZURE}2e` }}>
        <HeartPulse className="w-3.5 h-3.5 shrink-0" style={{ color: AZURE }} aria-hidden="true" />
        <span className="text-[11px] font-semibold text-text">Zone 2</span>
        <span className="text-[10px] text-muted">20–30 min · rest days</span>
        <div className="ml-auto flex items-center gap-1.5">
          {Array.from({ length: ZONE2_WEEKLY_TARGET }).map((_, i) => (
            <span key={i} className="w-2.5 h-2.5 rounded-full"
              style={{ background: (zone2 ?? 0) > i ? AZURE : 'transparent', border: `1.5px solid ${AZURE}${(zone2 ?? 0) > i ? '' : '66'}` }} />
          ))}
          <span className="helix-num text-[11px] font-bold tabular-nums ml-0.5" style={{ color: AZURE }}>
            {Math.min(zone2 ?? 0, ZONE2_WEEKLY_TARGET)}/{ZONE2_WEEKLY_TARGET}
          </span>
        </div>
      </div>

      {entries.length > 0 ? (
        <div className="space-y-1.5">
          {entries.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg bg-white/[0.02] border border-white/[0.05] px-2.5 py-1.5">
              <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                style={{ background: `${c.kind === 'run' ? EMBER : EMERALD}1a`, color: c.kind === 'run' ? EMBER : EMERALD }}>
                {c.kind === 'run' ? <Zap className="w-3 h-3" /> : <Footprints className="w-3 h-3" />}
              </span>
              <span className="text-fluid-xs font-medium text-text capitalize w-10 shrink-0">{c.kind}</span>
              <span className="helix-num text-[11px] text-muted flex-1 leading-snug">
                {c.distance_m != null && <>{(c.distance_m / 1000).toFixed(2)} km</>}
                {c.duration_min != null && <> · {c.duration_min} min</>}
                {(() => { const p = paceMinPerKm(c.distance_m, c.duration_min); return p != null ? <> · {formatPace(p)}</> : null })()}
                {activeKcalOf(c) != null && <> · {Math.round(activeKcalOf(c) as number)} active</>}
                {c.total_kcal != null && <> · {Math.round(c.total_kcal)} total</>}
                {c.avg_hr != null && <> · {Math.round(c.avg_hr)} bpm</>}
                {c.effort != null && <> · <span style={{ color: cr10Color(c.effort) }}>RPE {c.effort}</span></>}
              </span>
              <button onClick={() => del.mutate(c.id)} className="p-1 text-muted hover:text-danger shrink-0" aria-label="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : !open ? (
        <p className="text-[11px] text-muted">No cardio logged — tap + to add a walk or run.</p>
      ) : null}

      {open && (
        <div className="space-y-2.5 pt-1">
          <div className="flex rounded-xl border border-white/[0.08] overflow-hidden">
            {(['walk', 'run'] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)}
                className={`flex-1 py-2 text-fluid-xs font-semibold capitalize ${kind === k ? 'text-text' : 'text-muted'}`}
                style={kind === k ? { background: `${k === 'run' ? EMBER : EMERALD}1f`, color: k === 'run' ? EMBER : EMERALD } : undefined}>
                {k}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              ['min', 'Duration', min, setMin],
              ['km', 'Distance', km, setKm],
              ['bpm', 'Avg HR', avgHr, setAvgHr],
              ['kcal', 'Active', activeKcal, setActiveKcal],
              ['kcal', 'Total', totalKcal, setTotalKcal],
            ] as const).map(([unit, label, val, set]) => (
              <label key={label} className="block">
                <span className="block text-[9px] uppercase tracking-wide text-muted mb-1">{label} <span className="opacity-60">{unit}</span></span>
                <input type="text" inputMode="decimal" value={val}
                  onChange={(e) => set(e.target.value)} placeholder="—"
                  className="w-full rounded-lg bg-white/[0.03] border border-white/[0.08] px-2 py-2 min-h-[40px] helix-num text-fluid-sm text-text text-center outline-none focus:border-primary/40" />
              </label>
            ))}
            {/* Pace is DERIVED from distance ÷ duration — a stored pace drifts
                the moment either is corrected, so it is read-only by design. */}
            <div className="block">
              <span className="block text-[9px] uppercase tracking-wide text-muted mb-1">Pace <span className="opacity-60">auto</span></span>
              <div className="w-full rounded-lg bg-white/[0.015] border border-dashed border-white/[0.08] px-2 py-2 min-h-[40px] helix-num text-fluid-sm text-muted text-center flex items-center justify-center">
                {draftPace}
              </div>
            </div>
          </div>
          <EffortScale value={effort} onChange={setEffort} label="Effort" compact />
          <button onClick={submit} disabled={add.isPending || !anyInput}
            className="btn-primary w-full justify-center min-h-[42px] disabled:opacity-50">
            {add.isPending ? 'Logging…' : 'Log cardio'}
          </button>
          {add.isError && <p className="text-danger text-[11px]">{add.error instanceof Error && /relation|does not exist|schema cache/i.test(add.error.message) ? 'Run the cardio_logs paste-SQL first.' : 'Could not log.'}</p>}
        </div>
      )}

      {hkActiveEnergy != null && entries.length > 0 && (
        <p className="text-[10px] text-muted flex items-start gap-1 leading-snug">
          <Info className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
          Apple Active Energy ({Math.round(hkActiveEnergy)} kcal) already includes this — logged here for detail, never added on top.
        </p>
      )}
    </section>
  )
}
