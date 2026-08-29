/**
 * THE MACHINE-READABLE HALF OF THE EXPORT.
 *
 * ── WHY A SECOND REPRESENTATION OF THE SAME WEEK ─────────────────────────────
 * The markdown body is written for a reader — grouped, labelled, em-dashed,
 * with the units spelled out and the caveats sitting on the lines they qualify.
 * That is the right shape for a coach and a decent shape for a model, and it is
 * a terrible shape for a spreadsheet. Anything that wants to CHART this week
 * has to parse "Sleep: 9h 11m · HRV: 62 ms" back into numbers, and every tool
 * that does it will do it slightly differently and get the em-dashes wrong.
 *
 * So the week is emitted twice: once for people, once for machines. They are
 * not two sources of truth — this block is a serialisation of the SAME
 * `WeeklyExportInput` the markdown above was rendered from, so the two cannot
 * drift apart the way a hand-maintained summary table always eventually does.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────────
 * It does not reformat, round, or unit-convert. Kilograms stay kilograms and
 * minutes stay minutes, because the receiving end can do arithmetic and cannot
 * undo a rounding. `null` means "not recorded" here exactly as `—` does above;
 * a missing key would let a consumer infer zero, which is the single failure
 * mode this whole document is built to prevent.
 *
 * ── AND WHY IT IS LAST ───────────────────────────────────────────────────────
 * A model reading top-to-bottom should meet the human document first. A tool
 * reading the file looks for the fence and ignores everything else. Putting the
 * block at the end serves both without either paying for the other.
 */
import type { WeeklyExportInput } from '@/lib/reports/weeklyExport'
import { derivedWeek } from '@/lib/reports/derived'

/**
 * Bumped when the SHAPE changes in a way a consumer could break on — a removed
 * key or a changed unit. Added keys do not move it: a parser that ignores what
 * it does not know keeps working, which is the whole reason to version at all.
 */
export const WEEK_JSON_SCHEMA = 'helix.week/1'

/**
 * The whole week as one JSON object, inside a fenced block.
 *
 * The payload is passed through with its own field names intact rather than
 * remapped into a "nicer" external schema. Two vocabularies for one week is how
 * a consumer ends up reading `muscleMass` and getting fat-free mass — the names
 * here are the names the app's own types use, and the markdown above explains
 * what each of them means.
 */
export function weekJsonBlock(input: WeeklyExportInput): string[] {
  const payload = {
    schema: WEEK_JSON_SCHEMA,
    week: {
      start: input.weekStart,
      end: input.weekEnd,
      label: input.weekLabel ?? null,
      program: input.programLabel,
      phase: input.phaseLabel ?? null,
    },
    targets: {
      calorieGoal: input.calorieGoal,
      proteinGoalG: input.proteinGoalG,
      stepsGoal: input.stepsGoal,
      sleepGoalHours: input.sleepGoalHours,
      waterGoalMl: input.waterGoalMl ?? null,
      // The rungs actually in force, day by day — not the goal row as it stands
      // today. A lever pulled on Wednesday does not retroactively re-mark Sunday.
      periods: input.targetPeriods ?? [],
    },
    days: input.days,
    sessions: input.sessions,
    cardio: input.cardio ?? [],
    bodyComp: input.bodyComp ?? [],
    doms: input.doms,
    fatigue: input.fatigue ?? [],
    volumeByMuscle: input.volumeByMuscle,
    tonnageByMuscle: input.tonnageByMuscle ?? [],
    supplementProtocol: input.supplementProtocol ?? [],
    ledger: input.ledger ?? [],
    /**
     * The derived block rides along INSIDE the machine payload, under its own
     * key, where the markdown keeps it below a heading that names it. Both
     * placements say the same thing in the idiom of their format: a consumer
     * reading `derived.*` knows precisely what it is holding, and one reading
     * `days[].*` knows it is holding measurements.
     */
    derived: derivedWeek(input),
  }
  // Two-space indent: a JSON blob on one line is 40 kB the reader has to scroll
  // past, and diffing two weeks of it is impossible. Stable key order comes free
  // from the object literal above, which keeps the block deterministic.
  return ['```json', JSON.stringify(payload, null, 2), '```']
}
