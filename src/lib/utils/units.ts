'use client'

import { useEffect, useState } from 'react'

/**
 * The rules with no preference and no hook in them live in `measure.ts`, which
 * carries no `'use client'` and can therefore be called from a route handler.
 * They are re-exported here so every existing client import keeps working —
 * server code must import from `@/lib/utils/measure` directly, because anything
 * reached THROUGH this module is a client reference and throws when called.
 */
export { MIN_VALID_WEIGHT_KG, validWeight, fmtVolume, normalizeSpO2 } from './measure'

/** Weight-unit preference (Settings) — stored in localStorage, read synchronously. */
export function getUnitSystem(): 'kg' | 'lb' {
  if (typeof window === 'undefined') return 'kg'
  const v = window.localStorage.getItem('helix_units') ?? window.localStorage.getItem('apex_units')
  return v === 'lb' ? 'lb' : 'kg'
}

export function weightUnit(): string {
  return getUnitSystem()
}

/**
 * Convert a kg value to the user's unit, preserving 0.25 kg increments.
 * Rounds to 2 dp so quarter-kg microloads (3.75, 16.25 — real cable/dumbbell
 * loads) survive; a value like 16.25 rendered directly no longer collapses to
 * 16.3. Trailing zeros drop naturally since this returns a number (16.5, 78.4).
 */
export function displayWeight(kg: number | null | undefined): number | null {
  if (kg == null || !Number.isFinite(kg)) return null
  return getUnitSystem() === 'lb' ? Math.round(kg * 2.20462 * 100) / 100 : Math.round(kg * 100) / 100
}

/**
 * Reactive unit preference — re-renders the calling component when the user flips
 * kg/lb in Settings (which dispatches `apex-units-change`) or another tab changes it.
 */
export function useUnitSystem(): 'kg' | 'lb' {
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg')
  useEffect(() => {
    const sync = () => setUnit(getUnitSystem())
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener('apex-units-change', sync)
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('apex-units-change', sync) }
  }, [])
  return unit
}
