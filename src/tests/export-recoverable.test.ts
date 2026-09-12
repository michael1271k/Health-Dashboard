import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { toSetRows, type WeeklyExportInput, type ExportSet } from '@/lib/reports/weeklyExport'

/**
 * ── THE SHIP GATE, AS ARITHMETIC RATHER THAN AS A VIBE ──────────────────────
 *
 * The acceptance criterion has never changed: paste the week into a model, or
 * hand it to a coach, and every set is recoverable. That is a real requirement
 * and a useless test — it needs a model, it is not reproducible, and it passes
 * or fails on a judgement nobody can re-run in CI.
 *
 * So it is written as the thing it actually means. The document is parsed back
 * into sets using ONLY what a reader has — the headings, the labelled rows, and
 * the set lines as they are written — and the result is compared against the
 * payload the document was built from. If a set cannot be recovered, or comes
 * back with the wrong load, reps, effort or flags, this fails and names it.
 *
 * ── WHAT CHANGED FROM v3, AND WHAT DID NOT ──────────────────────────────────
 * v3 guaranteed that `line.split(' · ')` was a COMPLETE parser: every record
 * was one row of fields under a legend that named its columns. That guarantee
 * is retired — it is what made the document unreadable, and no consumer ever
 * used it. What is NOT retired is the obligation underneath it: every set that
 * went in must come out, with its numbers intact, from the document alone.
 *
 * The parser below is deliberately naive and self-contained. It imports no
 * helper from the renderer beyond `toSetRows`, which it needs for one reason
 * only: to know what the EXPECTED sets are (a unilateral pair is one set), not
 * how they are written. A parser that shared the renderer's code would prove
 * nothing — it would agree with the renderer by construction, which is exactly
 * the failure this gate exists to rule out.
 */

interface Fixture {
  cases: Array<{ name: string; input: WeeklyExportInput; expected: { markdown: string } }>
}

// Read from the repo root, where vitest runs. `import.meta.url` is not a file
// URL under the transform, so `new URL(..., import.meta.url)` throws on import
// and takes the whole suite with it.
const fixture: Fixture = JSON.parse(readFileSync(
  'native/Packages/OnyxCore/Tests/OnyxCoreTests/Fixtures/weekly-export.json', 'utf8',
))

/** One side of one set, as the parser recovers it. */
interface Recovered {
  load: number
  reps: number
  rpe: number | null
  tags: string[]
  side: 'L' | 'R' | null
}

/**
 * `75 kg × 12 @ 8.5 Hard — momentum`, `17 reps`, `55 sec @ 9 Very Hard`.
 *
 * Implemented the way a reader with only the legend would implement it: the
 * value, then an optional `@ <number> <word>`, then optional tags after one em
 * dash. Nothing here knows the renderer's field order.
 */
function parseSide(text: string): Recovered {
  const side = /^L /.test(text) ? 'L' : /^R /.test(text) ? 'R' : null
  let body = side ? text.slice(2) : text

  const tags: string[] = []
  const dash = body.indexOf(' — ')
  if (dash >= 0) {
    tags.push(...body.slice(dash + 3).split(', ').map((t) => t.trim()).filter(Boolean))
    body = body.slice(0, dash)
  }

  let rpe: number | null = null
  const at = body.indexOf(' @ ')
  if (at >= 0) {
    const effort = body.slice(at + 3)
    const num = /^(\d+(?:\.\d+)?)\s/.exec(`${effort} `)
    expect(num, `unparseable effort: ${effort}`).not.toBeNull()
    rpe = Number(num![1])
    body = body.slice(0, at)
  }

  const num = (s: string): number => Number(s.replace(/,/g, ''))
  // `75 kg × 12` — loaded. `17 reps` — unloaded. `55 sec` — a timed hold, where
  // the count is seconds and the document says so in the unit.
  const loaded = /^([\d,.]+) kg × ([\d,.]+)$/.exec(body)
  if (loaded) return { load: num(loaded[1]), reps: num(loaded[2]), rpe, tags, side }
  const bare = /^([\d,.]+) (?:reps|sec)$/.exec(body)
  expect(bare, `unparseable set value: "${body}"`).not.toBeNull()
  return { load: 0, reps: num(bare![1]), rpe, tags, side }
}

