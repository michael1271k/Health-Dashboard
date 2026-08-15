import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Every focus the picker offers must draw its OWN face at every size.
 *
 * ── THE BUG THIS FILE EXISTS TO MAKE IMPOSSIBLE ──────────────────────────────
 * The widget faces used to be reached through a second, internal enum
 * (`FaceFocus`, `PerfFace`) with fewer cases than the `AppEnum` the picker
 * shows. Every dispatcher bridged the gap with a ternary or a `default:`:
 *
 *     FocusFace(focus: focus == .water ? .steps : .calories)
 *     FocusFace(focus: focus == .sleep ? .sleep : .weight)
 *     case .volume: if family == .systemSmall { StreakFace(…) }
 *
 * So "Water" drew steps, "Well-being" drew the bathroom scale, "Volume" at Small
 * drew the streak, and Records and 1RM were the same face at Medium and Large.
 * Seven wrong widgets, and every one of them compiled — a fallback always has an
 * answer, which is exactly why it is the wrong tool here.
 *
 * Swift's exhaustiveness checking is the real guard now: the dispatchers switch
 * on `(focus, HelixSize)` with no `default:`, so a missing combination fails the
 * build. This file guards the things the compiler CANNOT see — that no
 * `default:` has crept back in, and that the arm for a focus actually mentions
 * that focus rather than confidently rendering its neighbour.
 */

const read = (path: string) => readFileSync(path, 'utf8')

const INTENTS = read('ios/App/HelixWidgets/HelixIntents.swift')
const LIFESTYLE = read('ios/App/HelixWidgets/HelixLifestyle.swift')
const TRAINING = read('ios/App/HelixWidgets/HelixTraining.swift')

const SIZES = ['small', 'medium', 'large'] as const

/**
 * Names a face is allowed to go by other than its focus's own.
 *
 * Deliberately tiny and deliberately explicit: an alias is a claim that two
 * words mean the same thing, and every one of them is a hole in the check.
 */
const ALIASES: Record<string, string[]> = {
  streak: ['consistency'],
  onerepmax: ['1rm', 'onerepmax'],
}

/** The `case a, b, c` line out of an `AppEnum` declaration. */
function focusCases(enumName: string): string[] {
  const m = INTENTS.match(new RegExp(`enum ${enumName}: String, AppEnum \\{\\s*\\n\\s*case ([^\\n]+)`))
  if (!m) throw new Error(`no case line found for ${enumName} — did the enum shape change?`)
  return m[1].split(',').map((s) => s.trim()).filter(Boolean)
}

/** The body of `switch <header> { … }`, matched by counting braces. */
function switchBody(source: string, header: string): string {
  const start = source.indexOf(header)
  if (start < 0) throw new Error(`no switch found for: ${header}`)
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i)
  }
  throw new Error(`unbalanced braces after: ${header}`)
}

/** The code a `case (.focus, .size):` arm runs, up to the next arm. */
function arm(body: string, focus: string, size: string): string | null {
  const head = `case (.${focus}, .${size}):`
  const at = body.indexOf(head)
  if (at < 0) return null
  const rest = body.slice(at + head.length)
  const next = rest.search(/\n\s*case \(/)
  return next < 0 ? rest : rest.slice(0, next)
}

const FAMILIES = [
  { name: 'FuelFocus', file: LIFESTYLE, header: 'switch (focus, HelixSize(family))', view: 'FuelView' },
  { name: 'BodyFocus', file: LIFESTYLE, header: 'switch (focus, HelixSize(family))', view: 'BodyView' },
  { name: 'TrainingFocus', file: TRAINING, header: 'switch (focus, HelixSize(family))', view: 'TrainingView' },
] as const

describe('widget focus parity', () => {
  it('finds the focus enums at all — a silent regex miss would pass everything', () => {
    expect(focusCases('FuelFocus')).toEqual(['calories', 'macros', 'water'])
    expect(focusCases('BodyFocus')).toEqual(['weight', 'sleep', 'wellbeing'])
    expect(focusCases('TrainingFocus').length).toBeGreaterThanOrEqual(6)
  })

  for (const family of FAMILIES) {
    describe(family.view, () => {
      // Two views share HelixLifestyle.swift, so the dispatcher is located by
      // the view it belongs to rather than by the file it lives in.
      const scope = family.file.slice(family.file.indexOf(`struct ${family.view}: View`))
      const body = switchBody(scope, family.header)
      const cases = focusCases(family.name)

      it('has an arm for every focus at every size', () => {
        for (const focus of cases) {
          for (const size of SIZES) {
            expect(arm(body, focus, size), `${family.view}: (.${focus}, .${size})`).not.toBeNull()
          }
        }
      })

      it('never falls back — a default: is how a focus draws its neighbour', () => {
        expect(body).not.toMatch(/\n\s*default\s*:/)
      })

      it('draws the focus that was asked for', () => {
        for (const focus of cases) {
          const key = focus.toLowerCase()
          // Stem, because a face is named for one of the thing the focus lists
          // several of: `records` is drawn by `RecordFocusFace`.
          const wanted = [key, key.replace(/s$/, ''), ...(ALIASES[key] ?? [])]
          for (const size of SIZES) {
            const code = (arm(body, focus, size) ?? '').toLowerCase()
            expect(
              wanted.some((w) => code.includes(w)),
              `${family.view}: (.${focus}, .${size}) renders "${code.trim()}", which names no form of "${focus}"`,
            ).toBe(true)
          }
        }
      })
    })
  }

  it('the shadow enums are gone and stay gone', () => {
    // They are the mechanism, not the symptom: a face-level enum that can fall
    // behind the picker enum will fall behind it again.
    expect(LIFESTYLE).not.toMatch(/enum FaceFocus/)
    expect(read('ios/App/HelixWidgets/HelixPerformance.swift')).not.toMatch(/enum PerfFace/)
  })
})
