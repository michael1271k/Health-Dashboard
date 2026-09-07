import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { toSetRows, type WeeklyExportInput, type ExportSet } from '@/lib/reports/weeklyExport'

/**
 * ── THE SHIP GATE FOR EXPORT v3, AS ARITHMETIC RATHER THAN AS A VIBE ────────
 *
 * The wave's acceptance criterion was "paste the rich week into a model and
 * every set is recoverable". That is a real requirement and a useless test:
 * it needs a model, it is not reproducible, and it passes or fails on a
 * judgement nobody can re-run in CI.
 *
 * So it is written as the thing it actually means. The document is parsed back
 * into sets using ONLY the grammar the document itself declares — split on
 * ` · `, read the legend off the heading, read the set token — and the result
 * is compared against the payload the document was built from. If a set cannot
 * be recovered, or comes back with the wrong load, reps, effort or flags, this
 * fails and names it.
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

/** One set as the parser recovers it. Flags in the document's own fixed order. */
interface Recovered {
  load: number
  reps: number
  rpe: number | null
  flags: string
  quality: string | null
  side: 'L' | 'R' | null
}

/**
 * `75×12@9.5F`, `0×55t@9`, `L5×15@8`. The grammar, as a reader who has only the
 * `##   exercise` legend would implement it.
 */
function parseSetToken(token: string): Recovered {
  const side = token.startsWith('L') ? 'L' : token.startsWith('R') ? 'R' : null
  const body = side ? token.slice(1) : token
  const m = /^(-?[\d.]+)×(-?[\d.]+)(t?)(?:@([\d.]+))?([WGDF]*)(?:Q:(\w+))?$/.exec(body)
  expect(m, `unparseable set token: ${token}`).not.toBeNull()
  const [, load, reps, , rpe, flags, quality] = m!
  return {
    load: Number(load),
    reps: Number(reps),
    rpe: rpe == null ? null : Number(rpe),
    flags: flags ?? '',
    quality: quality ?? null,
    side,
  }
}

/** Every set the document states, keyed `date|exercise`, in written order. */
function recoverSets(markdown: string): Map<string, Recovered[][]> {
  const out = new Map<string, Recovered[][]>()
  const lines = markdown.split('\n')
  let inSessions = false
  let date: string | null = null

  for (const line of lines) {
    // A legend FIRST. `##   exercise` also starts with `'## '`, so testing for
    // a section heading before ruling the legend out closes the SESSIONS
    // section on the line immediately after opening it — and then the parser
    // silently recovers nothing, which every assertion below would pass.
    if (line.startsWith('##   ')) continue
    if (line.startsWith('## ')) {
      inSessions = line.startsWith('## SESSIONS')
      continue
    }
    if (!inSessions) continue

    if (!line.startsWith('  ')) {
      // A session row. Its first field is the date every indented line below
      // it belongs to — that indent is the only structure the document has.
      date = line.split(' · ')[0]
      continue
    }
    const cells = line.slice(2).split(' · ')
    if (cells[0] === 'PR') continue
    const [name, , , , ...tokens] = cells
    if (tokens.length === 1 && tokens[0] === '—') {
      out.set(`${date}|${name}`, [])
      continue
    }
    out.set(`${date}|${name}`, tokens.map((t) => t.split('|').map(parseSetToken)))
  }
  return out
}

/** What the payload says the set was — the same collapsing rule, applied once. */
function expectedRows(sets: readonly ExportSet[]): ExportSet[][] {
  return toSetRows(sets).map((r) =>
    (r.single ? [r.single] : [r.left, r.right].filter((x): x is ExportSet => x != null)))
}

const flagsOf = (s: ExportSet) =>
  `${s.warmup ? 'W' : ''}${s.ghost ? 'G' : ''}${s.dropset ? 'D' : ''}${s.failure ? 'F' : ''}`

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
          expect(got, `no line in the document for ${key}`).toBeDefined()

          const want = expectedRows(exercise.sets)
          expect(got!.length, `${key}: set count`).toBe(want.length)

          want.forEach((sides, i) => {
            expect(got![i].length, `${key} set ${i + 1}: sides`).toBe(sides.length)
            sides.forEach((set, half) => {
              const r = got![i][half]
              expect(r.load, `${key} set ${i + 1}: load`).toBe(set.weightKg)
              expect(r.reps, `${key} set ${i + 1}: reps`).toBe(set.reps)
              expect(r.rpe, `${key} set ${i + 1}: rpe`).toBe(set.rpe)
              expect(r.flags, `${key} set ${i + 1}: flags`).toBe(flagsOf(set))
              expect(r.quality ?? null, `${key} set ${i + 1}: quality`).toBe(set.quality ?? null)
              // A pair states its sides; a plain set states none. Getting this
              // wrong is how "L 5×15, R 5×17" reads as two separate sets.
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

  it('states the rich week in no more than 120 lines', () => {
    // The wave's other ship gate, and the reason the grammar exists at all.
    const rich = fixture.cases.find((c) => c.name.startsWith('the rich week'))!
    const lines = rich.expected.markdown.split('\n').length
    expect(lines, `the rich week is ${lines} lines`).toBeLessThanOrEqual(120)
  })

  it('never puts the field separator inside a field', () => {
    // Rule 2 of the grammar, and the one that makes `split(' · ')` a complete
    // parser. A session labelled "Upper · A" would break every reader silently.
    for (const { name, expected } of fixture.cases) {
      for (const line of expected.markdown.split('\n')) {
        if (line.startsWith('#') || line.startsWith('|')) continue
        for (const cell of line.split(' · ')) {
          expect(cell.includes('·'), `${name}: "${cell}" carries the separator`).toBe(false)
        }
      }
    }
  })
})