/** One set line: `` `S1` L 5 kg × 15 @ 8 Challenging · R … → scores 5 kg × 15 ``. */
function parseSetLine(line: string): Recovered[] {
  const m = /^`([^`]+)` (.*)$/.exec(line.replace(/\s+$/, ''))
  expect(m, `unparseable set line: ${line}`).not.toBeNull()
  // The scored figure is a RESTATEMENT of the two sides, not a third set.
  const body = m![2].split(' → scores ')[0]
  return body.split(' · ').map(parseSide)
}

/**
 * Every set the document states, keyed `date|exercise`, in written order.
 *
 * The structure it walks is the document's own: `## DAY n · Wkd · <date> · …`
 * opens a day, `### Session …` opens a session inside it, `**Name** · …` opens
 * an exercise, and every ``` `…` ``` line under that is one of its sets. No
 * indentation is load-bearing and no column is counted.
 */
function recoverSets(markdown: string): Map<string, Recovered[][]> {
  const out = new Map<string, Recovered[][]>()
  let date: string | null = null
  let inSession = false
  let key: string | null = null

  for (const raw of markdown.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    const day = /^## DAY \d+ · \w+ · (\d{4}-\d{2}-\d{2}) · /.exec(line)
    if (day) { date = day[1]; inSession = false; key = null; continue }
    // A session on a date the week has no day record for is printed below the
    // days, under its own date. It is still the week's work and must still be
    // recoverable — losing a whole workout is the defect this guards against.
    const stranded = /^\*\*(\d{4}-\d{2}-\d{2})\*\*\s*$/.exec(line)
    if (stranded) { date = stranded[1]; inSession = false; key = null; continue }
    if (/^### Session\b/.test(line)) { inSession = true; key = null; continue }
    // A cardio block or the day's computed row closes the session above it.
    if (/^\*\*(Cardio|Derived|PRs)\*\*/.test(line)) { inSession = false; key = null; continue }
    if (!inSession) continue

    const ex = /^\*\*(.+?)\*\* · (.*)$/.exec(line)
    if (ex) {
      key = `${date}|${ex[1]}`
      // An exercise that logged nothing says so in words, and still appears —
      // silence would let a reader conclude it was never programmed.
      out.set(key, ex[2].includes('**no sets logged**') ? [] : [])
      continue
    }
    if (key && line.startsWith('`')) out.get(key)!.push(parseSetLine(line))
  }
  return out
}

/** What the payload says the set was — the same collapsing rule, applied once. */
function expectedRows(sets: readonly ExportSet[]): ExportSet[][] {
  return toSetRows(sets).map((r) =>
    (r.single ? [r.single] : [r.left, r.right].filter((x): x is ExportSet => x != null)))
}

/** The tags the document is obliged to carry for a set. */
function expectedTags(s: ExportSet, anyRated: boolean): string[] {
  const tags: string[] = []
  if (s.rpe == null && anyRated && !s.warmup && !s.ghost) tags.push('RPE not reported')
  if (s.warmup) tags.push('warm-up')
  if (s.ghost) tags.push('ghost')
  if (s.dropset) tags.push('drop set')
  // RPE 10 IS "Failure" on the ladder, and the document suppresses the tag when
  // the rating already carries the word — "Failure, to failure" states one fact
  // twice. The rule is the renderer's; this restates it so the gate tests what
  // the document actually promises rather than what it happens to do.
  if (s.failure && !s.warmup && s.rpe !== 10) tags.push('to failure')
  return tags
}

describe('every set survives the round trip through the document', () => {
  for (const { name, input, expected } of fixture.cases) {
    if (!input.sessions.length) continue

    it(`recovers every set of "${name}" from the markdown alone`, () => {
      const recovered = recoverSets(expected.markdown)

      let checked = 0
      for (const session of input.sessions) {
        for (const exercise of session.exercises) {
          const key = `${session.date}|${exercise.name}`
          const got = recovered.get(key)
          expect(got, `no block in the document for ${key}`).toBeDefined()

          const want = expectedRows(exercise.sets)
          expect(got!.length, `${key}: set count`).toBe(want.length)
          const anyRated = exercise.sets.some((s) => !s.warmup && !s.ghost && s.rpe != null)

          want.forEach((sides, i) => {
            expect(got![i].length, `${key} set ${i + 1}: sides`).toBe(sides.length)
            sides.forEach((set, half) => {
              const r = got![i][half]
              expect(r.load, `${key} set ${i + 1}: load`).toBe(set.weightKg)
              expect(r.reps, `${key} set ${i + 1}: reps`).toBe(set.reps)
              expect(r.rpe, `${key} set ${i + 1}: rpe`).toBe(set.rpe)
              // Every tag the set carries is stated. The document may add the
              // set-quality word on top, which is why this is a containment
              // check rather than an equality one.
              for (const tag of expectedTags(set, anyRated)) {
                expect(r.tags, `${key} set ${i + 1}: missing tag "${tag}"`).toContain(tag)
              }
              // A pair states its sides; a plain set states none. Getting this
              // wrong is how "L 5 × 15, R 5 × 17" reads as two separate sets.
              if (sides.length > 1) expect(r.side, `${key} set ${i + 1}: side`).toBe(set.side)
              else expect(r.side).toBeNull()
              checked += 1
            })
          })
        }
      }
      // A parser that recovered nothing would pass every assertion above.
      expect(checked, 'no sets were actually checked').toBeGreaterThan(0)
    })
  }

  it('states a unilateral pair once, and shows what it scored', () => {
    /* The invariant the whole app counts by, and the one a reader consistently
       gets wrong when they meet two sided rows. The document does the
       arithmetic in front of them rather than leaving it implied. */
    const rich = fixture.cases.find((c) => c.name.startsWith('the rich week'))!
    const line = rich.expected.markdown.split('\n')
      .find((l) => l.includes('L 5 kg × 15') && l.includes('R 5 kg × 17'))
    expect(line, 'the unilateral pair is no longer in the document').toBeDefined()
    // min(5, 5) kg × min(15, 17) reps — not 17, and not both sides added.
    expect(line).toContain('→ scores 5 kg × 15')
    expect(line!.startsWith('`S1`'), 'the pair took more than one set number').toBe(true)
  })

  it('keeps the rich week inside its budget', () => {
    // Day-major costs lines that v3's grammar did not. ~19 kB is about five
    // thousand tokens, which is a cost a weekly document can carry.
    const rich = fixture.cases.find((c) => c.name.startsWith('the rich week'))!
    const md = rich.expected.markdown
    expect(md.split('\n').length, `the rich week is ${md.split('\n').length} lines`)
      .toBeLessThanOrEqual(400)
    expect(md.length).toBeLessThanOrEqual(25_000)
  })

  it('never puts the field separator inside a set value', () => {
    // ` · ` separates the two halves of a unilateral pair on a set line. A value
    // carrying one would split into two sides that were never logged.
    for (const { name, expected } of fixture.cases) {
      for (const raw of expected.markdown.split('\n')) {
        if (!raw.startsWith('`')) continue
        for (const side of parseSetLine(raw)) {
          expect(Number.isFinite(side.load), `${name}: ${raw}`).toBe(true)
          expect(Number.isFinite(side.reps), `${name}: ${raw}`).toBe(true)
        }
      }
    }
  })
})
