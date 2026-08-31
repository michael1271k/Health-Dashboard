'use client'

import { useState } from 'react'
import { Check, History, Loader2 } from 'lucide-react'
import { useSaveBodyMetrics, type BodyMetricsPatch, type DayVaultData } from '@/lib/hooks/useDayVault'
import { useLatestBodyReading, type CarryField } from '@/lib/hooks/useLatestBodyReading'
import { useFlash } from '@/lib/hooks/useFlash'
import { deriveBodyComp, whrBand, visceralBand, type BodyCompInput, type BodyCompDerived, type WhrBand, type VisceralBand } from '@/lib/body/composition'
import { EMBER, EMERALD, GOLD, OXIDE } from '@/lib/theme/palette'

// Was `const ACCENT = '#E0703C'` — a name that lied about its value in two
// separate files. The Body domain's accent is the signature ember.
const ACCENT = EMBER

/** WHO abdominal-obesity bands, in the app's own semantic colours. */
const WHR_COLOR: Record<WhrBand, string> = { low: EMERALD, moderate: GOLD, high: OXIDE }
const VISCERAL_COLOR: Record<VisceralBand, string> = { optimal: EMERALD, elevated: GOLD, high: OXIDE }


/**
 * Editable inputs — every one of them a number the SCALE reports.
 *
 * Masses derive from Weight × % (see the read-only Composition strip) with two
 * exceptions the scale computes itself and no percentage can reproduce:
 * skeletal muscle mass, and the estimated waist-to-hip ratio.
 *
 * NO TAPE MEASUREMENTS. `waist_cm` / `hip_cm` are gone and are not coming back
 * — see the note in lib/body/composition.ts.
 */
const INPUTS: Array<{ key: keyof BodyMetricsPatch; label: string; unit: string }> = [
  { key: 'weight_kg',      label: 'Weight',   unit: 'kg' },
  { key: 'bmi',            label: 'BMI',      unit: '' },
  { key: 'body_fat_pct',   label: 'Body Fat', unit: '%' },
  { key: 'muscle_percent', label: 'Muscle',   unit: '%' },
  { key: 'water_percent',  label: 'Water',    unit: '%' },
  { key: 'protein_percent',label: 'Protein',  unit: '%' },
  { key: 'bone_mineral',   label: 'Bone Min', unit: '%' },
  { key: 'visceral_fat',   label: 'Visceral', unit: 'lvl' },
  { key: 'bmr',            label: 'BMR',      unit: 'kcal' },
  { key: 'skeletal_muscle_mass_kg', label: 'Skeletal', unit: 'kg' },
  { key: 'estimated_waist_to_hip_ratio', label: 'W:H Ratio', unit: '' },
]

/**
 * Read-only values computed live from the entries above.
 *
 * `muscle_mass_kg` (weight × muscle%) is labelled "Lean Mass" everywhere in the
 * UI. It is not the same quantity as the scale's Skeletal Muscle reading, which
 * has its own field — the two are ~23 kg apart and never share a label.
 */
const DERIVED: Array<{ key: keyof BodyCompDerived; label: string; unit: string }> = [
  { key: 'muscle_mass_kg',   label: 'Lean Mass', unit: 'kg' },
  { key: 'fat_mass_kg',      label: 'Fat',      unit: 'kg' },
  { key: 'water_mass_kg',    label: 'Water',    unit: 'kg' },
  { key: 'protein_mass_kg',  label: 'Protein',  unit: 'kg' },
  { key: 'fat_free_mass_kg', label: 'Fat-Free', unit: 'kg' },
]

/**
 * Does this day have ANY scale reading at all?
 *
 * Lives here rather than in the page because it decides which face the Body
 * panel wears, and that decision has to agree with what this form writes.
 */
export function hasScaleMetrics(log: DayVaultData['log']): boolean {
  if (!log) return false
  const r = log as Record<string, number | null>
  return ['weight_kg', 'body_fat_pct', 'muscle_percent', 'water_percent', 'muscle_mass_kg',
    'fat_free_mass_kg', 'bone_mineral', 'visceral_fat', 'bmr', 'bmi',
    'skeletal_muscle_mass_kg', 'estimated_waist_to_hip_ratio'].some((k) => r[k] != null)
}

