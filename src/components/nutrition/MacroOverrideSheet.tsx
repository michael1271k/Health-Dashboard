'use client'

import { useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { useMacroOverride, type MacroValues } from '@/lib/hooks/useMacroOverride'

type Field = keyof MacroValues

const FIELDS: Array<{ key: Field; label: string; unit: string; color: string }> = [
  { key: 'calories', label: 'Calories', unit: 'kcal', color: MACRO_COLORS.calories },
  { key: 'protein_g', label: 'Protein', unit: 'g', color: MACRO_COLORS.protein },
  { key: 'carbs_g', label: 'Carbs', unit: 'g', color: MACRO_COLORS.carbs },
  { key: 'fat_g', label: 'Fat', unit: 'g', color: MACRO_COLORS.fat },
]

/**
 * Manual macro override sheet — opened by double-tapping any macro on the
 * Nutrition tab or the Daily Nexus. Edits cascade globally (DB → daily score →
 * weekly trends → coach) via useMacroOverride, and are protected from HealthKit
 * re-sync clobber. `focus` autofocuses the tapped macro.
 */
export function MacroOverrideSheet({ open, onClose, date, initial, focus }: {
  open: boolean
  onClose: () => void
  date: string
  initial: MacroValues
  focus?: Field
}) {
  const override = useMacroOverride(date)
  const [vals, setVals] = useState<Record<Field, string>>({
    calories: '', protein_g: '', carbs_g: '', fat_g: '',
  })

  // Reseed the inputs from the day's current values each time the sheet opens.
  useEffect(() => {
    if (open) {
      setVals({
        calories: String(Math.round(initial.calories || 0)),
        protein_g: String(Math.round(initial.protein_g || 0)),
        carbs_g: String(Math.round(initial.carbs_g || 0)),
        fat_g: String(Math.round(initial.fat_g || 0)),
      })
      override.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const save = () => {
    override.mutate(
      {
        calories: Number(vals.calories) || 0,
        protein_g: Number(vals.protein_g) || 0,
        carbs_g: Number(vals.carbs_g) || 0,
        fat_g: Number(vals.fat_g) || 0,
      },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title="Edit today's macros">
      <p className="text-fluid-xs text-muted mb-4">
        Manually override the day. Saves to your log, recalculates your Daily Score, and updates
        weekly trends — and won&apos;t be overwritten by the next Apple Health sync.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: f.color }}>{f.label}</span>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/60">
              <input
                type="number"
                inputMode="numeric"
                autoFocus={focus === f.key}
                value={vals[f.key]}
                onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                className="w-full bg-transparent text-text text-fluid-lg helix-num font-bold outline-none min-w-0"
                aria-label={f.label}
              />
              <span className="text-fluid-xs text-muted shrink-0">{f.unit}</span>
            </div>
          </label>
        ))}
      </div>

      {override.isError && (
        <p className="text-danger text-fluid-xs mt-3" role="alert">
          {override.error instanceof Error ? override.error.message : 'Save failed'}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={override.isPending}
        className="btn-primary w-full justify-center min-h-[48px] mt-4 disabled:opacity-50"
      >
        {override.isPending ? 'Saving…' : 'Save & recalculate'}
      </button>
    </Sheet>
  )
}
