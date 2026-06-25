import { z } from 'zod'

// Health Auto Export sends POST with JSON body in this structure:
// { "data": { "metrics": [...], "workouts": [...] } }
// Each metric has a "name" and an array of "data" entries with typed fields.

export const HKSampleSchema = z.object({
  uuid: z.string().optional(),          // may be absent in some Health Auto Export versions
  startDate: z.string(),
  endDate: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  sourceName: z.string().optional(),
  sourceVersion: z.string().optional(),
  device: z.string().optional(),
})

export const HKSleepSampleSchema = HKSampleSchema.extend({
  sleepStage: z
    .enum(['InBed', 'Asleep', 'AsleepDeep', 'AsleepCore', 'AsleepREM', 'Awake'])
    .optional(),
  // Health Auto Export uses value=0 for InBed, 1=Asleep, etc. in some versions
})

export const HKNutritionSampleSchema = HKSampleSchema.extend({
  nutritionType: z.string().optional(),
  mealType: z
    .enum(['breakfast', 'lunch', 'dinner', 'snack', 'unknown'])
    .optional(),
})

export const HealthMetricGroupSchema = z.object({
  name: z.string(),
  units: z.string().optional(),
  data: z.array(HKSampleSchema),
})

export const HealthAutoExportPayloadSchema = z.object({
  data: z.object({
    metrics: z.array(HealthMetricGroupSchema),
    workouts: z.array(z.unknown()).optional(),
  }),
})

export type HealthAutoExportPayload = z.infer<typeof HealthAutoExportPayloadSchema>
export type HealthMetricGroup = z.infer<typeof HealthMetricGroupSchema>
export type HKSample = z.infer<typeof HKSampleSchema>

// Known metric names from Health Auto Export
export const METRIC_NAMES = {
  ACTIVE_ENERGY: 'active_energy_burned',
  STEPS: 'step_count',
  RESTING_HR: 'resting_heart_rate',
  WEIGHT: 'body_mass',
  BODY_FAT: 'body_fat_percentage',
  SLEEP: 'sleep_analysis',
  WATER: 'dietary_water',
  DIETARY_ENERGY: 'dietary_energy',
  PROTEIN: 'dietary_protein',
  CARBS: 'dietary_carbohydrates',
  FAT: 'dietary_fat_total',
  FIBER: 'dietary_fiber',
  // Supplement tracking
  SUPPLEMENT: 'supplement',
} as const

export type MetricName = typeof METRIC_NAMES[keyof typeof METRIC_NAMES]
