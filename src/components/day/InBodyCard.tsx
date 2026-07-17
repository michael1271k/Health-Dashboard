'use client'

import { useState } from 'react'
import { Check, ChevronDown, Loader2, Scale } from 'lucide-react'
import { useSaveBodyMetrics, type BodyMetricsPatch, type DayVaultData } from '@/lib/hooks/useDayVault'

const TEAL = '#16F5C3'

const FIELDS: Array<{ key: keyof BodyMetricsPatch; label: string; unit: string }> = [
  { key: 'weight_kg',      label: 'Weight',       unit: 'kg' },
  { key: 'body_fat_pct',   label: 'Body Fat',     unit: '%' },
  { key: 'muscle_percent', label: 'Muscle',       unit: '%' },
  { key: 'water_percent',  label: 'Water',        unit: '%' },
  { key: 'lean_mass_kg',   label: 'Lean Mass',    unit: 'kg' },
  { key: 'bone_mineral',   label: 'Bone Mineral', unit: '%' },
  { key: 'visceral_fat',   label: 'Visceral Fat', unit: 'lvl' },
  { key: 'bmr',            label: 'BMR',          unit: 'kcal' },
  { key: 'bmi',            label: 'BMI',          unit: '' },
]

/**
 * InBody & Scale Metrics — the ONLY manual entry point for the advanced scale
 * numbers Apple Health can't sync (visceral fat, BMR, muscle %, …). Lives
 * exclusively in the Daily Nexus. Collapsed: a one-line reading. Expanded:
 * a minimalist 9-field grid, prefilled from the day, saving only what changed.
 */
export function InBodyCard({ date, log }: { date: string; log: DayVaultData['log'] }) {
  const [open, setOpen] = useState(false)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const save = useSaveBodyMetrics(date)

  const stored = (key: keyof BodyMetricsPatch): string =>
    log?.[key] != null ? String(log[key]) : ''
  const shown = (key: keyof BodyMetricsPatch): string => edits[key] ?? stored(key)
  const dirty = Object.entries(edits).some(([k, v]) => v !== stored(k as keyof BodyMetricsPatch))

  function submit() {
    const patch: BodyMetricsPatch = {}
    for (const [k, v] of Object.entries(edits)) {
      if (v === stored(k as keyof BodyMetricsPatch)) continue
      const n = parseFloat(v)
      if (v.trim() !== '' && Number.isFinite(n)) patch[k as keyof BodyMetricsPatch] = n
    }
    if (!Object.keys(patch).length) return
    save.mutate(patch, {
      onSuccess: () => {
        setEdits({})
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      },
    })
  }

  return (
    <section className="helix-card space-y-2" style={{ borderColor: `${TEAL}26` }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 min-h-[44px] text-left"
      >
        <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: `${TEAL}1a`, color: TEAL }}>
          <Scale className="w-4 h-4" aria-hidden="true" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-heading font-semibold text-fluid-sm text-text">InBody & Scale Metrics</span>
          <span className="block text-[11px] text-muted truncate">
            {log?.weight_kg != null ? `${log.weight_kg} kg` : 'no reading'}
            {log?.body_fat_pct != null && ` · ${log.body_fat_pct}% fat`}
            {log?.visceral_fat != null && ` · VF ${log.visceral_fat}`}
            {log?.bmr != null && ` · ${Math.round(log.bmr)} kcal BMR`}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-muted shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-3 gap-2">
            {FIELDS.map((f) => (
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
      )}
    </section>
  )
}
