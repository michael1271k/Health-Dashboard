import { describe, it, expect } from 'vitest'
import {
  buildWeeklyExport, weeklySummary, trendTotals,
  type WeeklyExportInput, type ExportDay, type ExportSession, type ExportCardio,
  type LedgerWeek, type ExportBodyComp, sparkline,
} from '@/lib/reports/weeklyExport'
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

/**
 * One day's block from a rendered export — its header line and every indented
 * line under it, up to the next day.
 *
 * A day is four lines now rather than one, and `.` does not cross a newline, so
 * `/\*\*Sun …\*\*.*weight/` silently stopped matching what it used to. Worse,
 * `[\s\S]*?` matches straight PAST the day it was anchored on and into the next
 * one — which turns a "this day has no skip marker" assertion into "some later
 * day has none", and those pass for the wrong reason.
 */
/**
 * The HUMAN half of the document — everything above the machine-readable block.
 *
 * The export now closes with a JSON serialisation of the same payload, which is
 * the point of it: a spreadsheet should not have to parse "Sleep: 9h 11m". But
 * it means every string in the week appears TWICE in the output, and a
 * whole-document assertion like "Creatine appears once" or "these two exports
 * are identical" is really an assertion about the rendered prose. Scope those
 * here rather than weakening them.
 */
function mdOnly(out: string): string {
  const i = out.indexOf('## Machine-readable week')
  return i < 0 ? out : out.slice(0, i)
}

/**
 * ONE `## `-headed section, by name.
 *
 * Needed because the vocabularies now overlap on purpose: the daily Micros line
 * names L-Citrulline, creatine and caffeine as micronutrient targets, and the
 * Supplements protocol names them as products. A document-wide `indexOf` for
 * "L-Citrulline" finds Sunday's micros line, which is a true fact about a
 * different section.
 */
function section(out: string, heading: string): string {
  const lines = out.split('\n')
  const start = lines.findIndex((l) => l.startsWith(`## ${heading}`))
  if (start < 0) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => l.startsWith('## '))
  return [lines[start], ...(end < 0 ? rest : rest.slice(0, end))].join('\n')
}

function dayBlock(out: string, date: string): string[] {
  const lines = out.split('\n')
  const start = lines.findIndex((l) => l.includes(`**`) && l.includes(date))
  if (start < 0) return []
  const block = [lines[start]]
  for (let i = start + 1; i < lines.length && lines[i].startsWith('    '); i++) block.push(lines[i])
  return block
}

