/**
 * Supplement → micronutrient contributions.
 *
 * Apple Health can't export supplements, so the stack is hardcoded (same reason
 * `supplements.ts` hardcodes the protocol). The moment a supplement is ticked
 * off, its payload lands in the day's micros exactly like a logged food would —
 * previously the Stack tile counted adherence and nothing else, so 470 mg of
 * vitamin C and 5 000 IU of D3 taken every morning were invisible to the micro
 * targets they exist to hit.
 *
 * Values are the LABEL doses of this athlete's actual products, per unit of the
 * protocol's dose (one tab / one cap / one scoop). Nothing here is estimated:
 * an item contributes only what its label states, so a nutrient a product
 * doesn't declare simply isn't credited.
 *
 * Keys match `NUTRIENT_TARGETS[].key` so the two merge without a translation layer.
 */

/** Micronutrient payload of ONE unit of a supplement, keyed by micro target. */
export type NutrientPayload = Readonly<Record<string, number>>

export const SUPPLEMENT_NUTRIENTS: Readonly<Record<string, NutrientPayload>> = {
  // Morning
  multivitamin: { vitaminB12: 300, folate: 680, vitaminC: 470 },   // per tab
  d3k2: { vitaminD: 5000 },                                        // 125 mcg = 5000 IU

  // Pre-workout
  citrulline: { citrulline: 3000 },
  caffeine: { caffeine: 200 },

  // Lunch / post-workout
  omega3: { epa: 500, dha: 250 },
  creatine: { creatine: 5000 },

  // Before bed
  theanine: { theanine: 200 },
  glycine: { glycine: 5000 },
  magnesium: { magnesium: 300 },   // 300 mg elemental, total across 3 tabs
}

/**
 * How many UNITS of an item a dose string represents ("2 caps" → 2).
 *
 * The payloads in SUPPLEMENT_NUTRIENTS are PER PHYSICAL UNIT (one tab / cap / pill /
 * scoop), so a dose that names a *count* of those units genuinely delivers that
 * multiple — the multivitamin's 2-tab days AND the Omega-3's 2 caps both scale.
 *
 * A MASS dose ("300 mg", "3 g", "5 g") is NOT a unit count: the payload for those
 * items is already the total delivered at that mass (magnesium 300 mg is the
 * combined total across three tablets), so mass doses must stay ×1. We therefore
 * multiply ONLY when the unit word is a countable form.
 */
const COUNT_UNIT = /^\s*(\d+(?:\.\d+)?)\s*(tabs?|caps?|capsules?|pills?|scoops?|softgels?|gummies|gummy)\b/i

export function doseUnits(_itemKey: string, dose: string | undefined): number {
  const m = COUNT_UNIT.exec(dose ?? '')
  if (!m) return 1
  const n = parseFloat(m[1])
  return Number.isFinite(n) && n > 0 ? n : 1
}

/**
 * Sum the micronutrients delivered by the supplements taken.
 *
 * `doses` is optional and only matters for the multivitamin; pass the day's
 * resolved protocol (from `protocolForDate`) to honour its 2-tab days.
 *
 * ── THE ARGUMENT IS TAKEN KEYS, AND IT HAS BEEN GIVEN THE OTHER SET ──────────
 * `useSupplements()` returns the keys you SKIPPED — the protocol is what
 * happens unless you say otherwise, so a row only exists to record a refusal.
 * `useStackNutrients` bound that result to a variable called `taken` and passed it
 * straight in here, which inverted the whole thing twice over: the stack
 * contributed nothing on a normal day (no rows ⇒ empty set), and skipping an
 * item credited its micronutrients.
 *
 * Hence `takenKeys` — a name a skipped set cannot be bound to by accident.
 * Callers hold the schedule; resolve `scheduled.filter(i => !skipped.has(i))`
 * on their side, the way the weekly export always has.
 */
export function supplementNutrients(
  takenKeys: Iterable<string>,
  doses?: ReadonlyMap<string, string>,
  /**
   * Per-supplement payloads, overriding the built-in table.
   *
   * The stack lives in `custom_supplements` now, and each row carries its own
   * `micros` jsonb. Without this, correcting a dose in the app would move the
   * checklist and the export while the micro totals kept crediting the label
   * this file was written against — the one place a stale number would be
   * completely invisible.
   */
  payloads: Readonly<Record<string, NutrientPayload>> = SUPPLEMENT_NUTRIENTS,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const key of takenKeys) {
    const payload = payloads[key] ?? SUPPLEMENT_NUTRIENTS[key]
    if (!payload) continue
    const units = doseUnits(key, doses?.get(key))
    for (const [micro, amount] of Object.entries(payload)) {
      out[micro] = (out[micro] ?? 0) + amount * units
    }
  }
  return out
}

/**
 * Merge food-derived micros with supplement-derived ones.
 *
 * Kept separate from `supplementNutrients` so a UI can show the split — "470 / 90 mg
 * vitamin C, 470 of it from the stack" is a more useful statement than a single
 * total, and it makes it obvious when a target is only being met by a pill.
 */
export function mergeNutrients(
  food: Readonly<Record<string, number | null | undefined>>,
  supps: Readonly<Record<string, number>>,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(food)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  }
  for (const [k, v] of Object.entries(supps)) out[k] = (out[k] ?? 0) + v
  return out
}
