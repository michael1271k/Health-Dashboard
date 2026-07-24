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
 * Keys match `MICRO_TARGETS[].key` so the two merge without a translation layer.
 */

/** Micronutrient payload of ONE unit of a supplement, keyed by micro target. */
export type MicroPayload = Readonly<Record<string, number>>

export const SUPPLEMENT_MICROS: Readonly<Record<string, MicroPayload>> = {
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
 * How many UNITS of an item a dose string represents ("2 tabs" → 2).
 *
 * The multivitamin is the only item whose dose varies by weekday, and its
 * payload above is per-tab, so a 2-tab day genuinely delivers double. Anything
 * without a leading count is one unit — the magnesium payload is already the
 * combined total for its three tablets, so it must NOT be multiplied.
 */
export function doseUnits(itemKey: string, dose: string | undefined): number {
  if (itemKey !== 'multivitamin') return 1
  const n = parseFloat(dose ?? '')
  return Number.isFinite(n) && n > 0 ? n : 1
}

/**
 * Sum the micronutrients delivered by the supplements taken.
 *
 * `doses` is optional and only matters for the multivitamin; pass the day's
 * resolved protocol (from `protocolForDate`) to honour its 2-tab days.
 */
export function supplementMicros(
  taken: Iterable<string>,
  doses?: ReadonlyMap<string, string>,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const key of taken) {
    const payload = SUPPLEMENT_MICROS[key]
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
 * Kept separate from `supplementMicros` so a UI can show the split — "470 / 90 mg
 * vitamin C, 470 of it from the stack" is a more useful statement than a single
 * total, and it makes it obvious when a target is only being met by a pill.
 */
export function mergeMicros(
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
