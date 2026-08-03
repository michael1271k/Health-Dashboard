'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useSaveBodyMetrics, type BodyMetricsPatch, type DayVaultData } from '@/lib/hooks/useDayVault'
import { deriveBodyComp, type BodyCompInput, type BodyCompDerived } from '@/lib/body/composition'

const TEAL = '#E0703C'

/** Editable inputs — the scale readings. Masses are NOT entered; they're derived
 *  from Weight × % (see the read-only Composition strip). Circumference (waist /
 *  hip) is deliberately absent: it isn't tracked. */
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
]

/** Read-only masses computed live from the entries above. */
const DERIVED: Array<{ key: keyof BodyCompDerived; label: string; unit: string }> = [
  { key: 'muscle_mass_kg',   label: 'Muscle',   unit: 'kg' },
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
    'fat_free_mass_kg', 'bone_mineral', 'visceral_fat', 'bmr', 'bmi'].some((k) => r[k] != null)
}

/**
 * The four headline readings for a day that has been weighed.
 *
 * "Lean" used to sit here reading `lean_mass_kg` — a column this very form
 * fills with weight × muscle% while HealthKit fills it with weight − fat. It
 * names the two masses separately now.
 */
export function InBodyHeadline({ log }: { log: DayVaultData['log'] }) {
  const r = log as Record<string, number | null> | null
  const d = deriveBodyComp({
    weight_kg: r?.weight_kg ?? undefined, body_fat_pct: r?.body_fat_pct ?? undefined,
    muscle_percent: r?.muscle_percent ?? undefined, water_percent: r?.water_percent ?? undefined,
    bone_mineral: r?.bone_mineral ?? undefined, protein_percent: r?.protein_percent ?? undefined,
  })
  const tiles = [
    { label: 'Weight', v: r?.weight_kg, u: 'kg' },
    { label: 'Body Fat', v: r?.body_fat_pct, u: '%' },
    { label: 'Muscle', v: r?.muscle_mass_kg ?? d.muscle_mass_kg, u: 'kg' },
    { label: 'Fat-Free', v: r?.fat_free_mass_kg ?? d.fat_free_mass_kg, u: 'kg' },
  ]
  return (
    <div className="grid grid-cols-4 gap-2">
      {tiles.map((s) => (
        <div key={s.label} className="rounded-lg bg-white/[0.02] border border-white/[0.05] px-1 py-1.5 text-center">
          <span className="helix-num block text-fluid-sm font-bold text-text leading-tight">
            {s.v != null ? s.v : '—'}{s.v != null && s.u ? <span className="text-[9px] text-muted font-normal ml-0.5">{s.u}</span> : null}
          </span>
          <span className="text-[8px] uppercase tracking-wide" style={{ color: TEAL }}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * InBody & Scale Metrics — the ONLY manual entry point for the advanced scale
 * numbers Apple Health can't sync. Lives exclusively in the Daily Nexus.
 *
 * Smart auto-calc: enter Weight + a percentage and the corresponding mass (kg)
 * is derived and saved — no double entry. A live Composition strip shows muscle,
 * fat, water, protein and fat-free mass so the numbers read like an InBody sheet.
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
  const [saved, setSaved] = useState(false)
  const save = useSaveBodyMetrics(date)

  // New columns aren't in the generated Row type yet — read through a loose view.
  const readLog = log as Record<string, number | null> | null
  const stored = (key: keyof BodyMetricsPatch): string =>
    readLog?.[key] != null ? String(readLog[key]) : ''
  const shown = (key: keyof BodyMetricsPatch): string => edits[key] ?? stored(key)
  const dirty = Object.entries(edits).some(([k, v]) => v !== stored(k as keyof BodyMetricsPatch))

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
    const patch: BodyMetricsPatch = {}
    for (const [k, v] of Object.entries(edits)) {
      if (v === stored(k as keyof BodyMetricsPatch)) continue
      const n = parseFloat(v)
      if (v.trim() !== '' && Number.isFinite(n)) patch[k as keyof BodyMetricsPatch] = n
    }
    if (!Object.keys(patch).length) return
    // Fold the derived masses in so they're persisted alongside the raw entries.
    Object.assign(patch, deriveBodyComp(currentRecord()))
    save.mutate(patch, {
      onSuccess: () => {
        setEdits({})
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
        onSaved?.()
      },
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {INPUTS.map((f) => (
          <label key={f.key} className="block">
            <span className="block text-[9px] uppercase tracking-wide text-muted mb-1">
              {f.label}{f.unit && <span className="opacity-60"> · {f.unit}</span>}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={shown(f.key)}
              onChange={(e) => setEdits((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder="—"
              className="w-full rounded-lg bg-white/[0.03] border border-white/[0.08] px-2 py-2 min-h-[40px]
                         helix-num text-fluid-sm text-text text-center tabular-nums
                         placeholder:text-muted/40 outline-none focus:border-primary/40"
              aria-label={`${f.label}${f.unit ? ` in ${f.unit}` : ''}`}
            />
          </label>
        ))}
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
                  <span className="helix-num block text-fluid-sm font-bold leading-tight" style={{ color: v != null ? TEAL : undefined }}>
                    {v != null ? v : '—'}{v != null && d.unit ? <span className="text-[8px] text-muted font-normal ml-0.5">{d.unit}</span> : null}
                  </span>
                  <span className="text-[8px] uppercase tracking-wide text-muted">{d.label}</span>
                </div>
              )
            })}
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
