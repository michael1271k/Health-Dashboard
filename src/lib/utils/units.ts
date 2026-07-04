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
