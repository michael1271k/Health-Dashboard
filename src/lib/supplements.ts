/**
 * The supplement protocol.
 *
 * THE STACK LIVES IN THE DATABASE — `custom_supplements`, one row per item,
 * editable in the app. `SUPPLEMENT_PROTOCOL` below is now only the SEED: the
 * shape the table is initialised with by `scripts/seed-supplement-stack.mts`,
 * and the fallback rendered when the table is empty or unreachable.
 *
 * WHY IT MOVED. The list was hardcoded because Apple Health cannot export
 * supplements — true, and irrelevant to whether the user can edit their own
 * doses. L-Citrulline was frozen at 3 g in every surface while the actual dose
 * was 6 g, and there was no way to correct it short of a code change and a
 * deploy. A number the app states about the user, that the user cannot change,
 * will eventually be wrong and stay wrong.
 *
 * `key` is the identity that must survive everything: `supplement_log.item_key`
 * and `SUPPLEMENT_NUTRIENTS` are both keyed by it, so the seeded rows carry these
 * exact strings in `schedule.key` and months of ticked history keeps resolving.
 */
import { EMERALD, STEEL, SAPPHIRE, AMETHYST } from '@/lib/theme/palette'

export interface Supplement {
  key: string
  name: string
  dose: string
  /** Renders/counts only on training days (drives the pre-workout stimulants). */
  trainingOnly?: boolean
  /** A rule the dose alone can't state — "2 on Monday & Friday", "empty stomach". */
  notes?: string
  /** `custom_supplements.id`, present for anything read from the DB. Enables edit. */
  customId?: string
}
export interface SupplementSlot { key: string; time: string; label: string; accent: string; items: Supplement[] }

/**
 * The seed stack, with the doses this athlete started from. Each item's
 * micronutrient payload lives in `nutrition/supplementNutrients.ts`, keyed by the
 * SAME `key` — so ticking one off credits the day's micros immediately.
 *
 * EDITING THIS FILE NO LONGER CHANGES THE APP for a seeded database. It changes
 * what a fresh one is seeded WITH. To change a dose, edit it in the app.
 */
export const SUPPLEMENT_PROTOCOL: SupplementSlot[] = [
  { key: 'morning', time: '10:30', label: 'Morning', accent: EMERALD, items: [
    { key: 'multivitamin', name: 'Two Per Day Multivitamin', dose: '1 tab', notes: '2 tabs on Monday & Friday (Leg Days)' },
    { key: 'd3k2', name: 'Vitamin D3 + K2', dose: '125 mcg' },
  ] },
  { key: 'pre', time: '11:45', label: 'Pre-Workout', accent: STEEL, items: [
    { key: 'citrulline', name: 'L-Citrulline', dose: '3 g', trainingOnly: true },
    { key: 'caffeine', name: 'Nutricost Caffeine', dose: '200 mg', trainingOnly: true },
  ] },
  { key: 'post', time: '15:00', label: 'Lunch / Post-Workout', accent: SAPPHIRE, items: [
    { key: 'creatine', name: 'Creatine Monohydrate', dose: '5 g' },
    // Two caps — the SUPPLEMENT_NUTRIENTS payload (EPA 500 / DHA 250) is PER cap,
    // and doseUnits multiplies count-units, so this delivers EPA 1000 / DHA 500.
    { key: 'omega3', name: 'Omega-3 Fish Oil', dose: '2 caps' },
  ] },
  { key: 'night', time: '22:00', label: 'Before Bed', accent: AMETHYST, items: [
    // 300 mg elemental across three tablets — one checkbox, the full dose.
    { key: 'magnesium', name: 'Magnesium Glycinate', dose: '300 mg' },
    { key: 'glycine', name: 'Glycine', dose: '5 g' },
    { key: 'theanine', name: 'L-Theanine', dose: '200 mg' },
  ] },
]

export const ALL_SUPPLEMENT_KEYS = SUPPLEMENT_PROTOCOL.flatMap((s) => s.items.map((i) => i.key))

/**
 * The SEED protocol for a given day — the fallback, not the source.
 *
 * On rest days the training-only stimulants (pre-workout caffeine +
 * citrulline) are dropped, and any slot left empty is removed. The Multivitamin
 * is 1 tab daily EXCEPT Monday & Friday (2 tabs). Callers pass `isTraining`
 * (from programs.isTrainingDay) + the weekday so this file stays a pure leaf
 * with no schedule dependency.
 *
 * Prefer {@link stackForDate}, which reads the database and falls back here.
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

/**
 * The day's stack: the user's own rows when there are any, the seed otherwise.
 *
 * ONE resolver, so the checklist, the micro totals, the Stack tile's denominator
 * and the weekly export cannot disagree about what is being taken. `dbSlots` is
 * whatever `customSlotsForDate` produced; an empty array means the table has not
 * been seeded (or could not be read), and falling back to the hardcoded protocol
 * is strictly better than showing a user with a real stack an empty list.
 */
export function stackForDate(
  dbSlots: SupplementSlot[],
  isTraining: boolean,
  weekday: number = new Date().getDay(),
): SupplementSlot[] {
  return dbSlots.length ? dbSlots : protocolForDate(isTraining, weekday)
}

/** How many supplements are scheduled for the day (denominator for the Stack tile). */
export function supplementCountForDate(isTraining: boolean, dbSlots: SupplementSlot[] = []): number {
  return stackForDate(dbSlots, isTraining).reduce((n, s) => n + s.items.length, 0)
}

/** Has a slot's scheduled time ("HH:MM") passed in the DEVICE's local time? (for auto-log) */
export function slotTimePassed(hhmm: string): boolean {
  const [h, m] = hhmm.split(':').map(Number)
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m
}
