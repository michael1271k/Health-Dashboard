/**
 * Scientifically-grounded daily micronutrient targets for THIS athlete:
 * 23yo male, 170 cm, 65.2 kg, 17.8 % BF, aggressive ~50-day cut (~1955 kcal),
 * resistance training 5×/week. Values are evidence-based (RDA/AI + sport-
 * nutrition adjustments for a lifting cut) — a floor to hit, or a ceiling to
 * stay under. Rationale is shown in the UI so the number is never a black box.
 *
 * `kind`: 'floor' = aim to reach; 'ceiling' = stay at/under.
 * `hkType`: the HealthKit identifier that would feed `value` once a paid
 * Apple Developer account re-enables HealthKit (free team has it disabled).
 */
/**
 * ── WHY THESE CARRY NO COLOUR ────────────────────────────────────────────────
 * Every entry used to hold its own `color`, and twenty nutrients were sharing
 * about seven hues — so the colour could not identify the nutrient (several
 * looked identical) while the LABEL already did, perfectly, every time.
 *
 * Colour now encodes STATE, not identity: under target, on target, over a
 * ceiling. That is the one thing the label cannot tell you at a glance, and it
 * is the reason you opened the page.
 */
export type MicroGroup = 'Fuel' | 'Electrolytes' | 'Vitamins & minerals' | 'Performance stack'

/** Render order of the bands. */
export const MICRO_GROUPS: readonly MicroGroup[] = [
  'Fuel', 'Electrolytes', 'Vitamins & minerals', 'Performance stack',
] as const

export interface MicroTarget {
  key: string
  label: string
  target: number
  unit: string
  kind: 'floor' | 'ceiling'
  /**
   * Which band this nutrient renders under. Twenty nutrients in one flat grid
   * is a wall; four named bands is a page you can skim for the one you came for.
   */
  group: MicroGroup
  why: string
  hkType?: string
  /**
   * True when this nutrient comes from the supplement stack rather than food.
   * Split out in the UI because "you hit 470/90 mg vitamin C" means something
   * different when a tablet supplied all of it.
   */
  fromStack?: boolean
}

