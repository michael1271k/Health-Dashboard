'use client'

import { useEffect, useState } from 'react'

/** Weight-unit preference (Settings) — stored in localStorage, read synchronously. */
export function getUnitSystem(): 'kg' | 'lb' {
  if (typeof window === 'undefined') return 'kg'
  return window.localStorage.getItem('apex_units') === 'lb' ? 'lb' : 'kg'
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