describe('buildWeeklyExport', () => {
  const emptyDay = (date: string, weekdayLabel: string): ExportDay => ({
    date, weekdayLabel, isTrainingDay: false,
    wristTempDeltaC: null, bloodOxygenPct: null,
    weightKg: null, calories: null, proteinG: null, carbsG: null, fatG: null,
    steps: null, distanceM: null, trainingMin: null,
    sleepMin: null, deepMin: null, remMin: null, restingHr: null, hrvMs: null,
    waterMl: null, supplementsTaken: null, activeKcal: null, bmrKcal: null, weighInSkipReason: null,
    nutritionException: null, nutritionEstimated: false,
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
        date: '2026-07-19', sessionNumber: 9, label: 'Upper A', volumeKg: 8240, setCount: 24,
        failureSets: 1, durationMin: 68, avgBpm: 118, caloriesBurned: 512, sessionRpe: 8,
        exercises: [{
          name: 'Chest Press', repWindow: '10–12', topKg: 60,
          sets: [
            { weightKg: 60, reps: 12, rpe: null, side: null, failure: false, pairId: null },
            { weightKg: 60, reps: 11, rpe: null, side: null, failure: false, pairId: null },
            { weightKg: 57.5, reps: 10, rpe: null, side: null, failure: true, pairId: null },
          ],
        }, {
          name: 'Single Arm Cable Crossover', repWindow: '12–15', topKg: 7.5,
          sets: [
            { weightKg: 7.5, reps: 15, rpe: null, side: 'L', failure: false, pairId: 'p1' },
            { weightKg: 7.5, reps: 13, rpe: null, side: 'R', failure: true, pairId: 'p1' },
          ],
        }],
        prs: [{
          name: 'Chest Press', weightKg: 60, reps: 12, axes: ['weight', 'e1rm'],
          volumeKg: 720, e1rmKg: 84,
        }],
      },
    ],
    volumeByMuscle: [
      { muscle: 'Chest', sets: 11, target: 11 },
      { muscle: 'Biceps', sets: 4, target: 8 },
    ],
    doms: [{ date: '2026-07-20', muscle: 'Quads', severity: 2 }],
  }

  it('is deterministic (same input → identical string)', () => {
    expect(buildWeeklyExport(input)).toBe(buildWeeklyExport(input))
  })

  it('marks missing data as "—" instead of dropping the row or implying zero', () => {
    const out = buildWeeklyExport(input)
    // The empty day is still PRESENT, with every field named and dashed.
    expect(out).toMatch(/\*\*Mon 2026-07-20\*\* · Rest\n {4}- Sleep & Vitals: Sleep: —/)
    expect(out).toMatch(/Sleep & Vitals: Sleep: — · HRV: — ms · Resting HR: — bpm/)
    // The two vitals that were fetched-and-dropped (blood oxygen) or never
    // fetched at all (wrist temperature) are named on every day now, dashed
    // when absent — the whole point of adding them.
    expect(out).toMatch(/Wrist Temp: — · Blood O2: —/)
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
    // The export now grades with the app's own `volumeZone` instead of its own
    // three-way comparison, so it says "building" where the Command Center says
    // building. 4 of 8 is half the target: short, but not the bottom band.
    expect(out).toMatch(/- Biceps: 4\/8 — building/)
  })

  it('nests body composition under the weigh-in day only when supplied', () => {
    expect(buildWeeklyExport(input)).not.toMatch(/Body Fat Percentage/)
    const withBody = buildWeeklyExport({
      ...input,
      bodyComp: [{
        date: '2026-07-19', weightKg: 65.3, bmi: 22.4, bodyFatPct: 13.2, musclePercent: 46.1,
        waterPercent: 60.5, visceralFat: 6, bmr: 1620, boneMineral: 4.1,
        muscleMassKg: 30.1, fatFreeMassKg: 56.7,
        fatMassKg: 8.6, proteinMassKg: 12.9, proteinPercent: 19.7, boneMineralKg: 2.81, waterMassKg: 39.5,
        skeletalMuscleMassKg: 27.0, estimatedWaistToHipRatio: 0.8,
      }],
    })
    // ONE line, percentage-then-mass pair by pair, in the scale's own order —
    // so a week-over-week read never has to multiply by a bodyweight that is
    // itself moving.
    expect(withBody).toMatch(/Weight Data: Weight: 65\.3 kg · BMI: 22\.4 · Body Fat Percentage: 13\.2% · Fat Mass: 8\.6 kg/)
    expect(withBody).toMatch(/Muscle Percentage: 46\.1% · Muscle Mass \(Lean Soft Tissue\): 30\.1 kg/)
    expect(withBody).toMatch(/Protein Percentage: 19\.7% · Protein Mass: 12\.9 kg/)
    expect(withBody).toMatch(/Skeletal Muscle Mass: 27\.0 kg · Visceral Fat Rating: 6 · Basal Metabolic Rate: 1620/)
    expect(withBody).toMatch(/Estimated Waist to Hip Ratio: 0\.80 · Fat-free body weight: 56\.7 kg\./)
    // THREE numbers on this line could answer to "muscle mass" and they are
    // ~23 kg apart. The gloss is what stops the report contradicting itself.
    expect(withBody).toMatch(/Muscle Mass \(Lean Soft Tissue\)/)
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
    // Every requested metric, named, in a fixed order. Pace is DERIVED
    // (45 min ÷ 4.2 km = 10:43 /km), never a stored column.
    expect(withCardio).toMatch(
      /Cardio: Walk · time 45 min · distance 4\.20 km · pace 10:43 \/km · active 210 kcal · total 265 kcal · avg HR 112 · effort 4\.0\/10 \*\*\(Already accounted for in daily steps and calories — do NOT add to the day\.\)\*\*/,
    )
  })

  it('names every cardio metric even when it was never entered — and never invents a zero', () => {
    const sparse = buildWeeklyExport({
      ...input,
      cardio: [{ date: '2026-07-19', kind: 'run', distanceM: null, durationMin: 30, kcal: null, totalKcal: null, avgHr: null, effort: null }],
    })
    // Dropping absent fields made two walks incomparable: one showed "avg HR
    // 112" and one showed nothing, with no way to tell missing data from a
    // missing export. Each field is present and explicitly unknown.
    expect(sparse).toMatch(
      /Run · time 30 min · distance — · pace — · active — · total — · avg HR — · effort —/,
    )
    // The invariant that mattered in the original test: no fabricated zeros.
    // Scoped to the cardio line — the day rows legitimately carry numbers
    // ending in 0 (calorie targets, step counts).
    const cardioLine = sparse.split('\n').find((l) => l.includes('Run · time'))!
    expect(cardioLine).not.toMatch(/\b0 kcal\b/)
    expect(cardioLine).not.toMatch(/avg HR 0\b/)
    expect(cardioLine).not.toMatch(/effort 0/)
  })

  it('carries the Borg CR10 session effort onto the session line', () => {
    expect(buildWeeklyExport(input)).toMatch(/Effort: 8\.0\/10 CR10/)
  })

  it('lists EVERY working set, one per numbered line — not just the top set', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/- Set 1: 60 kg × 12/)
    expect(out).toMatch(/- Set 2: 60 kg × 11/)
    expect(out).toMatch(/- Set 3: 57\.5 kg × 10/)
    expect(out).toMatch(/target 10–12/)
  })

  it('carries per-workout volume, failures, time and kcal burned', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(
      /Session Metadata: Duration: 68 Minutes · Volume: 8240 kg · Sets: 24 \(1 to failure\) · Calories: 512 kcal/,
    )
  })

  it('marks a set taken to failure and NEVER emits an estimated 1RM', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/Set 3: 57\.5 kg × 10 \(to failure\)/)   // spelled out, not (F)
    // No derived 1RM anywhere in the PROSE. The machine block carries the
    // payload's own `e1rmKg` field, which is a serialisation of a value the PR
    // line already prints in words — not a set line growing an estimate.
    expect(mdOnly(out)).not.toMatch(/e1RM/i)
  })

  it('splits unilateral work per side (L/R weight · reps · failure)', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/Set 1: L 7\.5 kg × 15 · R 7\.5 kg × 13 \(to failure\)/)
  })

  it('names the PRs, and each axis carries its own value', () => {
    // The axis names ARE the labels: a Weight record's value is the lift
    // already printed to its left and stands alone, while the 1RM axis carries
    // the estimate a reader would otherwise have to compute.
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/- PRs:/)
    expect(out).toMatch(/\*\*Chest Press\*\* 60kg × 12 — Weight, 1RM: 84\.00 kg/)
    // Never both — the axis list and a separate value list printed each record
    // twice ("— Volume, 1RM — Volume: 440, 1RM: 54.67 kg").
    expect(out).not.toMatch(/— Weight, 1RM — /)
  })

  it('carries steps and recovery signals per day', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/9200 steps/)
    expect(out).toMatch(/HRV: 62 ms · Resting HR: 48 bpm/)
  })

  // Active Energy is HealthKit-inflated, Score/Battery are HELIX's own derived
  // opinions — none of the three belongs in a raw-data export.
  it('never emits Active Energy, Day Score or Battery', () => {
    const out = buildWeeklyExport(input)
    // The banned metric is Apple's ACTIVE ENERGY, not the word "active": the
    // cardio ledger's own active kcal is a measured figure and has always been
    // printed on every walk line. A bare /active/i only passed because this
    // fixture logs no cardio, and would have failed the moment one did.
    expect(out).not.toMatch(/active energy/i)
    expect(out).not.toMatch(/battery/i)
    expect(out).not.toMatch(/\bscore\b/i)
  })

  it('renders line-by-line TEXT with NO markdown tables', () => {
    const out = buildWeeklyExport(input)
    expect(out).not.toMatch(/^\| Day \|/m)   // no daily table header
    expect(out).not.toMatch(/\|---/)         // no table separator rows anywhere
    // The ban here used to include /km/, which only ever passed because this
    // fixture logs no cardio — every walk line has always printed a distance.
    // Daily distance now prints too, on the Activity line, and it is measured
    // data like any other. What is actually banned is HELIX's own opinions.
    expect(out).not.toMatch(/Battery|Supps/)
  })

  /**
   * A day is FOUR GROUPED LINES, not one long one. It used to be a single
   * ~300-character run of eleven `·`-separated fields, which is correct data and
   * an unreadable row: nothing marked where nutrition stopped and vitals began.
   *
   * The order is fixed and the groups are: identity → what was eaten → what was
   * moved → what the body reported.
   */
  it('renders each day as EIGHT grouped lines, in a fixed order', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/## Days/)
    // The eight lines IN ORDER and adjacent — asserted as one block, because
    // what is under test is the grouping, and eight independent `toMatch` calls
    // would pass on eight lines scattered through the document.
    //
    // It was four, then five, and the three that joined are each a group the
    // old shape had no room for: the night's ARCHITECTURE (distinct from its
    // duration), the day's MICROS (which the export omitted entirely while the
    // app measured eight of them daily) and supplement COMPLIANCE (distinct
    // from the protocol at the foot of the document, which is a prescription).
    //
    // Every original line keeps its exact position and its exact wording, with
    // the new vitals APPENDED to the ends of the two that grew — so a reader or
    // a parser built against the old shape still finds every field where it
    // left it.
    expect(dayBlock(out, '2026-07-19')).toEqual([
      '- **Sun 2026-07-19** · Workout · Upper A',
      '    - Sleep & Vitals: Sleep: 9h 11m · HRV: 62 ms · Resting HR: 48 bpm · Wrist Temp: —'
        + ' · Blood O2: — · Avg HR (daytime): — · Respiratory Rate: — · VO2 Max: —',
      '    - Sleep Stages: Deep: — · REM: — · Core: — · Awake: — · Bed: — · Wake: —',
      '    - Macros: 1940 kcal (172P / 190C / 54F) · water 3.0 L',
      // Every target, every day, `—/target` where nothing was measured. A
      // nutrient that vanishes on the days it was not logged teaches the reader
      // it is not tracked, which is the opposite of true.
      '    - Micros: Fiber: —/30 g · Protein: —/170 g · Sodium: —/3000 mg (ceiling)'
        + ' · Potassium: —/3400 mg · Calcium: —/1000 mg · Iron: —/10 mg · Magnesium: —/400 mg'
        + ' · Vitamin C: —/90 mg · Vitamin D: —/2000 IU · Saturated Fat: —/20 g (ceiling)'
        + ' · Added Sugar: —/40 g (ceiling) · Vitamin B12: —/2.4 mcg (stack)'
        + ' · Folate: —/400 mcg (stack) · EPA: —/500 mg (stack) · DHA: —/250 mg (stack)'
        + ' · Creatine: —/5000 mg (stack) · L-Citrulline: —/3000 mg (stack)'
        + ' · Caffeine: —/400 mg (ceiling, stack) · L-Theanine: —/200 mg (stack)'
        + ' · Glycine: —/3000 mg (stack)',
      '    - Activity: 9200 steps · 7.10 km · 68 min training · Exercise: — · Stand: — · Daylight: —',
      // The denominator is em-dashed rather than assumed: this fixture states
      // that three were taken and never says how many were asked for, and "3 of
      // 3" would be an invented claim of perfect adherence.
      '    - Supplements: 3 of — taken',
      '    - Weight Data: weight 65.3 kg',
    ])
  })

  // A blank weight can mean "not weighed", "the sync dropped it", or "skipped on
  // purpose" — and only the last is safe to leave out of a trend.
  it('states WHY a weigh-in is missing, defaulting to the protocol reason', () => {
    // No reason stored → "As Planned", not "no reason recorded". Skipping the
    // scale before a bowel movement IS the protocol, and reporting it as a
    // logging gap reads a deliberate week as a sloppy one.
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/\*\*Mon 2026-07-20\*\*[\s\S]*?weight — \[Skip: As Planned\]/)

    const withReason = buildWeeklyExport({
      ...input,
      days: input.days.map((d) => (d.date === '2026-07-20' ? { ...d, weighInSkipReason: 'Travel' } : d)),
    })
    // Read DYNAMICALLY off the day — change the reason and the export follows.
    expect(withReason).toMatch(/\*\*Mon 2026-07-20\*\*[\s\S]*?weight — \[Skip: Travel\]/)
    expect(withReason).not.toMatch(/As Planned/)
    // A day that WAS weighed never carries a skip marker.
    expect(dayBlock(withReason, '2026-07-19').join('\n')).not.toMatch(/Skip:/)
  })

  it('tags a declared exception on the intake it explains, and changes no total', () => {
    const dateNight = input.days.map((d) => (d.date === '2026-07-19'
      ? { ...d, calories: 3210, nutritionException: 'Event' } : d))
    const raw = buildWeeklyExport({ ...input, days: input.days.map((d) => (d.date === '2026-07-19'
      ? { ...d, calories: 3210 } : d)) })
    const tagged = buildWeeklyExport({ ...input, days: dateNight })

    // The tag rides the kcal figure, not the end of the line.
    expect(tagged).toMatch(/Macros: 3210 kcal \([^)]*\) \[Exception: Event\]/)
    // An ordinary day is never annotated.
    expect(tagged).not.toMatch(/\*\*Mon 2026-07-20\*\*[\s\S]*?- Macros:[^\n]*Exception/)

    // A PR set on a declared day is still a PR, and is TAGGED rather than
    // suppressed — "he hit a record on the night out" is the interesting fact,
    // and it reads as an ordinary Sunday without the annotation.
    expect(tagged).toMatch(/\*\*Chest Press\*\* 60kg × 12 — Weight, 1RM: 84\.00 kg _\(under Event\)_/)

    // THE INVARIANT: forgiving the grade must not move a single aggregate. The
    // only differences between these two exports are the two annotations.
    // Scoped to the prose: the JSON block genuinely differs, because the day
    // genuinely carries a declared exception. What must not move is a single
    // rendered aggregate.
    expect(mdOnly(tagged).replace(' [Exception: Event]', '').replace(' _(under Event)_', ''))
      .toBe(mdOnly(raw))
  })

  it('names WHICH axis each PR was set on, in a fixed order', () => {
    const out = buildWeeklyExport(input)
    expect(out).toMatch(/- \*\*Chest Press\*\* 60kg × 12 — Weight, 1RM/)

    // A movement with no ledger row still lists — without inventing an axis.
    const noAxes = buildWeeklyExport({
      ...input,
      sessions: input.sessions.map((s) => ({ ...s, prs: s.prs.map((p) => ({ ...p, axes: [] })) })),
    })
    expect(noAxes).toMatch(/- \*\*Chest Press\*\* 60kg × 12$/m)
  })

  // Volume is a sum of quarter-kg microloads; 0 dp made the export disagree with
  // the Session Report about the same session.
  it('prints session volume at full precision, never rounded to a whole kg', () => {
    const precise = buildWeeklyExport({
      ...input,
      sessions: input.sessions.map((s) => ({ ...s, volumeKg: 8329.25 })),
    })
    expect(precise).toMatch(/Volume: 8329\.25 kg/)
    // A whole number stays whole — no cosmetic ".00".
    const whole = buildWeeklyExport({
      ...input,
      sessions: input.sessions.map((s) => ({ ...s, volumeKg: 8240 })),
    })
    expect(whole).toMatch(/Volume: 8240 kg/)
  })

  it('renders ONE chronological supplements list, only when supplied', () => {
    expect(buildWeeklyExport(input)).not.toMatch(/## Supplements protocol/)
    const withProtocol = buildWeeklyExport({
      ...input,
      supplementProtocol: [
        { time: '11:45', name: 'L-Citrulline', dose: '3 g' },
        { time: '10:30', name: 'Vitamin D3 + K2', dose: '125 mcg' },
      ],
    })
    expect(withProtocol).toMatch(/## Supplements protocol/)
    // The stack is nearly identical on both kinds of day. Two headed lists
    // duplicated a dozen identical lines to express one differing dose.
    expect(withProtocol).not.toMatch(/\*\*Training days\*\*/)
    expect(withProtocol).not.toMatch(/\*\*Rest days\*\*/)
    expect(withProtocol).toMatch(/- 11:45 · L-Citrulline — 3 g/)
    const list = section(withProtocol, 'Supplements protocol')
    expect(list.indexOf('Vitamin D3')).toBeLessThan(list.indexOf('L-Citrulline'))
  })

  it('prints the dose it is GIVEN, with nothing memorised about any supplement', () => {
    // The regression this whole change exists for: the renderer used to hold a
    // verbatim multivitamin line and a /citrulline|caffeine/i regex, so a dose
    // corrected in the app still exported as the constant in this file.
    const out = buildWeeklyExport({
      ...input,
      supplementProtocol: [
        { time: '11:45', name: 'L-Citrulline', dose: '6 g', trainingOnly: true },
        { time: '10:30', name: 'Two Per Day Multivitamin', dose: '1 tab' },
      ],
    })
    expect(out).toMatch(/- 11:45 · L-Citrulline — 6 g \(training days only\)/)
    expect(out).not.toMatch(/3 g/)
    // No asserted multivitamin sentence any more — the rule comes from the row.
    expect(out).toMatch(/- 10:30 · Two Per Day Multivitamin — 1 tab$/m)
  })

  it('carries a rule from the row’s notes, verbatim', () => {
    const out = buildWeeklyExport({
      ...input,
      supplementProtocol: [
        { time: '09:00', name: 'Two Per Day Multivitamin', dose: '1 tab', notes: '2 tabs on Monday & Friday (Leg Days)' },
        { time: '15:00', name: 'Creatine Monohydrate', dose: '5 g' },
      ],
    })
    expect(out).toMatch(/- 09:00 · Two Per Day Multivitamin — 1 tab · 2 tabs on Monday & Friday \(Leg Days\)/)
    // A supplement with no rule gets no invented one.
    expect(out).toMatch(/- 15:00 · Creatine Monohydrate — 5 g$/m)
  })

  it('states a split dose as the rule it is, rather than picking a column', () => {
    const out = buildWeeklyExport({
      ...input,
      supplementProtocol: [
        { time: '09:00', name: 'Multivitamin', dose: '1 tab', trainingDose: '2 tabs', restDose: '1 tab' },
      ],
    })
    expect(out).toMatch(/- 09:00 · Multivitamin — 2 tabs on training days \/ 1 tab on rest days/)
    expect(section(out, 'Supplements protocol').match(/Multivitamin/g)).toHaveLength(1)
  })

  it('marks a training-only item as one, and nothing else', () => {
    const out = buildWeeklyExport({
      ...input,
      supplementProtocol: [
        { time: '11:45', name: 'L-Citrulline', dose: '6 g', trainingOnly: true },
        { time: '11:45', name: 'Nutricost Caffeine', dose: '200 mg', trainingOnly: true },
        { time: '15:00', name: 'Creatine Monohydrate', dose: '5 g' },
      ],
    })
    // Creatine is taken every day; tagging it would state a rule that isn't one.
    expect(out).toMatch(/- 15:00 · Creatine Monohydrate — 5 g$/m)
    expect(out.match(/\(training days only\)/g)).toHaveLength(2)
  })

  it('deduplicates by supplement, so one row can never print twice', () => {
    const out = buildWeeklyExport({
      ...input,
      supplementProtocol: [
        { time: '08:00', name: 'Creatine', dose: '5 g' },
        { time: '08:00', name: 'creatine', dose: '5 g' },
        { time: '11:45', name: 'L-Citrulline', dose: '6 g' },
      ],
    })
    expect(section(out, 'Supplements protocol').match(/reatine/g)).toHaveLength(1)
    expect(out).toMatch(/- 11:45 · L-Citrulline — 6 g/)
  })

  // Warm-ups used to be filtered out upstream, so the export read as if every
  // session started at its top load.
  it('emits warm-up sets, tagged, without merging them into the working group', () => {
    const out = buildWeeklyExport({
      ...input,
      sessions: [{
        ...input.sessions[0],
        exercises: [{
          name: 'Leg Press', topKg: 70, repWindow: '8-12',
          sets: [
            { weightKg: 40, reps: 10, rpe: null, side: null, failure: false, warmup: true, pairId: null },
            { weightKg: 70, reps: 12, rpe: null, side: null, failure: false, pairId: null },
          ],
        }],
      }],
    })
    // Named rather than numbered — "Set 1" is the first WORKING set.
    expect(out).toMatch(/- Warm-up: 40 kg × 10 \(warm-up\)/)
    expect(out).toMatch(/- Set 1: 70 kg × 12/)
  })

  it('states a missing session effort rather than omitting the segment', () => {
    const out = buildWeeklyExport({
      ...input,
      sessions: [{ ...input.sessions[0], sessionRpe: null }],
    })
    expect(out).toMatch(/Effort: Not reported/)
  })

  it('includes soreness', () => {
    expect(buildWeeklyExport(input)).toMatch(/Quads: 2 \(moderate\)/)
  })

  // The old free-floating "vs previous week" prose block stays gone — the
  // comparison now lives in ONE place, the closing trends table, and a second
  // rendering of the same six numbers is how two surfaces start disagreeing.
  it('emits no loose "vs previous week" block', () => {
    expect(buildWeeklyExport(input)).not.toMatch(/vs previous week/i)
  })
})

