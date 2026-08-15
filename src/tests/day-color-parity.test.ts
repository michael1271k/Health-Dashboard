import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { DAY_COLOR } from '@/lib/theme/palette'

/**
 * The widget tints its calendar and its Today face with the routine day's own
 * colour, and it cannot import `palette.ts` — a Swift extension has no access
 * to the web bundle, and there is no App Group to hand it one.
 *
 * So there are two hand-kept copies of one table, and the ONLY thing keeping
 * them honest is this ratchet: add a plan day on the web side and this fails
 * until `Helix.day` in HelixPalette.swift learns the key. The failure mode it
 * prevents is silent — a new day simply renders steel on the widget and its own
 * colour everywhere else, which reads as a rendering bug in the one place the
 * user cannot inspect.
 *
 * The same discipline `palette-discipline.test.ts` applies to raw hexes.
 */

const SWIFT = readFileSync('ios/App/HelixWidgets/HelixPalette.swift', 'utf8')

/** The `case "cb_a": return steel` lines inside `Helix.day`. */
function swiftDayMap(): Map<string, string> {
  const fn = SWIFT.slice(SWIFT.indexOf('static func day('))
  const body = fn.slice(0, fn.indexOf('\n  }'))
  const out = new Map<string, string>()
  for (const m of body.matchAll(/case\s+"([a-z0-9_]+)":\s*return\s+(\w+)/g)) {
    out.set(m[1], m[2])
  }
  return out
}

/** `steel` → `#8E9AAC`, read out of the same Swift file's own constants. */
function swiftHexes(): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of SWIFT.matchAll(/static let (\w+)\s*=\s*Color\(hex: 0x([0-9A-Fa-f]{6})\)/g)) {
    out.set(m[1], `#${m[2].toUpperCase()}`)
  }
  return out
}

describe('DAY_COLOR parity — TypeScript ↔ Swift', () => {
  const swift = swiftDayMap()
  const hex = swiftHexes()

  it('the Swift mirror knows every key the web palette defines', () => {
    const missing = Object.keys(DAY_COLOR).filter((k) => !swift.has(k))
    expect(missing).toEqual([])
  })

  it('does not invent a key the web palette has never heard of', () => {
    // A stale key is how the two drift the other way: the widget keeps tinting a
    // day the plan deleted.
    const extra = [...swift.keys()].filter((k) => !(k in DAY_COLOR))
    expect(extra).toEqual([])
  })

  it('agrees on the actual COLOUR, not merely the key', () => {
    for (const [key, web] of Object.entries(DAY_COLOR)) {
      const named = swift.get(key)!
      expect(hex.get(named), `${key} → ${named}`).toBe(web.toUpperCase())
    }
  })

  it('resolves every Swift colour name against a real constant', () => {
    for (const name of new Set(swift.values())) {
      expect(hex.has(name), `Helix.${name} is not a Color(hex:) constant`).toBe(true)
    }
  })
})
