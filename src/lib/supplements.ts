/** Hardcoded daily supplement protocol (Apple Health can't export meds/supps). */
import { EMERALD, STEEL, SAPPHIRE, AMETHYST } from '@/lib/theme/palette'

export interface Supplement {
  key: string
  name: string
  dose: string
  /** Renders/counts only on training days (drives the pre-workout stimulants). */
  trainingOnly?: boolean
}
export interface SupplementSlot { key: string; time: string; label: string; accent: string; items: Supplement[] }

/**
 * The real stack, with the doses that actually get taken. Each item's
 * micronutrient payload lives in `nutrition/supplementMicros.ts`, keyed by the
 * SAME `key` — so ticking one off credits the day's micros immediately.
 */
export const SUPPLEMENT_PROTOCOL: SupplementSlot[] = [
  { key: 'morning', time: '10:30', label: 'Morning', accent: EMERALD, items: [
    { key: 'multivitamin', name: 'Two Per Day Multivitamin', dose: '1 tab' },
    { key: 'd3k2', name: 'Vitamin D3 + K2', dose: '125 mcg' },
  ] },
  { key: 'pre', time: '11:45', label: 'Pre-Workout', accent: STEEL, items: [
    { key: 'citrulline', name: 'L-Citrulline', dose: '3 g', trainingOnly: true },
    { key: 'caffeine', name: 'Nutricost Caffeine', dose: '200 mg', trainingOnly: true },
  ] },
  { key: 'post', time: '15:00', label: 'Lunch / Post-Workout', accent: SAPPHIRE, items: [
    { key: 'creatine', name: 'Creatine Monohydrate', dose: '5 g' },
    { key: 'omega3', name: 'Omega-3 Fish Oil', dose: '1 cap' },
  ] },
  { key: 'night', time: '22:00', label: 'Before Bed', accent: AMETHYST, items: [
    // 300 mg elemental across three tablets — one checkbox, the full dose.
    { key: 'magnesium', name: 'Magnesium Glycinate', dose: '300 mg' },
    { key: 'glycine', name: 'Glycine', dose: '5 g' },
    { key: 'theanine', name: 'L-Theanine', dose: '200 mg' },
  ] },
]

export const ALL_SUPPLEMENT_KEYS = SUPPLEMENT_PROTOCOL.flatMap((s) => s.items.map((i) => i.key))
export const TOTAL_SUPPLEMENTS = ALL_SUPPLEMENT_KEYS.length

/**
 * The protocol for a given day. On rest days the training-only stimulants
 * (pre-workout caffeine + citrulline) are dropped, and any slot left empty is
 * removed. The Multivitamin is 1 tab daily EXCEPT Monday & Friday (2 tabs).
 * Callers pass `isTraining` (from programs.isTrainingDay) + the weekday so this
 * file stays a pure leaf with no schedule dependency.
 */
export function protocolForDate(isTraining: boolean, weekday: number = new Date().getDay()): SupplementSlot[] {
  const multiDose = weekday === 1 || weekday === 5 ? '2 tabs' : '1 tab'
  const withDose = (slot: SupplementSlot): SupplementSlot => ({
    ...slot,
    items: slot.items.map((i) => (i.key === 'multivitamin' ? { ...i, dose: multiDose } : i)),
  })
  const base = isTraining
    ? SUPPLEMENT_PROTOCOL
    : SUPPLEMENT_PROTOCOL.map((slot) => ({ ...slot, items: slot.items.filter((i) => !i.trainingOnly) }))
  return base.map(withDose).filter((slot) => slot.items.length > 0)
}

/** How many supplements are scheduled for the day (denominator for the Stack tile). */
export function supplementCountForDate(isTraining: boolean): number {
  return protocolForDate(isTraining).reduce((n, s) => n + s.items.length, 0)
}

/** Has a slot's scheduled time ("HH:MM") passed in the DEVICE's local time? (for auto-log) */
export function slotTimePassed(hhmm: string): boolean {
  const [h, m] = hhmm.split(':').map(Number)
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m
}
