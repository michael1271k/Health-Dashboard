'use client'

import { useEffect, useState } from 'react'

/** Weight-unit preference (Settings) — stored in localStorage, read synchronously. */
export function getUnitSystem(): 'kg' | 'lb' {
  if (typeof window === 'undefined') return 'kg'
  const v = window.localStorage.getItem('helix_units') ?? window.localStorage.getItem('apex_units')
  return v === 'lb' ? 'lb' : 'kg'
}

export function weightUnit(): string {
  return getUnitSystem()
}

/** Convert a kg value to the user's unit (1 dp). */
export function displayWeight(kg: number | null | undefined): number | null {
  if (kg == null || !Number.isFinite(kg)) return null
  return getUnitSystem() === 'lb' ? Math.round(kg * 2.20462 * 10) / 10 : Math.round(kg * 10) / 10
}

/**
 * Global body-weight validity rule: any reading under 50 kg is a
 * scale/ingest artifact (0kg vacation gaps, partial syncs) and must be ignored
 * by every chart, table, and algorithm.
 */
export const MIN_VALID_WEIGHT_KG = 50
export function validWeight(kg: number | null | undefined): number | null {
  if (kg == null || !Number.isFinite(kg) || kg < MIN_VALID_WEIGHT_KG) return null
  return kg
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
