import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ONE SESSION, ONE TONNAGE.
 *
 * `SessionVolume.sessionVolumeKg` is the single implementation of "what a
 * session weighed", and its header states the rule in one sentence:
 *
 *   > A ghost weighs nothing; a warm-up still counts.
 *
 * It already drops the ghosts itself. So a caller that filters to WORKING sets
 * before calling it is not adding a safety check — it is overruling the rule,
 * and the result is a second, lower tonnage for the same workout.
 *
 * That is not hypothetical. On 2026-09-11 the Workout tab's card and the Pulse
 * card said **8,815 kg** for a Legs & Core B session whose own summary page,
 * `SessionEditing.totals`, `closeSession` and `workout_sessions.total_volume_kg`
 * all said **9,715 kg**. The gap was exactly one 60 kg × 15 warm-up on the leg
 * press, and nothing on either screen told the reader which number was the
 * workout. `SessionAnalysis.report` carries the same note for the same reason:
 * it had the identical bug in the other direction in Wave 7.
 *
 * ── WHY A SOURCE SCAN AND NOT A UNIT TEST ───────────────────────────────────
 * A unit test can only pin the arithmetic, and the arithmetic was never wrong.
 * What went wrong is a CALL SITE — five of them, in three files, each of which
 * looked locally reasonable. The only thing that catches the sixth is a rule
 * about how the function may be called, which is a fact about source text.
 *
 * Set COUNTS are deliberately not covered: `SessionDetail.toRows(working…)` is
 * correct and must stay. A warm-up is not a set of the prescription; it is
 * still weight that was lifted. Two questions, two answers, on purpose — see
 * `phase-3-e0-truth`'s "two set counts on purpose".
 */

const ROOTS = ['native/Onyx/Features', 'native/Packages/OnyxCore/Sources', 'native/Packages/OnyxData/Sources']

/**
 * Exempt, and each one is a DIFFERENT question from "what did this session
 * weigh":
 *
 * · `ExerciseSummary.swift` — `bestSessionVolumeKg` is a RECORD, and a record
 *   is a claim about working sets. Its own header says so.
 * · `ExerciseDetailView.swift` — the per-session line in a movement's history
 *   reads `4 sets · 4,230 kg`, and the two halves must describe the same rows
 *   or the line contradicts itself.
 */
const EXEMPT = ['ExerciseSummary.swift', 'ExerciseDetailView.swift']

function swiftFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...swiftFiles(path))
    else if (entry.endsWith('.swift')) out.push(path)
  }
  return out
}

describe('session tonnage has one rule', () => {
  it('never hands sessionVolumeKg a working-set-filtered list', () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of swiftFiles(root)) {
        if (EXEMPT.some((name) => file.endsWith(name))) continue
        const source = readFileSync(file, 'utf8')
        // Newlines collapsed BEFORE matching: the worst of the five offenders
        // wrapped its argument onto the next line —
        //     sessionVolumeKg(
        //         rows.filter { SetTags.isWorkingSet($0.setType) }.map(…)
        // — so a line-at-a-time scan is a check that passes the one case that
        // is hardest to see in review.
        const flat = source.replace(/\s+/g, ' ')
        // The whole argument, not "up to the first `.map`". Requiring a `.map`
        // made two existing call sites invisible (`Draft.swift` passes a
        // pre-built `[VolumeSet]` from `volumeSets(committed)`), and the sixth
        // offender this test exists to catch — `sessionVolumeKg(workingSets)` —
        // is exactly that shape.
        for (const match of flat.matchAll(/sessionVolumeKg\(\s*([^)]{0,160})/g)) {
          const argument = match[1]
          // The filter inline in the argument, and the two spellings of an
          // already-filtered local passed straight into it.
          if (/isWorkingSet/.test(argument) || /^(?:\w+\.)?(?:working|work)\b/.test(argument)) {
            offenders.push(`${file}  sessionVolumeKg(${argument}…`)
          }
        }
      }
    }
    expect(offenders, `warm-ups count toward tonnage — see this file's header\n${offenders.join('\n')}`)
      .toEqual([])
  })

  it('knows what it is scanning', () => {
    // A regex suite that silently stops matching any files is a green test
    // that checks nothing. 2026-09: ~40 call sites across the three roots.
    const total = ROOTS.flatMap(swiftFiles)
      .filter((f) => readFileSync(f, 'utf8').includes('sessionVolumeKg('))
    expect(total.length).toBeGreaterThan(5)
  })
})
