import { describe, it, expect } from 'vitest'
import { buildWeeklyExport, type WeeklyExportInput, type ExportDay } from '@/lib/reports/weeklyExport'
import { stallProtocol, rollingAverage, type DayPoint, type SessionPoint } from '@/lib/coach/insights'

const day = (date: string, p: Partial<DayPoint>): DayPoint => ({
  date, sleepMin: null, restHr: null, respiratory: null, weightKg: null,
  calories: null, calorieGoal: null, ...p,
})

/** n days of a perfectly flat weight — a genuine stall. */
function flatWeeks(days: number, kg: number, extra: Partial<DayPoint> = {}): DayPoint[] {
  return Array.from({ length: days }, (_, i) =>
    day(`2026-06-${String(i + 1).padStart(2, '0')}`, { weightKg: kg, ...extra }))
}

describe('rollingAverage', () => {
  it('produces a 7-day window series', () => {
    expect(rollingAverage([1, 2, 3, 4, 5, 6, 7], 7)).toEqual([4])
    expect(rollingAverage([1, 2, 3], 7)).toEqual([])
  })
})

describe('stallProtocol — one lever, never a list', () => {
  const noSessions: SessionPoint[] = []

  it('stays silent without enough history', () => {
    expect(stallProtocol(flatWeeks(10, 65), noSessions)).toBeNull()
  })

  it('fires on a genuine 14-day flat rolling average', () => {
    const out = stallProtocol(flatWeeks(25, 65, { steps: 6000, carbsG: 120 }), noSessions)
    expect(out).not.toBeNull()
    expect(out!.id).toBe('stall-protocol')
    expect(out!.headline).toMatch(/stall/i)
  })

  it('picks the STEPS lever when steps are the weakest input', () => {
    const out = stallProtocol(flatWeeks(25, 65, { steps: 6000, carbsG: 120 }), noSessions)
    expect(out!.detail).toMatch(/1,500 steps/)
    expect(out!.detail).not.toMatch(/carb/i)
  })

  it('picks the CARB lever when steps are already high but carbs are not', () => {
    const out = stallProtocol(flatWeeks(25, 65, { steps: 12000, carbsG: 220 }), noSessions)
    expect(out!.detail).toMatch(/100 kcal of carbs/)
  })

  it('falls back to the VOLUME lever when steps and carbs are both tight', () => {
    const out = stallProtocol(flatWeeks(25, 65, { steps: 12000, carbsG: 90 }), noSessions)
    expect(out!.detail).toMatch(/one set per muscle/)
  })

  it('does NOT fire when a heavy session lands in the final 72h (that is water)', () => {
    const days = flatWeeks(25, 65, { steps: 6000 })
    const recent = days.slice(-2)[0].date
    expect(stallProtocol(days, [{ date: recent, volumeKg: 9000 }])).toBeNull()
  })

  it('does NOT fire when the rolling average is genuinely falling', () => {
    const days = Array.from({ length: 25 }, (_, i) =>
      day(`2026-06-${String(i + 1).padStart(2, '0')}`, { weightKg: 68 - i * 0.08, steps: 6000 }))
    expect(stallProtocol(days, [])).toBeNull()
  })
})