export const MICRO_TARGETS: MicroTarget[] = [
  { key: 'fiber', label: 'Fiber', target: 30, unit: 'g', kind: 'floor', group: 'Fuel',
    why: '~14 g per 1000 kcal (~27 g at 1955 kcal), rounded up for satiety + gut health on a cut.',
    hkType: 'HKQuantityTypeIdentifierDietaryFiber' },
  { key: 'protein', label: 'Protein', target: 170, unit: 'g', kind: 'floor', group: 'Fuel',
    why: '~2.6 g/kg — high end to preserve lean mass in an aggressive deficit.',
    hkType: 'HKQuantityTypeIdentifierDietaryProtein' },
  { key: 'sodium', label: 'Sodium', target: 3000, unit: 'mg', kind: 'ceiling', group: 'Electrolytes',
    why: 'Adequate ~1500 mg; up to ~3000 mg is fine given training-sweat losses. Ceiling, not a goal.',
    hkType: 'HKQuantityTypeIdentifierDietarySodium' },
  { key: 'potassium', label: 'Potassium', target: 3400, unit: 'mg', kind: 'floor', group: 'Electrolytes',
    why: 'Male AI 3400 mg — supports blood pressure + cramp prevention while cutting.',
    hkType: 'HKQuantityTypeIdentifierDietaryPotassium' },
  { key: 'calcium', label: 'Calcium', target: 1000, unit: 'mg', kind: 'floor', group: 'Electrolytes',
    why: 'RDA 1000 mg — bone load management under heavy lifting.',
    hkType: 'HKQuantityTypeIdentifierDietaryCalcium' },
  { key: 'iron', label: 'Iron', target: 10, unit: 'mg', kind: 'floor', group: 'Vitamins & minerals',
    why: 'Male RDA 8 mg, nudged to 10 mg for training-related turnover.',
    hkType: 'HKQuantityTypeIdentifierDietaryIron' },
  { key: 'magnesium', label: 'Magnesium', target: 400, unit: 'mg', kind: 'floor', group: 'Electrolytes',
    why: 'RDA ~400 mg — neuromuscular function + sleep quality on a deficit.',
    hkType: 'HKQuantityTypeIdentifierDietaryMagnesium' },
  { key: 'vitaminC', label: 'Vitamin C', target: 90, unit: 'mg', kind: 'floor', group: 'Vitamins & minerals',
    why: 'RDA 90 mg — connective-tissue + immune support under training stress.',
    hkType: 'HKQuantityTypeIdentifierDietaryVitaminC' },
  { key: 'vitaminD', label: 'Vitamin D', target: 2000, unit: 'IU', kind: 'floor', group: 'Vitamins & minerals',
    why: 'RDA 600 IU; 1000–2000 IU is the practical optimum for strength + immunity.',
    hkType: 'HKQuantityTypeIdentifierDietaryVitaminD' },
  { key: 'satFat', label: 'Saturated Fat', target: 20, unit: 'g', kind: 'ceiling', group: 'Fuel',
    why: '<10 % of kcal (~22 g at 1955 kcal). Ceiling — keep most fat unsaturated.',
    hkType: 'HKQuantityTypeIdentifierDietaryFatSaturated' },
  { key: 'sugar', label: 'Added Sugar', target: 40, unit: 'g', kind: 'ceiling', group: 'Fuel',
    why: '<10 % of kcal; lower is better on a cut. Ceiling, not a goal.',
    hkType: 'HKQuantityTypeIdentifierDietarySugar' },

  // ── Delivered by the supplement stack ──────────────────────────────────────
  // These light up the instant the matching item is ticked off in the Stack —
  // see nutrition/supplementMicros.ts for each product's label dose.
  { key: 'vitaminB12', label: 'Vitamin B12', target: 2.4, unit: 'mcg', kind: 'floor', group: 'Vitamins & minerals',
    why: 'RDA 2.4 mcg. The multivitamin supplies 300 mcg — far above the floor, which is normal for B12 (no toxicity ceiling).',
    fromStack: true },
  { key: 'folate', label: 'Folate', target: 400, unit: 'mcg', kind: 'floor', group: 'Vitamins & minerals',
    why: 'RDA 400 mcg DFE — red-cell turnover under training load. Multivitamin supplies 680 mcg.',
    fromStack: true },
  { key: 'epa', label: 'EPA', target: 500, unit: 'mg', kind: 'floor', group: 'Performance stack',
    why: 'Anti-inflammatory omega-3; ~500 mg/day is the practical floor alongside DHA on a deficit.',
    fromStack: true },
  { key: 'dha', label: 'DHA', target: 250, unit: 'mg', kind: 'floor', group: 'Performance stack',
    why: 'EFSA adequate intake 250 mg/day — neural + membrane support.',
    fromStack: true },
  { key: 'creatine', label: 'Creatine', target: 5000, unit: 'mg', kind: 'floor', group: 'Performance stack',
    why: '5 g/day maintenance — the single best-evidenced strength and lean-mass supplement, and it matters MORE in a deficit.',
    fromStack: true },
  { key: 'citrulline', label: 'L-Citrulline', target: 3000, unit: 'mg', kind: 'floor', group: 'Performance stack',
    why: 'Protocol dose, training days only. 3 g pre-workout for blood flow and rep endurance.',
    fromStack: true },
  { key: 'caffeine', label: 'Caffeine', target: 400, unit: 'mg', kind: 'ceiling', group: 'Performance stack',
    why: 'Protocol dose 200 mg pre-workout. Ceiling 400 mg/day — beyond that it starts costing the sleep this whole system is built on.',
    fromStack: true },
  { key: 'theanine', label: 'L-Theanine', target: 200, unit: 'mg', kind: 'floor', group: 'Performance stack',
    why: 'Protocol dose 200 mg before bed — sleep-onset latency without sedation.',
    fromStack: true },
  { key: 'glycine', label: 'Glycine', target: 3000, unit: 'mg', kind: 'floor', group: 'Performance stack',
    why: '3 g before bed lowers core temperature and improves sleep quality; the stack supplies 5 g.',
    fromStack: true },
]

/**
 * Passive HealthKit signals (not diet) — already modelled on `daily_logs`, so
 * they carry a value as soon as data exists.
 *
 * These used to render on the Micros deep-dive AND in Vitals. Vitals is now the
 * only place they appear: nothing on a nutrition page acts on HRV, and a number
 * shown twice is a number you have to reconcile. What survives here is the
 * REFERENCE COPY — the one-line "what counts as normal" for each signal, which
 * Vitals reads. That copy is the reason this list is not simply deleted: the
 * wrist-temp entry below encodes a correction that was expensive to find.
 */
export interface MicroSignal {
  key: string
  label: string
  unit: string
  reference: string
  color: string
}

export const MICRO_SIGNALS: MicroSignal[] = [
  // The column is named `wrist_temp_delta` but holds the night's ABSOLUTE
  // average in °C — ingest writes HealthKit's AppleSleepingWristTemperature
  // straight through (see lib/ingest/dailyLog.ts:192). The label and the
  // reference both took the column name at its word, so the deep-dive rendered
  // "36.2 °C" beside "±0.3 °C is normal" and every ordinary night read as an
  // anomaly. Renaming the column is paste-SQL against a live table for no
  // functional gain; describing it correctly costs nothing.
  { key: 'wrist_temp_delta', label: 'Wrist Temp', unit: '°C', reference: 'Absolute sleeping temp — the shift vs your own baseline is the signal', color: '#C4514E' },
  { key: 'time_in_daylight_min', label: 'Daylight', unit: 'min', reference: 'Aim ≥ 30 min — circadian + vitamin-D synthesis', color: '#D4AF37' },
  { key: 'hrv_ms', label: 'HRV', unit: 'ms', reference: 'Higher vs your baseline = better recovery', color: '#3D7AB8' },
  { key: 'blood_oxygen', label: 'Blood O₂', unit: '%', reference: '95–100 % typical at rest', color: '#3E9E7A' },
  { key: 'respiratory_rate', label: 'Resp Rate', unit: '/min', reference: '12–20 /min at rest', color: '#E0703C' },
]