/**
 * The four week-level facts that are NOT a sum of the daily lines. The export
 * refuses derived aggregates on principle; these earn their place because
 * reconstructing them by hand costs the reader real work.
 */
describe('weeklySummary', () => {
  const sumDay = (o: Partial<ExportDay>): ExportDay => ({
    date: '2026-07-19', weekdayLabel: 'Sun', isTrainingDay: false, weightKg: null,
    calories: null, proteinG: null, carbsG: null, fatG: null, steps: null, distanceM: null,
    trainingMin: null, sleepMin: null, deepMin: null, remMin: null, restingHr: null,
    wristTempDeltaC: null, bloodOxygenPct: null,
    hrvMs: null, waterMl: null, supplementsTaken: null, activeKcal: null, bmrKcal: null,
    weighInSkipReason: null, nutritionException: null, nutritionEstimated: false, ...o,
  })
  const base = (o: Partial<WeeklyExportInput> = {}): WeeklyExportInput => ({
    weekStart: '2026-07-19', weekEnd: '2026-07-25', programLabel: 'Helix Cut',
    calorieGoal: 1955, proteinGoalG: 170, stepsGoal: 10000, sleepGoalHours: 8,
    days: [], sessions: [], volumeByMuscle: [], doms: [], cardio: [], ...o,
  })
  const day = sumDay

  it('averages only the days that HAVE a reading', () => {
    // Four nights of sleep is a 7.2h average over four nights, not 4.1h over
    // seven. Counting a missing night as zero is the classic version of this bug.
    const s = weeklySummary(base({
      days: [day({ sleepMin: 420 }), day({ sleepMin: 480 }), day({ sleepMin: null })],
    }))
    expect(s.avgSleepMin).toBe(450)
  })

  it('returns null, never 0, when nothing was recorded', () => {
    const s = weeklySummary(base({ days: [day({}), day({})] }))
    expect(s.avgSleepMin).toBeNull()
    expect(s.avgRestingHr).toBeNull()
    expect(s.avgHrvMs).toBeNull()
    expect(s.cardioMinutes).toBeNull()
  })

  it('totals cardio duration and active calories across the week', () => {
    const s = weeklySummary(base({
      cardio: [
        { date: '2026-07-19', kind: 'walk', distanceM: 3000, durationMin: 30, kcal: 150, totalKcal: null, avgHr: null, effort: null },
        { date: '2026-07-21', kind: 'run', distanceM: 5000, durationMin: 25, kcal: 320, totalKcal: null, avgHr: null, effort: null },
      ],
    }))
    expect(s.cardioMinutes).toBe(55)
    expect(s.cardioActiveKcal).toBe(470)
    expect(s.cardioSessions).toBe(2)
  })

  it('reports the single worst DOMS reading of the week', () => {
    const s = weeklySummary(base({
      doms: [
        { date: '2026-07-19', muscle: 'Chest', severity: 1 },
        { date: '2026-07-21', muscle: 'Quads', severity: 3 },
        { date: '2026-07-22', muscle: 'Glutes', severity: 2 },
      ],
    }))
    expect(s.peakDoms).toEqual({ muscle: 'Quads', severity: 3, date: '2026-07-21' })
  })

  it('keeps the FIRST day a peak was reached when two tie', () => {
    const s = weeklySummary(base({
      doms: [
        { date: '2026-07-21', muscle: 'Quads', severity: 3 },
        { date: '2026-07-22', muscle: 'Calves', severity: 3 },
      ],
    }))
    expect(s.peakDoms?.date).toBe('2026-07-21')
  })

  it('ignores severity-0 rows — "rated, not sore" is not soreness', () => {
    const s = weeklySummary(base({ doms: [{ date: '2026-07-19', muscle: 'Chest', severity: 0 }] }))
    expect(s.peakDoms).toBeNull()
  })

  it('prints the summary above the daily log, and says so when nothing is sore', () => {
    const out = buildWeeklyExport(base({ days: [day({ sleepMin: 450 })] }))
    expect(out).toMatch(/## Weekly summary/)
    expect(out.indexOf('## Weekly summary')).toBeLessThan(out.indexOf('## Days'))
    expect(out).toMatch(/- Highest DOMS: none reported/)
  })

  it('names the worst muscle in the printed line', () => {
    const out = buildWeeklyExport(base({
      days: [day({})],
      doms: [{ date: '2026-07-21', muscle: 'Quads', severity: 3 }],
    }))
    expect(out).toMatch(/- Highest DOMS: Quads — severe \(2026-07-21\)/)
  })
})

/**
 * The closing CUMULATIVE LEDGER — one row per week, oldest first. Deliberately
 * the ONE table in a file whose whole design rule is "no tables": a programme's
 * trajectory is a column read downwards, which is exactly what a table is for.
 */
describe('week-over-week ledger', () => {
  const day = (o: Partial<ExportDay>): ExportDay => ({
    date: '2026-07-19', weekdayLabel: 'Sun', isTrainingDay: false, weightKg: null,
    calories: null, proteinG: null, carbsG: null, fatG: null, steps: null, distanceM: null,
    trainingMin: null, sleepMin: null, deepMin: null, remMin: null, restingHr: null,
    wristTempDeltaC: null, bloodOxygenPct: null,
    hrvMs: null, waterMl: null, supplementsTaken: null, activeKcal: null, bmrKcal: null,
    weighInSkipReason: null, nutritionException: null, nutritionEstimated: false, ...o,
  })
  const session = (volumeKg: number | null): ExportSession => ({
    date: '2026-07-20', label: 'Upper A', volumeKg, setCount: null, failureSets: null,
    durationMin: null, avgBpm: null, caloriesBurned: null, sessionRpe: null,
    exercises: [], prs: [],
  })
  const walk = (durationMin: number | null): ExportCardio => ({
    date: '2026-07-19', kind: 'walk', distanceM: null, durationMin,
    kcal: null, totalKcal: null, avgHr: null, effort: null,
  })
  const base = (o: Partial<WeeklyExportInput> = {}): WeeklyExportInput => ({
    weekStart: '2026-08-02', weekEnd: '2026-08-08', weekLabel: 'Week 3',
    programLabel: 'Helix Cut',
    calorieGoal: 1955, proteinGoalG: 170, stepsGoal: 10000, sleepGoalHours: 8,
    days: [], sessions: [], volumeByMuscle: [], doms: [], cardio: [], ...o,
  })
  /** A ledger row from one week's worth of days/sessions/cardio. */
  const week = (
    label: string, weekStart: string,
    days: ExportDay[] = [], sessions: ExportSession[] = [], cardio: ExportCardio[] = [],
  ): LedgerWeek => ({ label, weekStart, totals: trendTotals(days, sessions, cardio) })

  describe('trendTotals', () => {
    it('averages only the days that HAVE a reading, and totals the work', () => {
      const t = trendTotals(
        [day({ calories: 1800, steps: 9000, weightKg: 64.2, waterMl: 3000 }),
          day({ calories: 2000, steps: null, weightKg: null, waterMl: 2000 }),
          day({})],
        [session(8000), session(4000)],
        [walk(30), walk(20)],
      )
      // Two logged intakes → their mean. The third day is unknown, not 0 kcal.
      expect(t.avgKcal).toBe(1900)
      expect(t.avgSteps).toBe(9000)
      expect(t.avgWeightKg).toBe(64.2)
      expect(t.avgWaterMl).toBe(2500)
      // Volume and cardio minutes are work that happened — honest sums.
      expect(t.totalVolumeKg).toBe(12000)
      expect(t.cardioMinutes).toBe(50)
    })

    it('returns null rather than 0 when a measure was never recorded', () => {
      const t = trendTotals([day({}), day({})], [], [])
      expect(t.avgKcal).toBeNull()
      expect(t.avgWeightKg).toBeNull()
      expect(t.totalVolumeKg).toBeNull()
      expect(t.cardioMinutes).toBeNull()
    })
  })

  it('is skipped entirely when there is no ledger to print', () => {
    expect(buildWeeklyExport(base({ days: [day({ calories: 1800 })] })))
      .not.toMatch(/Week-over-Week/)
  })

  it('heads the block with the program and the app’s own week number', () => {
    const out = buildWeeklyExport(base({
      ledger: [week('Week 2', '2026-07-26'), week('Week 3', '2026-08-02')],
    }))
    expect(out).toMatch(/## Week-over-Week Trends \(Helix Cut · Week 3\)/)
  })

  /**
   * THE POINT OF THE PIVOT. Two columns answer "what changed since Sunday";
   * a programme is a trajectory, and every week has to be on it.
   */
  it('gives EVERY week its own row, oldest first', () => {
    const out = buildWeeklyExport(base({
      ledger: [
        week('Week 0', '2026-07-12', [day({ calories: 2100 })]),
        week('Week 1', '2026-07-19', [day({ calories: 2000 })]),
        week('Week 2', '2026-07-26', [day({ calories: 1900 })]),
        week('Week 3', '2026-08-02', [day({ calories: 1800 })]),
      ],
    }))
    const rows = out.split('\n').filter((l) => l.startsWith('|'))
    // Header, alignment rule, four weeks.
    expect(rows).toHaveLength(6)
    expect(rows[2]).toMatch(/^\| Week 0 /)
    expect(rows[5]).toMatch(/^\| Week 3 /)
    // Chronological, not reverse — the trend is read downwards.
    expect(out.indexOf('| Week 0')).toBeLessThan(out.indexOf('| Week 3'))
  })

  it('closes the export — the evidence is read before the trend', () => {
    const out = buildWeeklyExport(base({
      sessions: [session(8000)],
      ledger: [week('Week 3', '2026-08-02')],
    }))
    expect(out.indexOf('## Days')).toBeLessThan(out.indexOf('## Week-over-Week'))
    expect(out.indexOf('## Sessions')).toBeLessThan(out.indexOf('## Week-over-Week'))
  })

  it('carries one column per metric', () => {
    const out = buildWeeklyExport(base({
      ledger: [week('Week 3', '2026-08-02',
        [day({ calories: 1800, steps: 9000, weightKg: 64.0, waterMl: 3000 })],
        [session(8000)], [walk(30)])],
    }))
    for (const c of ['Week', 'Kcal/day', 'Volume kg', 'Steps/day', 'Cardio min', 'Water L/day', 'Weight kg']) {
      expect(out).toContain(c)
    }
    expect(out).toMatch(/\| +1800 \| +8000 \| +9000 \| +30 \| +3\.00 \| +64\.0 \|/)
  })

  /**
   * ONE delta column, on bodyweight. A delta beside every metric doubles the
   * table and buries the series in its own first differences — the trajectory
   * IS the table now.
   */
  it('quotes the bodyweight delta against the row above, to two places', () => {
    const out = buildWeeklyExport(base({
      ledger: [
        week('Week 2', '2026-07-26', [day({ weightKg: 65.0 })]),
        week('Week 3', '2026-08-02', [day({ weightKg: 64.55 })]),
      ],
    }))
    // A true minus sign, not a hyphen. 0.45 must not round to 0.5 — a third of
    // the week's whole loss.
    expect(out).toMatch(/−0\.45/)
    // The first row has nothing above it, so it has no delta. (`| Week ` alone
    // would also catch the header, whose own first cell is the word "Week".)
    const rows = out.split('\n').filter((l) => /^\| Week \d/.test(l))
    expect(rows[0]).toMatch(/\| +— \| — \|$/)
  })

  it('prints a flat week as 0.00, never as a blank', () => {
    const out = buildWeeklyExport(base({
      ledger: [
        week('Week 2', '2026-07-26', [day({ weightKg: 64.2 })]),
        week('Week 3', '2026-08-02', [day({ weightKg: 64.2 })]),
      ],
    }))
    expect(out).toMatch(/0\.00/)
    expect(out).toMatch(/→/)
  })

  it('leaves a cell blank when the measure was never recorded — never 0', () => {
    const out = buildWeeklyExport(base({ ledger: [week('Week 3', '2026-08-02', [day({})])] }))
    const row = out.split('\n').find((l) => l.startsWith('| Week 3'))!
    expect(row).not.toMatch(/\b0\b/)
    expect(row).toMatch(/—/)
  })

  /**
   * DIRECTION, NOT VERDICT. Whether falling weight is progress or a problem
   * depends on the phase; this file exports raw data and lets the reader judge.
   */
  it('uses neutral arrows and never labels a move good or bad', () => {
    const out = buildWeeklyExport(base({
      ledger: [
        week('Week 2', '2026-07-26', [day({ weightKg: 65 })]),
        week('Week 3', '2026-08-02', [day({ weightKg: 64 })]),
      ],
    }))
    expect(out).toMatch(/↓/)
    expect(out).not.toMatch(/\b(good|bad|on track|great)\b/i)
  })

  it('lays the table out so the RAW markdown lines up too', () => {
    const out = buildWeeklyExport(base({
      ledger: [
        week('Week 2', '2026-07-26', [day({ calories: 1900, weightKg: 65 })]),
        week('Week 3', '2026-08-02', [day({ calories: 1800, weightKg: 64 })]),
      ],
    }))
    const rows = out.split('\n').filter((l) => l.startsWith('|'))
    // Every row is the same width — the padding's whole job. Arrows and minus
    // signs are single code points, so they must not skew it.
    expect(new Set(rows.map((r) => [...r].length)).size).toBe(1)
    // The week name left, numbers right — the alignment row says so.
    expect(rows[1]).toMatch(/^\|:-+-\|-+:\|/)
  })
})

/**
 * The weekly aggregates, the appended previous week and the provenance note —
 * the three things added so a model reading the payload does not have to
 * recompute the week or guess how good the instrument was.
 */
describe('weekly aggregates · previous-week reference · disclaimer', () => {
  const day = (o: Partial<ExportDay>): ExportDay => ({
    date: '2026-07-19', weekdayLabel: 'Sun', isTrainingDay: false, weightKg: null,
    calories: null, proteinG: null, carbsG: null, fatG: null, steps: null, distanceM: null,
    trainingMin: null, sleepMin: null, deepMin: null, remMin: null, restingHr: null,
    wristTempDeltaC: null, bloodOxygenPct: null,
    hrvMs: null, waterMl: null, supplementsTaken: null, activeKcal: null, bmrKcal: null,
    weighInSkipReason: null, nutritionException: null, nutritionEstimated: false, ...o,
  })
  const session = (o: Partial<ExportSession> = {}): ExportSession => ({
    date: '2026-07-20', label: 'Upper A', volumeKg: 1000, setCount: null, failureSets: null,
    durationMin: null, avgBpm: null, caloriesBurned: null, sessionRpe: null,
    exercises: [], prs: [], ...o,
  })
  const base = (o: Partial<WeeklyExportInput> = {}): WeeklyExportInput => ({
    weekStart: '2026-07-19', weekEnd: '2026-07-25', programLabel: 'Helix Cut',
    calorieGoal: 1955, proteinGoalG: 170, stepsGoal: 10000, sleepGoalHours: 8,
    days: [], sessions: [], volumeByMuscle: [], doms: [], cardio: [], ...o,
  })

  // ── Tonnage per muscle ──
  it('breaks the week down by muscle group in kilograms', () => {
    const out = buildWeeklyExport(base({
      sessions: [session({ volumeKg: 3571.25 })],
      tonnageByMuscle: [{ muscle: 'Quads', volumeKg: 22000 }, { muscle: 'Chest', volumeKg: 15000 }],
    }))
    // The two units are now split by WHAT THEY ARE, not merged by subject:
    // sets are the DOSE the programme prescribes and sit with the week's
    // training, kilograms are a sum over seven days and sit with the other
    // aggregates. Both still say so under a heading that names the unit.
    expect(out).toMatch(/## Sets Targets/)
    expect(out).toMatch(/### Volume by muscle group \(kg\)/)
    expect(out.indexOf('## Sets Targets')).toBeLessThan(out.indexOf('## Weekly aggregates'))
    expect(out.indexOf('## Weekly aggregates')).toBeLessThan(out.indexOf('### Volume by muscle group'))
    expect(out).toMatch(/- Quads: 22000 kg/)
    expect(out).toMatch(/- Chest: 15000 kg/)
  })

  it('prints the week total at full precision, matching the Session page', () => {
    // 3571.25 is the Aug 5 session exactly. `n()` would have rounded it to 3571
    // and the export would disagree with the screen about the same workout.
    const out = buildWeeklyExport(base({ sessions: [session({ volumeKg: 3571.25 })] }))
    expect(out).toMatch(/\*\*Total volume:\*\* 3571\.25 kg across 1 session/)
  })

  it('warns that per-muscle rows deliberately over-sum', () => {
    const out = buildWeeklyExport(base({
      sessions: [session()],
      tonnageByMuscle: [{ muscle: 'Quads', volumeKg: 900 }, { muscle: 'Glutes', volumeKg: 900 }],
    }))
    expect(out).toMatch(/sum to MORE than the total above/)
  })

  // ── Energy balance ──
  it('estimates the weekly deficit from BMR + active + TEF vs intake', () => {
    // 1900 in; out = 1500 BMR + 600 active + 199.5 TEF = 2299.5. Twice.
    const days = [
      day({ date: '2026-07-19', calories: 1900, bmrKcal: 1500, activeKcal: 600 }),
      day({ date: '2026-07-20', calories: 1900, bmrKcal: 1500, activeKcal: 600 }),
    ]
    const out = buildWeeklyExport(base({ days }))
    expect(out).toMatch(/\*\*Energy balance \(estimated\):\*\* 799 kcal DEFICIT over 2 days/)
    expect(out).toMatch(/399 kcal\/day under maintenance/)
    expect(out).toMatch(/Intake 3800 kcal vs expenditure 4599 kcal/)
  })

  it('names TEF in the breakdown, and states the rate it used', () => {
    // The whole point of the term is that it is visible. A TDEE that silently
    // grew by 200 kcal/day would look like a data error, not a correction.
    const out = buildWeeklyExport(base({
      days: [day({ calories: 2000, bmrKcal: 1500, activeKcal: 600 })],
    }))
    expect(out).toMatch(/\(BMR 1500 \+ active 600 \+ TEF 210 kcal\/day, averaged\)/)
    expect(out).toMatch(/TEF is the thermic effect of food, 10\.5% of intake/)
  })

  it('counts no TEF on a day with no intake — that day is not counted at all', () => {
    // TEF rides on the intake, so it can never be carried across a gap the way
    // BMR is. A day with no food logged has no thermic effect to add, and is
    // already excluded for having no intake side.
    const out = buildWeeklyExport(base({
      days: [
        day({ date: '2026-07-19', calories: 2000, bmrKcal: 1500, activeKcal: 600 }),
        day({ date: '2026-07-20', calories: null, bmrKcal: 1500, activeKcal: 600 }),
      ],
    }))
    expect(out).toMatch(/over 1 day/)
    expect(out).toMatch(/expenditure 2310 kcal/)
  })

  it('names a surplus a surplus', () => {
    // 3000 in; out = 1500 + 500 + 315 TEF = 2315.
    const out = buildWeeklyExport(base({
      days: [day({ calories: 3000, bmrKcal: 1500, activeKcal: 500 })],
    }))
    expect(out).toMatch(/685 kcal SURPLUS/)
    expect(out).toMatch(/685 kcal\/day over maintenance/)
  })

  it('carries BMR across the days the scale was skipped, and says so', () => {
    // BMR is a scale reading — three weigh-ins in a week is normal. Dropping the
    // other four would discard the week; zeroing them would invent a surplus.
    const out = buildWeeklyExport(base({
      days: [
        day({ date: '2026-07-19', calories: 1900, bmrKcal: null, activeKcal: 600 }),
        day({ date: '2026-07-20', calories: 1900, bmrKcal: 1500, activeKcal: 600 }),
      ],
    }))
    expect(out).toMatch(/over 2 days/)      // the un-weighed day still counts
    expect(out).toMatch(/inherit the nearest reading/)
  })

  it('counts only days holding BOTH an intake and an expenditure', () => {
    const out = buildWeeklyExport(base({
      days: [
        day({ date: '2026-07-19', calories: 1900, bmrKcal: 1500, activeKcal: 600 }),
        day({ date: '2026-07-20', calories: 1900, bmrKcal: null, activeKcal: null }),
        day({ date: '2026-07-21', calories: null, bmrKcal: 1500, activeKcal: 600 }),
      ],
    }))
    // Day 2 inherits a BMR but has no active energy; day 3 logged no food.
    expect(out).toMatch(/over 1 day\b/)
  })

  it('skips the balance entirely rather than reporting half a week as zero', () => {
    const out = buildWeeklyExport(base({ days: [day({ calories: 1900 })] }))
    expect(out).not.toMatch(/Energy balance/)
  })

  it('flags the balance as an estimate wherever it appears', () => {
    const out = buildWeeklyExport(base({
      days: [day({ calories: 1900, bmrKcal: 1500, activeKcal: 600 })],
    }))
    expect(out).toMatch(/\(estimated\)/)
    expect(out).toMatch(/ESTIMATE, not a measurement/)
  })

  // ── Steps ──
  it('averages steps over every day that logged a count, cardio or not', () => {
    const out = buildWeeklyExport(base({
      days: [
        day({ date: '2026-07-19', steps: 10000 }),
        day({ date: '2026-07-20', steps: 12000 }),
        day({ date: '2026-07-21', steps: null }),
      ],
      // No cardio logged all week — it must not gate the step average.
      cardio: [],
    }))
    expect(out).toMatch(/\*\*Steps \(avg\/day\):\*\* 11000 across 2 days with a logged count/)
    expect(out).toMatch(/cardio session or not/)
  })

  // ── The prior week is NAMED, not embedded ──
  it('closes with the note pointing at the prior week\'s report', () => {
    const out = buildWeeklyExport(base({ weekLabel: 'Week 5' }))
    expect(out).toMatch(/\*Note: Week 5 report is provided manually for reference and comparison\.\*/)
  })

  it('falls back to unnumbered wording rather than printing "Week undefined"', () => {
    const out = buildWeeklyExport(base())
    expect(out).toMatch(/The previous week's report is provided manually/)
    expect(out).not.toMatch(/Week undefined/)
  })

  it('does not carry a second week of line-by-line data by default', () => {
    const out = buildWeeklyExport(base({ sessions: [session()] }))
    expect(out).not.toMatch(/PREVIOUS WEEK REFERENCE/)
  })

  it('has no second-week block at all — the field is gone, not merely unset', () => {
    // `previousWeekMarkdown` was deprecated on 2026-08-19 when the export
    // dropped to ONE week, and nothing has passed it since. The render branch
    // outlived the caller by three months; it is deleted here so the document
    // has exactly one shape.
    expect(buildWeeklyExport(base({ sessions: [session()] })))
      .not.toMatch(/PREVIOUS WEEK REFERENCE/)
  })

  /**
   * ── THE PRIOR-REPORT NOTE IS THE LAST LINE OF THE DOCUMENT ─────────────────
   * It used to sit FIRST of the three closing notes, under a rule and above two
   * statements about how the numbers were computed — so the one line pointing
   * at something outside the payload read as a third methodology footnote.
   *
   * It is the last thing in the file now. The Apple Watch caveat still governs
   * every number above it; it just is not the final sentence.
   */
  it('closes with the prior-report note, absolutely last', () => {
    const out = buildWeeklyExport(base({ weekLabel: 'Week 3' }))
    expect(out.trimEnd().endsWith(
      '*Note: Week 3 report is provided manually for reference and comparison.*',
    )).toBe(true)
    // Below the Apple Watch caveat, which still governs every number above it.
    expect(out.indexOf('*Note: Heart rate')).toBeLessThan(out.indexOf('is provided manually'))
  })

  it('still carries the Apple Watch note, verbatim, immediately above it', () => {
    const out = buildWeeklyExport(base())
    expect(out).toContain(
      '*Note: Heart rate, calories, and steps data are sourced from the Apple Watch'
      + ' and may not be entirely accurate.*',
    )
    expect(out.indexOf('*Note: Heart rate')).toBeLessThan(out.indexOf('is provided manually'))
  })

  // ── Swap-day attribution in the daily log ──
  it('calls a day with a logged session a training day, whatever the template says', () => {
    const out = buildWeeklyExport(base({
      // Wednesday: a scheduled rest day that received the swapped workout.
      days: [day({ date: '2026-08-05', weekdayLabel: 'Wed', isTrainingDay: false })],
      sessions: [session({ date: '2026-08-05', label: 'Delts & Arms' })],
    }))
    expect(out).toMatch(/\*\*Wed 2026-08-05\*\* · Workout \(off-plan \/ swapped\)/)
    expect(out).toMatch(/Delts & Arms/)
    expect(out).not.toMatch(/\*\*Wed 2026-08-05\*\* · Rest/)
  })

  it('leaves an ordinary training day unmarked', () => {
    const out = buildWeeklyExport(base({
      days: [day({ date: '2026-07-20', weekdayLabel: 'Mon', isTrainingDay: true })],
      sessions: [session({ date: '2026-07-20', label: 'Legs & Core A' })],
    }))
    expect(out).toMatch(/\*\*Mon 2026-07-20\*\* · Workout · /)
    expect(out).not.toMatch(/off-plan/)
  })

  it('keeps calling an unworked rest day a rest day', () => {
    const out = buildWeeklyExport(base({
      days: [day({ date: '2026-08-04', weekdayLabel: 'Tue', isTrainingDay: false })],
    }))
    // "Rest" and nothing else — it used to read "Rest · rest", the word twice.
    expect(out).toMatch(/\*\*Tue 2026-08-04\*\* · Rest\n/)
    expect(out).not.toMatch(/· Rest · rest/)
  })
})

/**
 * The InBody / Mass suppression, the effort line and the daily-shape
 * sparklines — everything added 2026-08-06 so the export neither prints a
 * fragment as a reading nor makes the reader rebuild a week's shape by hand.
 */
describe('body rows, effort and sparklines', () => {
  const day = (o: Partial<ExportDay>): ExportDay => ({
    date: '2026-07-19', weekdayLabel: 'Sun', isTrainingDay: false, weightKg: null,
    calories: null, proteinG: null, carbsG: null, fatG: null, steps: null, distanceM: null,
    trainingMin: null, sleepMin: null, deepMin: null, remMin: null, restingHr: null,
    wristTempDeltaC: null, bloodOxygenPct: null,
    hrvMs: null, waterMl: null, supplementsTaken: null, activeKcal: null, bmrKcal: null,
    weighInSkipReason: null, nutritionException: null, nutritionEstimated: false, ...o,
  })
  const session = (o: Partial<ExportSession> = {}): ExportSession => ({
    date: '2026-07-20', label: 'Upper A', volumeKg: 1000, setCount: null, failureSets: null,
    durationMin: null, avgBpm: null, caloriesBurned: null, sessionRpe: null,
    exercises: [], prs: [], ...o,
  })
  const body = (o: Partial<ExportBodyComp>): ExportBodyComp => ({
    date: '2026-07-19', weightKg: null, bmi: null, bodyFatPct: null, musclePercent: null,
    waterPercent: null, visceralFat: null, bmr: null, boneMineral: null,
    muscleMassKg: null, fatFreeMassKg: null, fatMassKg: null, proteinMassKg: null,
    boneMineralKg: null, waterMassKg: null, skeletalMuscleMassKg: null,
    estimatedWaistToHipRatio: null, ...o,
  })
  const base = (o: Partial<WeeklyExportInput> = {}): WeeklyExportInput => ({
    weekStart: '2026-08-02', weekEnd: '2026-08-08', weekLabel: 'Week 3',
    programLabel: 'Helix Cut',
    calorieGoal: 1955, proteinGoalG: 170, stepsGoal: 10000, sleepGoalHours: 8,
    days: [], sessions: [], volumeByMuscle: [], doms: [], cardio: [], ...o,
  })

  // ── §1 · no weight, no reading ──
  it('suppresses InBody/Mass for a body row that has lost its weight', () => {
    // 2026-08-02 live: a skeletal-muscle figure and a waist:hip ratio, no
    // weight. Every mass is derived from a bodyweight, so this is a fragment,
    // and it used to print two lines of twenty em-dashes.
    const out = buildWeeklyExport(base({
      days: [day({ date: '2026-08-02', weekdayLabel: 'Sun' })],
      bodyComp: [body({ date: '2026-08-02', skeletalMuscleMassKg: 26.8, estimatedWaistToHipRatio: 0.8 })],
    }))
    expect(out).not.toMatch(/Body Fat Percentage/)
    expect(out).not.toMatch(/Skeletal Muscle Mass:/)
    // The day line still tells the whole truth about the day.
    expect(out).toMatch(/weight — \[Skip: As Planned\]/)
  })

  it('still prints the reading the moment a weight is present', () => {
    const out = buildWeeklyExport(base({
      days: [day({ date: '2026-08-02', weekdayLabel: 'Sun', weightKg: 64.2 })],
      bodyComp: [body({ date: '2026-08-02', weightKg: 64.2, bodyFatPct: 17.3, skeletalMuscleMassKg: 26.8 })],
    }))
    expect(out).toMatch(/Weight Data: Weight: 64\.2 kg/)
    // The absent compartments dash rather than vanish — an omitted field is
    // indistinguishable from a zero to whoever reads this.
    expect(out).toMatch(/Muscle Mass \(Lean Soft Tissue\): — kg/)
    expect(out).toMatch(/Skeletal Muscle Mass: 26\.8 kg/)
  })

  it('does not suppress a genuine reading just because some fields are absent', () => {
    // 2026-07-27 after the manual re-entry: weighed, so it prints — the missing
    // fields inside it are em-dashes, which is what an em-dash is for.
    const out = buildWeeklyExport(base({
      days: [day({ date: '2026-07-27', weekdayLabel: 'Mon', weightKg: 64.5 })],
      bodyComp: [body({
        date: '2026-07-27', weightKg: 64.5, bmi: 22.3, bodyFatPct: 17.6, musclePercent: 78,
        muscleMassKg: 50.31, fatFreeMassKg: 53.15, skeletalMuscleMassKg: 26.6,
      })],
    }))
    expect(out).toMatch(/Weight Data: Weight: 64\.5 kg · BMI: 22\.3 · Body Fat Percentage: 17\.6%/)
    expect(out).toMatch(/Muscle Percentage: 78\.0% · Muscle Mass \(Lean Soft Tissue\): 50\.3 kg/)
  })

  // ── §5b · effort ──
  it('averages session effort over the RATED sessions and says how many', () => {
    const out = buildWeeklyExport(base({
      sessions: [session({ sessionRpe: 8 }), session({ sessionRpe: 9 }), session({ sessionRpe: null })],
    }))
    expect(out).toMatch(/- Average workout effort: 8\.5\/10 CR10 across 2 rated sessions/)
  })

  it('says "not rated" rather than scoring an unrated week 0', () => {
    const out = buildWeeklyExport(base({ sessions: [session({ sessionRpe: null })] }))
    expect(out).toMatch(/- Average workout effort: not rated/)
  })

  it('does not let an unrated session drag the mean down', () => {
    const out = buildWeeklyExport(base({
      sessions: [session({ sessionRpe: 9 }), session({ sessionRpe: null })],
    }))
    expect(out).toMatch(/9\.0\/10 CR10 across 1 rated session\b/)
  })

  // ── §5a · sparklines ──
  describe('sparkline', () => {
    it('scales from ZERO so a flat week looks flat', () => {
      // 11.2k/11.4k/11.7k steps is a flat week. Scaled from the minimum it
      // would read ▁▄█ — the classic way a sparkline lies.
      const s = sparkline([11200, 11400, 11700])
      expect(new Set(s).size).toBe(1)
      expect(s).toBe('███')
    })

    it('renders a real range across the full eight levels', () => {
      expect(sparkline([0, 100])).toBe('▁█')
    })

    it('marks a missing day distinctly from a small one', () => {
      const s = sparkline([1000, null, 0])
      expect(s[1]).toBe('·')
      expect(s[2]).toBe('▁')
      expect(s[1]).not.toBe(s[2])
    })

    it('is empty when nothing was logged at all', () => {
      expect(sparkline([null, null])).toBe('')
    })

    it('survives an all-zero week without dividing by zero', () => {
      expect(sparkline([0, 0, 0])).toBe('▁▁▁')
    })

    it('emits exactly one glyph per input day', () => {
      expect([...sparkline([1, null, 3, 4, null, 6, 7])]).toHaveLength(7)
    })
  })

  it('draws the week’s shape beside the totals it summarises', () => {
    const out = buildWeeklyExport(base({
      days: [
        day({ date: '2026-08-02', weekdayLabel: 'Sun', steps: 12000 }),
        day({ date: '2026-08-03', weekdayLabel: 'Mon', steps: 6000 }),
        day({ date: '2026-08-04', weekdayLabel: 'Tue', steps: null }),
      ],
      sessions: [session({ date: '2026-08-02', volumeKg: 4000 })],
    }))
    expect(out).toMatch(/- \*\*Daily shape\*\* \(SMT, scaled from zero/)
    // A rest day is a REAL zero for volume — no training happened.
    expect(out).toMatch(/- Volume: `█▁▁`/)
    // A missing step count is a GAP: the day may well have been walked.
    expect(out).toMatch(/- Steps:  `█▅·`/)
  })

  it('sums a double-session day into ONE volume bar', () => {
    const out = buildWeeklyExport(base({
      days: [
        day({ date: '2026-08-02', weekdayLabel: 'Sun' }),
        day({ date: '2026-08-03', weekdayLabel: 'Mon' }),
      ],
      sessions: [
        session({ date: '2026-08-02', volumeKg: 1000 }),
        session({ date: '2026-08-02', volumeKg: 1000 }),
        session({ date: '2026-08-03', volumeKg: 2000 }),
      ],
    }))
    // Both days did 2000 kg — the bars must match, or the shape is a lie.
    expect(out).toMatch(/- Volume: `██`/)
  })
})