describe('buildWeeklyExport', () => {
  const emptyDay = (date: string, weekdayLabel: string): ExportDay => ({
    date, weekdayLabel, isTrainingDay: false,
    weightKg: null, calories: null, proteinG: null, carbsG: null, fatG: null,
    steps: null, distanceM: null, trainingMin: null,
    sleepMin: null, deepMin: null, remMin: null, restingHr: null, hrvMs: null,
    waterMl: null, supplementsTaken: null,
  })

  const input: WeeklyExportInput = {
    weekStart: '2026-07-19', weekEnd: '2026-07-25', programLabel: 'Helix Cut',
    calorieGoal: 1955, proteinGoalG: 170, stepsGoal: 10000, sleepGoalHours: 8,
    days: [
      {
        ...emptyDay('2026-07-19', 'Sun'), isTrainingDay: true,
        weightKg: 65.3, calories: 1940, proteinG: 172, carbsG: 190, fatG: 54,
        steps: 9200, distanceM: 7100, trainingMin: 68,
        sleepMin: 551, restingHr: 48, hrvMs: 62, waterMl: 3000,
        supplementsTaken: 3,
      },
      emptyDay('2026-07-20', 'Mon'),
    ],
    sessions: [
      {
        date: '2026-07-19', label: 'Upper A', volumeKg: 8240, setCount: 24,
        failureSets: 1, durationMin: 68, avgBpm: 118, caloriesBurned: 512, sessionRpe: 8,
        exercises: [{
          name: 'Chest Press', repWindow: '10–12', topKg: 60,
          sets: [
            { weightKg: 60, reps: 12, side: null, failure: false, pairId: null },
            { weightKg: 60, reps: 11, side: null, failure: false, pairId: null },
            { weightKg: 57.5, reps: 10, side: null, failure: true, pairId: null },
          ],
        }, {
          name: 'Single Arm Cable Crossover', repWindow: '12–15', topKg: 7.5,
          sets: [
            { weightKg: 7.5, reps: 15, side: 'L', failure: false, pairId: 'p1' },
            { weightKg: 7.5, reps: 13, side: 'R', failure: true, pairId: 'p1' },
          ],
        }],
        prs: [{ name: 'Chest Press', weightKg: 60, reps: 12 }],
      },
    ],
    volumeByMuscle: [
      { muscle: 'Chest', sets: 11, target: 11 },
      { muscle: 'Biceps', sets: 4, target: 8 },
    ],
    doms: [{ date: '2026-07-20', muscle: 'Quads', severity: 2 }],
    previous: {
      avgKcal: 2010, avgProtein: 160, avgSteps: 8000, avgSleepMin: 500,
      sessions: 4, volumeKg: 30000, sets: 90, weightStart: 66.0, weightEnd: 65.6,
    },
  }

  it('is deterministic (same input → identical string)', () => {
    expect(buildWeeklyExport(input)).toBe(buildWeeklyExport(input))
  })

  it('marks missing data as "—" instead of dropping the row or implying zero', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/\*\*Mon 2026-07-20\*\* · Rest · sleep — · intake — kcal/)   // the empty day is still present
    expect(out).toMatch(/—/)
    expect(out).not.toMatch(/\*\*Mon 2026-07-20\*\*.*0 kcal/)    // never fabricates a 0
  })

  it('is DRY DATA — no coaching prompt or instruction header', () => {
    const out = buildWeeklyExport(input)
    expect(out).not.toMatch(/elite physique coach/)
    expect(out).not.toMatch(/Never invent data/)
    expect(out).not.toMatch(/highest-leverage/)
    // Starts straight at the week heading.
    expect(out.trimStart()).toMatch(/^# WEEK 2026-07-19/)
  })

  it('carries the program, sessions, and volume targets', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/Helix Cut/)
    expect(out).toMatch(/Upper A/)
    expect(out).toMatch(/- Biceps: 4 \/ 8 sets — UNDER/)  // under-target flagged
  })

  it('nests body composition under the weigh-in day only when supplied', () => {
    expect(buildWeeklyExport(input)).not.toMatch(/InBody/)
    const withBody = buildWeeklyExport({
      ...input,
      bodyComp: [{
        date: '2026-07-19', weightKg: 65.3, bmi: 22.4, bodyFatPct: 13.2, musclePercent: 46.1,
        waterPercent: 60.5, visceralFat: 6, bmr: 1620, boneMineral: 4.1, leanMassKg: 53.4,
      }],
    })
    // Full InBody row, BMI included, in the mandated order — and no W:H, which
    // is not tracked any more.
    expect(withBody).toMatch(/InBody · weight 65\.3 kg · BMI 22\.4 · BF 13\.2% · muscle 46\.1% · water 60\.5% · visceral 6 · BMR 1620 · bone 4\.1% · lean mass 53\.4 kg/)
    expect(withBody).not.toMatch(/W:H/)
  })

  it('nests walks/cardio under their day, flagged as already counted', () => {
    expect(buildWeeklyExport(input)).not.toMatch(/Already accounted for/)
    const withCardio = buildWeeklyExport({
      ...input,
      cardio: [{
        date: '2026-07-19', kind: 'walk', distanceM: 4200, durationMin: 45,
        kcal: 210, totalKcal: 265, avgHr: 112, effort: 4,
      }],
    })
    // Pace is DERIVED (45 min ÷ 4.2 km = 10:43 /km), never a stored column.
    expect(withCardio).toMatch(
      /walk · 45 min · 4\.20 km · 10:43 \/km · 210 active kcal · 265 total kcal · avg HR 112 · effort 4\.0\/10 \(Already accounted for in daily steps and calories\)/,
    )
  })

  it('omits cardio fields that were never entered, rather than printing zeros', () => {
    const sparse = buildWeeklyExport({
      ...input,
      cardio: [{ date: '2026-07-19', kind: 'run', distanceM: null, durationMin: 30, kcal: null, totalKcal: null, avgHr: null, effort: null }],
    })
    expect(sparse).toMatch(/run · 30 min \(Already accounted for in daily steps and calories\)/)
    expect(sparse).not.toMatch(/\/km/)
  })

  it('carries the Borg CR10 session effort onto the session line', () => {
    expect(buildWeeklyExport(input)).toMatch(/effort 8\.0\/10 CR10/)
  })

  it('lists EVERY working set, grouped by load — not just the top set', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/60kg × 12,11/)
    expect(out).toMatch(/57\.5kg × 10/)
    expect(out).toMatch(/target 10–12/)
  })

  it('carries per-workout volume, failures, time and kcal burned', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/8240 kg volume · 24 sets · 1 to failure · 68 min · 512 kcal/)
  })

  it('marks a set taken to failure and NEVER emits an estimated 1RM', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/57\.5kg × 10 \(F\)/)   // failure flag
    expect(out).not.toMatch(/e1RM/i)            // no derived 1RM anywhere
  })

  it('splits unilateral work per side (L/R weight · reps · failure)', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/S1 L 7\.5kg×15 · R 7\.5kg×13\(F\)/)
  })

  it('names the PRs (raw lift, no 1RM) rather than counting them', () => {
    expect(buildWeeklyExport(input)).toMatch(/PRs: Chest Press 60kg × 12/)
  })

  it('carries steps and recovery signals per day', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/9200 steps/)
    expect(out).toMatch(/RHR 48 · HRV 62/)           // RHR, HRV
  })

  // Active Energy is HealthKit-inflated, Score/Battery are HELIX's own derived
  // opinions — none of the three belongs in a raw-data export.
  it('never emits Active Energy, Day Score or Battery', () => {
    const out = buildWeeklyExport(input)
    expect(out).not.toMatch(/active/i)
    expect(out).not.toMatch(/battery/i)
    expect(out).not.toMatch(/\bscore\b/i)
  })

  it('renders line-by-line TEXT with NO markdown tables', () => {
    const out = buildWeeklyExport(input)
    expect(out).not.toMatch(/^\| Day \|/m)   // no daily table header
    expect(out).not.toMatch(/\|---/)         // no table separator rows anywhere
    expect(out).not.toMatch(/km|Battery|Score|Supps/)
  })

  // The mandated day order: sleep → intake (food) → water → steps.
  it('renders a readable per-day line in the fixed order', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/## Days/)
    expect(out).toMatch(/\*\*Sun 2026-07-19\*\* · Train · sleep 9h11 · intake 1940 kcal \(172P\/190C\/54F\) · water 3\.0 L · 9200 steps · RHR 48 · HRV 62 · Upper A/)
  })

  it('renders a training-vs-rest supplements protocol only when supplied', () => {
    expect(buildWeeklyExport(input)).not.toMatch(/## Supplements protocol/)
    const withProtocol = buildWeeklyExport({
      ...input,
      supplementProtocol: { training: ['11:45 · L-Citrulline — 3 g'], rest: ['10:30 · Vitamin D3 + K2 — 125 mcg'] },
    })
    expect(withProtocol).toMatch(/## Supplements protocol/)
    expect(withProtocol).toMatch(/\*\*Training days\*\*/)
    expect(withProtocol).toMatch(/- 11:45 · L-Citrulline — 3 g/)
    expect(withProtocol).toMatch(/\*\*Rest days\*\*/)
  })

  it('includes a week-over-week block and soreness', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/vs previous week/)
    expect(out).toMatch(/kcal\/day: 1940 \(-70 vs prev\)/)
    expect(out).toMatch(/Quads: 2 \(moderate\)/)
  })

  it('omits the comparison block entirely when there is no previous week', () => {
    const out = buildWeeklyExport({ ...input, previous: null })
    expect(out).not.toMatch(/vs previous week/)
  })
})