/**
 * InBody & Scale Metrics — the ONLY manual entry point for the advanced scale
 * numbers Apple Health can't sync. Lives exclusively in the Daily Nexus.
 *
 * Smart auto-calc: enter Weight + a percentage and the corresponding mass (kg)
 * is derived and saved — no double entry. A live Composition strip shows muscle,
 * fat, water, protein and fat-free mass so the numbers read like an InBody sheet.
 *
 * CARRY-FORWARD. HealthKit fills weight, BMI and body fat by itself; muscle %,
 * water %, protein % and bone mineral have no HealthKit type and can only ever
 * be typed. So on a morning you have weighed but not yet entered, four inputs
 * are blank with nothing on screen saying what they were last time — and 78.3
 * recalled from memory is how a wrong number gets in. Every empty field now
 * shows its last value as a placeholder, and one tap fills them all.
 *
 * It is a FILL, not a save: the values land in the edit buffer where you can see
 * and change them, and nothing reaches the database until you press Save. A
 * reading inherited from four days ago is context, not a measurement, and the
 * app must never quietly record it as one.
 *
 * NO CARD CHROME, NO COLLAPSE. This used to be a self-collapsing card sitting
 * below the pager — the panel that VISUALISES composition and the form that
 * ENTERS it were the same subject ~400px apart, and on a day with no weigh-in
 * you scrolled past an empty Body page to reach the form that would fill it.
 * The form is now the content of a Sheet opened from that page (see BodyPanel),
 * which also keeps its nine inputs from setting the pager's shared height.
 */
