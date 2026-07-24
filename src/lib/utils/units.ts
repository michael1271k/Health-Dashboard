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
 * Session VOLUME → display string, ALWAYS to exactly one decimal place with
 * thousands separators (e.g. "12,102.5"). Never rounds the half-kg away —
 * quarter-kg microloads make genuine .5 volumes. Pure formatter: pass raw kg
 * for the (kg-labelled) draft badges, or `displayWeight(kg)` for unit-aware
 * committed-detail tiles. Callers append their own unit suffix.
 */
export function fmtVolume(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0.0'
  return (Math.round(value * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
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
/**
 * Blood-oxygen unit coercion. `daily_logs.blood_oxygen` holds MIXED units:
 * HealthKit's native bridge historically wrote the raw 0–1 fraction (0.982)
 * while the legacy Shortcut wrote a real percent (97.79). Anything ≤1.5 is
 * therefore a fraction and must be scaled to a percent before display —
 * otherwise 0.982 renders as "1%". Idempotent: 97.79 passes through untouched.
 */
export function normalizeSpO2(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null
  return v <= 1.5 ? Math.round(v * 1000) / 10 : v
}

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
