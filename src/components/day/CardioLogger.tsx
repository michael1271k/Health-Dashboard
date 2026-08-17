'use client'

import { useState } from 'react'
import { Footprints, Zap, Plus, Trash2, Info, Trophy, ChevronDown } from 'lucide-react'
import {
  useCardioLogs, useCardioHistory, useLastCardio, useAddCardio, useDeleteCardio,
  useZone2Week, ZONE2_WEEKLY_TARGET,
} from '@/lib/hooks/useCardio'
import { paceMinPerKm, formatPace, activeKcalOf } from '@/lib/cardio/metrics'
import { axesHeldBy, CARDIO_AXIS_LABEL } from '@/lib/cardio/cardioPrs'
import { normalizeCr10, cr10Color } from '@/lib/training/effort'
import { EffortScale } from '@/components/ui/EffortScale'
import { Sheet } from '@/components/ui/Sheet'
import { Zone } from '@/components/ui/Zone'
import { EMERALD, EMBER, SAPPHIRE, GOLD } from '@/lib/theme/palette'

// Imported, not re-declared. These four were local consts holding the exact
// values the palette already exports — the hex ratchet counts literals, and it
// is right to. SAPPHIRE was this file's private name for SAPPHIRE.

const KINDS = [
  { key: 'walk' as const, label: 'Walk', Icon: Footprints, color: EMERALD },
  { key: 'run' as const, label: 'Run', Icon: Zap, color: EMBER },
]

/**
 * Cardio (walk / run) logger — km · min · kcal. Stored in cardio_logs, a ledger
 * kept SEPARATE from Active Energy: manual cardio kcal is never summed into the
 * day's HealthKit active total, so a walk Apple already counted can't be
 * double-counted. When Active Energy exists for the day we say so explicitly.
 *
 * THE FORM FOLLOWS THE LIFTING DECK. It used to be five identical unlabelled
 * boxes in a grid — every field the same size, so distance and "total kcal"
 * looked equally important, and four of five walks fill two of them. Distance ×
 * duration is the set; the rest is detail and collapses.
 *
 * PACE IS DERIVED AND READ-ONLY, deliberately: a stored pace drifts the moment
 * either input is corrected. It is promoted from a dashed box in the grid to the
 * live headline it actually is.
 *
 * RECORDS ARE DERIVED TOO (lib/cardio/cardioPrs.ts). Nothing is written to
 * personal_records — that table is the lifting ledger with an asserted history,
 * and cardio's axes don't belong to its vocabulary.
 */
