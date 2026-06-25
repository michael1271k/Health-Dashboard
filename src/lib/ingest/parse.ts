import type { HealthMetricGroup } from './schema'

// Extract date string (YYYY-MM-DD) from ISO datetime
export function toDate(isoString: string): string {
  return isoString.slice(0, 10)
}

// Group daily aggregates by date for active energy + steps + HR
export interface DailyAggregate {
  date: string
  steps?: number
  activeCal?: number
  restHr?: number
}

export function parseDailyMetrics(groups: HealthMetricGroup[]): DailyAggregate[] {
  const byDate = new Map<string, DailyAggregate>()

  for (const group of groups) {
    const metricName = group.name.toLowerCase().replace(/\s+/g, '_')

    for (const sample of group.data) {
      const date = toDate(sample.startDate)
      const existing = byDate.get(date) ?? { date }

      if (metricName.includes('step')) {
        existing.steps = (existing.steps ?? 0) + Math.round(sample.value)
      } else if (metricName.includes('active_energy')) {
        existing.activeCal = (existing.activeCal ?? 0) + Math.round(sample.value)
      } else if (metricName.includes('resting_heart')) {
        // Take average for resting HR
        existing.restHr = existing.restHr
          ? Math.round((existing.restHr + sample.value) / 2)
          : Math.round(sample.value)
      }

      byDate.set(date, existing)
    }
  }

  return Array.from(byDate.values())
}

export interface ParsedSleepSession {
  hkUuid?: string
  startTime: string
  endTime: string
  durationMin: number
  deepMin: number
  remMin: number
  coreMin: number
  awakeMin: number
}

// Return the "sleep night" date: segments starting before noon belong to the previous night
// e.g. a deep-sleep segment at 01:00 Jan 16 is part of the Jan 15 sleep night
function toSleepNightDate(isoString: string): string {
  const date = new Date(isoString)
  const hourUtc = date.getUTCHours()
  if (hourUtc < 12) {
    // Before noon → belongs to previous calendar night
    const prev = new Date(date)
    prev.setUTCDate(prev.getUTCDate() - 1)
    return prev.toISOString().slice(0, 10)
  }
  return isoString.slice(0, 10)
}

export function parseSleepSessions(groups: HealthMetricGroup[]): ParsedSleepSession[] {
  const sleepGroup = groups.find(
    (g) => g.name.toLowerCase().includes('sleep'),
  )
  if (!sleepGroup) return []

  // Group by sleep night date, accumulate stage minutes
  const byDate = new Map<string, ParsedSleepSession>()

  for (const sample of sleepGroup.data) {
    const date = toSleepNightDate(sample.startDate)
    const durationMin = Math.round(
      (new Date(sample.endDate).getTime() - new Date(sample.startDate).getTime()) / 60000,
    )

    if (durationMin <= 0) continue

    const existing = byDate.get(date) ?? {
      hkUuid: sample.uuid,
      startTime: sample.startDate,
      endTime: sample.endDate,
      durationMin: 0,
      deepMin: 0,
      remMin: 0,
      coreMin: 0,
      awakeMin: 0,
    }

    // Update time range
    if (sample.startDate < existing.startTime) existing.startTime = sample.startDate
    if (sample.endDate > existing.endTime) existing.endTime = sample.endDate
    existing.durationMin += durationMin

    const stage = (sample as { sleepStage?: string }).sleepStage?.toLowerCase() ?? ''
    if (stage.includes('deep') || stage.includes('asleepdeep')) {
      existing.deepMin += durationMin
    } else if (stage.includes('rem') || stage.includes('asleepr')) {
      existing.remMin += durationMin
    } else if (stage.includes('core') || stage.includes('asleepcore') || stage.includes('asleep')) {
      existing.coreMin += durationMin
    } else if (stage.includes('awake')) {
      existing.awakeMin += durationMin
    } else {
      // Unknown stage counts as core
      existing.coreMin += durationMin
    }

    byDate.set(date, existing)
  }

  return Array.from(byDate.values())
}

export interface ParsedNutrition {
  date: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG?: number
}

export function parseNutrition(groups: HealthMetricGroup[]): ParsedNutrition[] {
  const byDate = new Map<string, ParsedNutrition>()

  for (const group of groups) {
    const name = group.name.toLowerCase().replace(/\s+/g, '_')
    const isCalories = name.includes('energy') && name.includes('diet')
    const isProtein = name.includes('protein')
    const isCarbs = name.includes('carb')
    const isFat = name.includes('fat')
    const isFiber = name.includes('fiber')

    if (!isCalories && !isProtein && !isCarbs && !isFat && !isFiber) continue

    for (const sample of group.data) {
      const date = toDate(sample.startDate)
      const existing = byDate.get(date) ?? {
        date,
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
      }

      if (isCalories) existing.calories += sample.value
      if (isProtein) existing.proteinG += sample.value
      if (isCarbs) existing.carbsG += sample.value
      if (isFat) existing.fatG += sample.value
      if (isFiber) existing.fiberG = (existing.fiberG ?? 0) + sample.value

      byDate.set(date, existing)
    }
  }

  return Array.from(byDate.values())
}

export interface ParsedBodyComp {
  hkUuid?: string
  measuredAt: string
  date: string
  weightKg: number
  bodyFatPct?: number
}

export function parseBodyComposition(groups: HealthMetricGroup[]): ParsedBodyComp[] {
  const weightGroup = groups.find((g) => g.name.toLowerCase().includes('body_mass') || g.name.toLowerCase().includes('weight'))
  if (!weightGroup) return []

  return weightGroup.data.map((sample) => ({
    hkUuid: sample.uuid,
    measuredAt: sample.startDate,
    date: toDate(sample.startDate),
    weightKg: sample.value,
  }))
}

export interface ParsedWater {
  hkUuid?: string
  loggedAt: string
  date: string
  amountMl: number
}

export function parseWater(groups: HealthMetricGroup[]): ParsedWater[] {
  const waterGroup = groups.find((g) => g.name.toLowerCase().includes('water'))
  if (!waterGroup) return []

  return waterGroup.data
    .filter((s) => s.value > 0)
    .map((sample) => ({
      hkUuid: sample.uuid,
      loggedAt: sample.startDate,
      date: toDate(sample.startDate),
      // Health Auto Export exports water in mL or fl oz depending on Health settings
      // Assuming mL (Israel uses metric); if unit is 'fl_oz', multiply by 29.5735
      amountMl: sample.unit?.toLowerCase().includes('fl') ? sample.value * 29.5735 : sample.value,
    }))
}
