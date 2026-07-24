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
export interface MicroTarget {
  key: string
  label: string
  target: number
  unit: string
  kind: 'floor' | 'ceiling'
  color: string
  why: string
  hkType?: string
}

export const MICRO_TARGETS: MicroTarget[] = [
  { key: 'fiber', label: 'Fiber', target: 30, unit: 'g', kind: 'floor', color: '#3E9E7A',
    why: '~14 g per 1000 kcal (~27 g at 1955 kcal), rounded up for satiety + gut health on a cut.',
    hkType: 'HKQuantityTypeIdentifierDietaryFiber' },
  { key: 'protein', label: 'Protein', target: 170, unit: 'g', kind: 'floor', color: '#E0703C',
    why: '~2.6 g/kg — high end to preserve lean mass in an aggressive deficit.',
    hkType: 'HKQuantityTypeIdentifierDietaryProtein' },
  { key: 'sodium', label: 'Sodium', target: 3000, unit: 'mg', kind: 'ceiling', color: '#D4AF37',
    why: 'Adequate ~1500 mg; up to ~3000 mg is fine given training-sweat losses. Ceiling, not a goal.',
    hkType: 'HKQuantityTypeIdentifierDietarySodium' },
  { key: 'potassium', label: 'Potassium', target: 3400, unit: 'mg', kind: 'floor', color: '#8E9AAC',
    why: 'Male AI 3400 mg — supports blood pressure + cramp prevention while cutting.',
    hkType: 'HKQuantityTypeIdentifierDietaryPotassium' },
  { key: 'calcium', label: 'Calcium', target: 1000, unit: 'mg', kind: 'floor', color: '#3D7AB8',
    why: 'RDA 1000 mg — bone load management under heavy lifting.',
    hkType: 'HKQuantityTypeIdentifierDietaryCalcium' },
  { key: 'iron', label: 'Iron', target: 10, unit: 'mg', kind: 'floor', color: '#C4514E',
    why: 'Male RDA 8 mg, nudged to 10 mg for training-related turnover.',
    hkType: 'HKQuantityTypeIdentifierDietaryIron' },
  { key: 'magnesium', label: 'Magnesium', target: 400, unit: 'mg', kind: 'floor', color: '#8E9AAC',
    why: 'RDA ~400 mg — neuromuscular function + sleep quality on a deficit.',
    hkType: 'HKQuantityTypeIdentifierDietaryMagnesium' },
  { key: 'vitaminC', label: 'Vitamin C', target: 90, unit: 'mg', kind: 'floor', color: '#D4AF37',
    why: 'RDA 90 mg — connective-tissue + immune support under training stress.',
    hkType: 'HKQuantityTypeIdentifierDietaryVitaminC' },
  { key: 'vitaminD', label: 'Vitamin D', target: 2000, unit: 'IU', kind: 'floor', color: '#D4AF37',
    why: 'RDA 600 IU; 1000–2000 IU is the practical optimum for strength + immunity.',
    hkType: 'HKQuantityTypeIdentifierDietaryVitaminD' },
  { key: 'satFat', label: 'Saturated Fat', target: 20, unit: 'g', kind: 'ceiling', color: '#C4514E',
    why: '<10 % of kcal (~22 g at 1955 kcal). Ceiling — keep most fat unsaturated.',
    hkType: 'HKQuantityTypeIdentifierDietaryFatSaturated' },
  { key: 'sugar', label: 'Added Sugar', target: 40, unit: 'g', kind: 'ceiling', color: '#B4522A',
    why: '<10 % of kcal; lower is better on a cut. Ceiling, not a goal.',
    hkType: 'HKQuantityTypeIdentifierDietarySugar' },
]

/**
 * Passive HealthKit signals (not diet) worth surfacing on the deep-dive — these
 * ARE already modelled on daily_logs, so they render as soon as data exists.
 */
export interface MicroSignal {
  key: string
  label: string
  unit: string
  reference: string
  color: string
}

export const MICRO_SIGNALS: MicroSignal[] = [
  { key: 'wrist_temp_delta', label: 'Wrist Temp Δ', unit: '°C', reference: '±0.3 °C is normal; a spike can flag illness/overreaching', color: '#C4514E' },
  { key: 'time_in_daylight_min', label: 'Daylight', unit: 'min', reference: 'Aim ≥ 30 min — circadian + vitamin-D synthesis', color: '#D4AF37' },
  { key: 'hrv_ms', label: 'HRV', unit: 'ms', reference: 'Higher vs your baseline = better recovery', color: '#3D7AB8' },
  { key: 'blood_oxygen', label: 'Blood O₂', unit: '%', reference: '95–100 % typical at rest', color: '#3E9E7A' },
  { key: 'respiratory_rate', label: 'Resp Rate', unit: '/min', reference: '12–20 /min at rest', color: '#E0703C' },
  { key: 'heart_rate_recovery', label: 'HR Recovery', unit: 'bpm', reference: '1-min drop; higher = fitter', color: '#8E9AAC' },
]