export function CardioLogger({ date, hkActiveEnergy }: { date: string; hkActiveEnergy?: number | null }) {
  const { data: logs } = useCardioLogs(date)
  const { data: history } = useCardioHistory()
  const { data: zone2 } = useZone2Week(date)
  const add = useAddCardio(date)
  const del = useDeleteCardio()

  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'walk' | 'run'>('walk')
  const [more, setMore] = useState(false)
  const [km, setKm] = useState('')
  const [min, setMin] = useState('')
  const [activeKcal, setActiveKcal] = useState('')
  const [totalKcal, setTotalKcal] = useState('')
  const [avgHr, setAvgHr] = useState('')
  const [effort, setEffort] = useState<number | null>(null)

  const last = useLastCardio(kind)
  const num = (s: string): number | null => { const n = parseFloat(s); return s.trim() !== '' && Number.isFinite(n) ? n : null }

  // Live pace preview — derived from what's typed, never stored.
  const draftPace = formatPace(paceMinPerKm(
    num(km) != null ? Math.round((num(km) as number) * 1000) : null,
    num(min),
  ))

  const reset = () => {
    setKm(''); setMin(''); setActiveKcal(''); setTotalKcal(''); setAvgHr(''); setEffort(null); setMore(false)
  }

  /** Seed from the last outing of this kind — offered, never applied silently. */
  const repeatLast = () => {
    if (!last) return
    if (last.distance_m != null) setKm(String(Math.round((last.distance_m / 1000) * 100) / 100))
    if (last.duration_min != null) setMin(String(last.duration_min))
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
  const accent = kind === 'run' ? EMBER : EMERALD
  const lastKm = last?.distance_m != null ? Math.round((last.distance_m / 1000) * 100) / 100 : null

  return (
    /* The Zone lives HERE, not at the call site, because the `+` belongs in its
       header: an action that opens the form is a property of the section, and a
       button floating inside the content to open a form below itself was a
       control describing its own container. */
    <Zone label="Cardio" accent={EMERALD} action={
      <span className="flex items-center gap-2.5">
        {/* Zone 2, inline. This was a tinted, bordered, full-width block with a
            heart icon, a title, a subtitle and a fraction — a card to say "1 of
            2 done". Four dots and a count say it in the space a label already
            occupies. */}
        <span className="flex items-center gap-1" title={`Zone 2 · ${zone2 ?? 0}/${ZONE2_WEEKLY_TARGET} this week · 20–30 min on rest days`}>
          {Array.from({ length: ZONE2_WEEKLY_TARGET }).map((_, i) => (
            <span key={i} className="w-2 h-2 rounded-full"
              style={{ background: (zone2 ?? 0) > i ? SAPPHIRE : 'transparent', border: `1.5px solid ${SAPPHIRE}${(zone2 ?? 0) > i ? '' : '66'}` }} />
          ))}
          <span className="helix-num text-[10px] font-bold tabular-nums ml-0.5" style={{ color: SAPPHIRE }}>Z2</span>
        </span>
        <button onClick={() => setOpen(true)} className="btn-glass min-h-[32px] px-2 text-fluid-xs"
          aria-label="Log cardio">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </span>
    }>
      <div className="px-3 py-2 space-y-2">
      {entries.length > 0 ? (
        <div className="space-y-1.5">
          {entries.map((c) => {
            const held = axesHeldBy(history ?? [], c.id)
            const c2 = KINDS.find((k) => k.key === c.kind)?.color ?? EMERALD
            return (
              <div key={c.id} className="rounded-lg bg-white/[0.02] border border-white/[0.05] px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: `${c2}1a`, color: c2 }}>
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
                {/* Standing records only — a walk since beaten shows nothing,
                    the same rule the lifting ledger follows. */}
                {held.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap mt-1 pl-8">
                    <Trophy className="w-3 h-3 shrink-0" style={{ color: GOLD }} aria-hidden="true" />
                    <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: GOLD }}>
                      Best {c.kind} · {held.map((a) => CARDIO_AXIS_LABEL[a]).join(' · ')}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-[11px] text-muted">No cardio logged — tap + to add a walk or run.</p>
      )}

      {hkActiveEnergy != null && entries.length > 0 && (
        <p className="text-[10px] text-muted flex items-start gap-1 leading-snug">
          <Info className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
          Apple Active Energy ({Math.round(hkActiveEnergy)} kcal) already includes this — logged here for detail, never added on top.
        </p>
      )}
      </div>

      {/* THE FORM IS A DRAWER. Inline, it pushed the day's own entries — the
          thing you came to read — below a five-field form that is open on the
          two minutes a week you are logging and closed the rest of the time.
          Sheet also gives it swipe-to-dismiss, which an inline block with an X
          in the corner cannot have. */}
      <Sheet open={open} onClose={() => { setOpen(false) }} title="Log cardio" accent={accent}>
        <div className="px-1 pb-4 space-y-2.5">
          {/* Kind — two glyph tiles that carry their colour through the form,
              the way an exercise card takes its muscle colour. */}
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map(({ key, label, Icon, color }) => {
              const on = kind === key
              return (
                <button key={key} type="button" onClick={() => setKind(key)} aria-pressed={on}
                  className="flex items-center justify-center gap-2 rounded-xl min-h-[48px] font-semibold text-fluid-sm transition-colors"
                  style={{
                    color: on ? color : undefined,
                    background: on ? `${color}1a` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${on ? `${color}59` : 'rgba(255,255,255,0.08)'}`,
                  }}>
                  <Icon className="w-4 h-4" aria-hidden="true" /> {label}
                </button>
              )
            })}
          </div>

          {/* Repeat the last one of this kind. The common case is the same loop. */}
          {last && (lastKm != null || last.duration_min != null) && (
            <button type="button" onClick={repeatLast}
              className="w-full flex items-center gap-2 rounded-xl border border-dashed px-3 min-h-[40px] text-left transition-colors"
              style={{ borderColor: `${accent}40`, background: `${accent}0d` }}>
              <span className="text-[11px] text-muted flex-1">
                Repeat last {kind}:{' '}
                <span className="font-semibold helix-num" style={{ color: accent }}>
                  {lastKm != null ? `${lastKm} km` : ''}{lastKm != null && last.duration_min != null ? ' · ' : ''}
                  {last.duration_min != null ? `${last.duration_min} min` : ''}
                </span>
              </span>
            </button>
          )}

          {/* The set: distance × duration, with the derived pace as the headline. */}
          <div className="grid grid-cols-2 gap-2">
            {([
              ['Distance', 'km', km, setKm],
              ['Duration', 'min', min, setMin],
            ] as const).map(([label, unit, val, set]) => (
              <label key={label} className="block">
                <span className="block text-[9px] uppercase tracking-wide text-muted mb-1">{label} <span className="opacity-60">{unit}</span></span>
                <input type="text" inputMode="decimal" value={val}
                  onChange={(e) => set(e.target.value)} placeholder="—"
                  aria-label={`${label} in ${unit}`}
                  className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-2 py-2 min-h-[52px]
                             helix-num text-fluid-lg font-bold text-text text-center outline-none focus:border-primary/40" />
              </label>
            ))}
          </div>

          <div className="flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5"
            style={{ background: `${accent}12`, border: `1px solid ${accent}2e` }}>
            <span className="text-[9px] uppercase tracking-wide text-muted">Pace</span>
            <span className="helix-num text-fluid-sm font-bold" style={{ color: accent }}>{draftPace}</span>
            <span className="text-[9px] text-muted">auto</span>
          </div>

          {/* Detail. Four in five walks never open this. */}
          <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more}
            className="w-full flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted min-h-[36px]">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${more ? 'rotate-180' : ''}`} aria-hidden="true" />
            Heart rate &amp; energy
          </button>

          {more && (
            <div className="grid grid-cols-3 gap-2">
              {([
                ['Avg HR', 'bpm', avgHr, setAvgHr],
                ['Active', 'kcal', activeKcal, setActiveKcal],
                ['Total', 'kcal', totalKcal, setTotalKcal],
              ] as const).map(([label, unit, val, set]) => (
                <label key={label} className="block">
                  <span className="block text-[9px] uppercase tracking-wide text-muted mb-1">{label} <span className="opacity-60">{unit}</span></span>
                  <input type="text" inputMode="decimal" value={val}
                    onChange={(e) => set(e.target.value)} placeholder="—"
                    aria-label={`${label} in ${unit}`}
                    className="w-full rounded-lg bg-white/[0.03] border border-white/[0.08] px-2 py-2 min-h-[40px] helix-num field-compact text-text text-center outline-none focus:border-primary/40" />
                </label>
              ))}
            </div>
          )}

          <EffortScale value={effort} onChange={setEffort} label="Effort" compact />
          <button onClick={submit} disabled={add.isPending || !anyInput}
            className="btn-primary w-full justify-center min-h-[44px] disabled:opacity-50"
            style={{ background: accent, boxShadow: `0 0 18px ${accent}55` }}>
            {add.isPending ? 'Logging…' : `Log ${kind}`}
          </button>
          {add.isError && <p className="text-danger text-[11px]">{add.error instanceof Error && /relation|does not exist|schema cache/i.test(add.error.message) ? 'Run the cardio_logs paste-SQL first.' : 'Could not log.'}</p>}
        </div>
      </Sheet>
    </Zone>
  )
}