export function InBodyForm({ date, log, onSaved }: {
  date: string
  log: DayVaultData['log']
  /** Fired after a successful write — the host Sheet closes on it. */
  onSaved?: () => void
}) {
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saved, flashSaved] = useFlash(2500)
  const save = useSaveBodyMetrics(date)
  const { data: last } = useLatestBodyReading(date)

  // New columns aren't in the generated Row type yet — read through a loose view.
  const readLog = log as Record<string, number | null> | null
  const stored = (key: keyof BodyMetricsPatch): string =>
    readLog?.[key] != null ? String(readLog[key]) : ''
  const shown = (key: keyof BodyMetricsPatch): string => edits[key] ?? stored(key)
  const dirty = Object.entries(edits).some(([k, v]) => v !== stored(k as keyof BodyMetricsPatch))

  /** The last known value for a field, only while this day has none of its own. */
  const carried = (key: keyof BodyMetricsPatch): number | undefined =>
    shown(key).trim() === '' ? last?.values[key as CarryField] : undefined
  const fillable = INPUTS.filter((f) => carried(f.key) != null)

  const fillFromLast = () => {
    setEdits((v) => {
      const next = { ...v }
      for (const f of fillable) next[f.key] = String(last?.values[f.key as CarryField])
      return next
    })
  }

  /** The current merged record (stored + edits) as numbers, for live derivation. */
  function currentRecord(): BodyCompInput {
    const g = (k: keyof BodyMetricsPatch): number | undefined => {
      const s = shown(k); const n = parseFloat(s)
      return s.trim() !== '' && Number.isFinite(n) ? n : undefined
    }
    return {
      weight_kg: g('weight_kg'), body_fat_pct: g('body_fat_pct'), muscle_percent: g('muscle_percent'),
      water_percent: g('water_percent'), bone_mineral: g('bone_mineral'), protein_percent: g('protein_percent'),
    }
  }
  const derived = deriveBodyComp(currentRecord())
  const hasDerived = Object.keys(derived).length > 0

  function submit() {
    // Numeric-only by construction: every field this form owns is a number, and
    // `weighin_skip_reason` — the one text column on the patch — is written by
    // the skip chips, not here.
    const numeric: Record<string, number> = {}
    for (const [k, v] of Object.entries(edits)) {
      if (v === stored(k as keyof BodyMetricsPatch)) continue
      const n = parseFloat(v)
      if (v.trim() !== '' && Number.isFinite(n)) numeric[k] = n
    }
    if (!Object.keys(numeric).length) return
    const patch: BodyMetricsPatch = numeric
    // Fold the derived masses in so they're persisted alongside the raw entries.
    Object.assign(patch, deriveBodyComp(currentRecord()))
    save.mutate(patch, {
      onSuccess: () => {
        setEdits({})
        flashSaved()
        onSaved?.()
      },
    })
  }

  return (
    <div className="space-y-3">
      {/* Carry-forward. Offered once, plainly, and only when there is something
          to offer — a row of blank boxes with no history behind them needs no
          explanation. */}
      {fillable.length > 0 && last?.latestDate && (
        <button
          type="button"
          onClick={fillFromLast}
          className="w-full flex items-center gap-2 rounded-xl border border-dashed px-3 min-h-[40px] text-left transition-colors"
          style={{ borderColor: `${ACCENT}40`, background: `${ACCENT}0d` }}
        >
          <History className="w-3.5 h-3.5 shrink-0" style={{ color: ACCENT }} aria-hidden="true" />
          <span className="text-[11px] text-muted flex-1">
            Fill {fillable.length} empty {fillable.length === 1 ? 'field' : 'fields'} from{' '}
            <span className="font-semibold" style={{ color: ACCENT }}>
              {new Date(`${last.latestDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          </span>
        </button>
      )}

      <div className="grid grid-cols-3 gap-2">
        {INPUTS.map((f) => {
          const ghost = carried(f.key)
          return (
            <label key={f.key} className="block">
              <span className="block text-[9px] uppercase tracking-wide text-muted mb-1">
                {f.label}{f.unit && <span className="opacity-60"> · {f.unit}</span>}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={shown(f.key)}
                onChange={(e) => setEdits((v) => ({ ...v, [f.key]: e.target.value }))}
                // The last reading sits in the placeholder, not the value: it is
                // legible, it is obviously not today's number, and it cannot be
                // saved by accident.
                placeholder={ghost != null ? String(ghost) : '—'}
                className="w-full rounded-lg bg-white/[0.03] border border-white/[0.08] px-2 py-2 min-h-[40px]
                           helix-num field-compact text-text text-center tabular-nums
                           placeholder:text-muted/40 outline-none focus:border-primary/40"
                aria-label={`${f.label}${f.unit ? ` in ${f.unit}` : ''}${ghost != null ? `, last reading ${ghost}` : ''}`}
              />
            </label>
          )
        })}
      </div>

      {/* Live Composition — derived masses, read-only. */}
      {hasDerived && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
          <span className="block text-[9px] uppercase tracking-widest text-muted mb-2">Composition · auto-calculated</span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {DERIVED.map((d) => {
              const v = derived[d.key]
              return (
                <div key={d.key} className="text-center">
                  <span className="helix-num block text-fluid-sm font-bold leading-tight" style={{ color: v != null ? ACCENT : undefined }}>
                    {v != null ? v : '—'}{v != null && d.unit ? <span className="text-[8px] text-muted font-normal ml-0.5">{d.unit}</span> : null}
                  </span>
                  <span className="text-[8px] uppercase tracking-wide text-muted">{d.label}</span>
                </div>
              )
            })}
            {/* Visceral fat wears a band for the same reason the ratio does: an
                index printed bare is a number you cannot act on, and the one
                the scale itself would apply calls everything under 10 fine —
                which would be green from the first week of the cut to the last.
                See `visceralBand` for why these thresholds are stricter. */}
            {(() => {
              const raw = shown('visceral_fat')
              const v = parseFloat(raw)
              if (raw.trim() === '' || !Number.isFinite(v)) return null
              const band = visceralBand(v)
              return (
                <div className="text-center">
                  <span className="helix-num block text-fluid-sm font-bold leading-tight" style={{ color: VISCERAL_COLOR[band] }}>{v}</span>
                  <span className="text-[8px] uppercase tracking-wide text-muted">{band} visceral</span>
                </div>
              )
            })()}
            {/* The scale's own ratio — entered, not derived, but it belongs in
                the read-out beside the masses. Wears its WHO band. */}
            {(() => {
              const whr = (() => { const s = shown('estimated_waist_to_hip_ratio'); const n = parseFloat(s); return s.trim() !== '' && Number.isFinite(n) ? n : null })()
              if (whr == null) return null
              return (
                <div className="text-center">
                  <span className="helix-num block text-fluid-sm font-bold leading-tight" style={{ color: WHR_COLOR[whrBand(whr)] }}>{whr}</span>
                  <span className="text-[8px] uppercase tracking-wide text-muted">{whrBand(whr)} W:H</span>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {save.isError && (
        <p className="text-danger text-xs" dir="auto">
          {save.error instanceof Error ? save.error.message : 'Save failed'}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={!dirty || save.isPending}
        className="btn-primary w-full justify-center min-h-[44px] disabled:opacity-40"
      >
        {save.isPending
          ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Saving…</>
          : saved
            ? <><Check className="w-4 h-4" aria-hidden="true" /> Saved</>
            : 'Save metrics'}
      </button>
    </div>
  )
}
