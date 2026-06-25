// Types for data arriving from Health Auto Export

export type MetricType =
  | 'sleep'
  | 'active_energy'
  | 'steps'
  | 'heart_rate'
  | 'weight'
  | 'body_fat'
  | 'nutrition'
  | 'water'
  | 'supplement'

export interface HKSample {
  uuid: string        // HealthKit sample UUID (used for dedup)
  startDate: string   // ISO 8601
  endDate: string     // ISO 8601
  value: number
  unit: string
  sourceName: string  // e.g. "Apple Watch", "MyFitnessPal"
  sourceVersion?: string
  device?: string
}

export interface HKSleepSample extends HKSample {
  sleepStage: 'InBed' | 'Asleep' | 'Deep' | 'Core' | 'REM' | 'Awake'
}

export interface HKNutritionSample extends HKSample {
  nutritionType: 'Calories' | 'Protein' | 'Carbohydrates' | 'TotalFat' | 'DietaryFiber'
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
}

// Health Auto Export webhook payload structure
export interface HealthAutoExportPayload {
  data: {
    metrics: HealthMetricGroup[]
    workouts?: unknown[]
  }
}

export interface HealthMetricGroup {
  name: string          // e.g. "active_energy", "weight", "sleep_analysis"
  units: string
  data: HKSample[]
}
