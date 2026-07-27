'use client'

import { useState } from 'react'
import { Footprints, Zap, Plus, Trash2, X, Info, HeartPulse } from 'lucide-react'
import { useCardioLogs, useAddCardio, useDeleteCardio, useZone2Week, ZONE2_WEEKLY_TARGET } from '@/lib/hooks/useCardio'

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
  const [kcal, setKcal] = useState('')

  const num = (s: string): number | null => { const n = parseFloat(s); return s.trim() !== '' && Number.isFinite(n) ? n : null }

  const submit = () => {
    const distance = num(km)
    add.mutate(
      { kind, distance_m: distance != null ? Math.round(distance * 1000) : null, duration_min: num(min), kcal: num(kcal) },
      { onSuccess: () => { setKm(''); setMin(''); setKcal(''); setOpen(false) } },
    )
  }

  const entries = logs ?? []

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
              <span className="helix-num text-fluid-xs text-muted flex-1">
                {c.distance_m != null && <>{(c.distance_m / 1000).toFixed(2)} km</>}
                {c.duration_min != null && <> · {c.duration_min} min</>}
                {c.kcal != null && <> · {Math.round(c.kcal)} kcal</>}
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
            {[['km', km, setKm], ['min', min, setMin], ['kcal', kcal, setKcal]].map(([label, val, set]) => (
              <label key={label as string} className="block">
                <span className="block text-[9px] uppercase tracking-wide text-muted mb-1">{label as string}</span>
                <input type="text" inputMode="decimal" value={val as string}
                  onChange={(e) => (set as (s: string) => void)(e.target.value)} placeholder="—"
                  className="w-full rounded-lg bg-white/[0.03] border border-white/[0.08] px-2 py-2 min-h-[40px] helix-num text-fluid-sm text-text text-center outline-none focus:border-primary/40" />
              </label>
            ))}
          </div>
          <button onClick={submit} disabled={add.isPending || (!km && !min && !kcal)}
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
