import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The Swift twin of `palette-discipline`.
 *
 * The native design mandate has one enforceable rule: **no raw colour in a
 * view**. Views name meanings (`Color.helix.textSecondary`, `HelixDomain.fuel`)
 * and the meanings are defined in exactly one place. A hex in a screen is not a
 * style choice, it is a token that was never designed — and it is invisible in
 * review, because `Color(hex: 0x7C5CFF)` looks deliberate.
 *
 * ── WHY THIS RUNS IN VITEST AND NOT IN `swift test` ─────────────────────────
 * The rule is about `native/HelixNative/Features/`, which belongs to the app
 * target — and the app target's tests need a simulator, so they do not run in
 * `npm run swift:core` or `swift:data`. A file-scanning check does not need to
 * compile Swift at all; it needs to read Swift. This suite already runs on every
 * change and already contains the TypeScript half of the same rule.
 *
 * It moves into a Swift test target at Wave 9, when `src/` is deleted.
 */

const FEATURES = 'native/HelixNative/Features'

/** Where colour is ALLOWED to be spelled out, because it is defined there. */
const TOKEN_FILES = [
  'native/HelixNative/DesignSystem/HelixTokens.swift',
  'native/HelixNative/DesignSystem/HelixPalette.swift',
]

/**
 * Screens written before the tokens existed.
 *
 * A ratchet, not a ban — exactly like the TypeScript twin. The Live Logger is
 * Wave 1's unfinished re-skin: it reads `HelixPalette`, and rewriting it inside
 * a tab wave would be a diff nobody could review. New files may not join this
 * list, and the list may only ever shrink.
 */
const LEGACY = new Set([
  'Logger/AtlasFigure.swift',
  'Logger/ExerciseCardView.swift',
  'Logger/HelixAtlas.swift',
  'Logger/LiveLoggerView.swift',
  'Logger/LoggerPreviewData.swift',
  'Logger/MuscleDistributionSheet.swift',
  'Logger/PhaseSheet.swift',
  'Logger/RestTimerBar.swift',
])

function swiftFiles(dir: string, base = dir, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) swiftFiles(path, base, out)
    else if (entry.endsWith('.swift')) out.push(path.slice(base.length + 1))
  }
  return out
}

/** Comments name deleted colours on purpose; they are documentation. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/.*$/gm, '')
}

describe('native token discipline', () => {
  it('no view spells a colour out', () => {
    expect(existsSync(FEATURES), `${FEATURES} is missing`).toBe(true)

    const offenders: string[] = []
    for (const file of swiftFiles(FEATURES)) {
      if (LEGACY.has(file)) continue
      const src = stripComments(readFileSync(join(FEATURES, file), 'utf8'))
      // `Color(hex:)` and `Color(red:green:blue:)` are the two ways to say a
      // colour without naming it. `0x` on its own is not enough — a bitmask or
      // a byte count is not a colour.
      for (const pattern of [/Color\(hex:/g, /Color\(\s*red:/g, /UIColor\(red:/g]) {
        const hits = src.match(pattern)
        if (hits) offenders.push(`${file} (${hits.length}× ${pattern.source})`)
      }
    }

    expect(
      offenders,
      'A view named a colour instead of a token. Add the token to ' +
        'HelixTokens.swift and use it — a colour you cannot name is a token ' +
        'you have not designed yet.',
    ).toEqual([])
  })

  it('the legacy list only shrinks', () => {
    // Every entry must still exist; a renamed or deleted file leaves a stale
    // exemption behind, and a stale exemption is how a ratchet stops ratcheting.
    for (const file of LEGACY) {
      expect(existsSync(join(FEATURES, file)), `${file} is exempt but gone`).toBe(true)
    }
    expect(LEGACY.size).toBeLessThanOrEqual(8)
  })

  it('the tokens themselves are defined in one place', () => {
    for (const file of TOKEN_FILES) {
      expect(existsSync(file), `${file} is missing`).toBe(true)
    }
    const tokens = readFileSync(TOKEN_FILES[0], 'utf8')
    // The four domain accents, spelled once each. If a fifth hue appears here
    // the mandate has been widened and that should be a deliberate diff.
    const hexes = [...tokens.matchAll(/0x[0-9A-Fa-f]{6}/g)].map((m) => m[0].toUpperCase())
    expect(new Set(hexes).size).toBe(hexes.length)
    expect(hexes).toEqual([
      '0X7C5CFF', '0XFFB13D', '0X3DFFB0', '0XB9A7FF',  // domain starts
      '0X38E1FF', '0XFF5E7A', '0X12C2B0', '0XDCEBFF',  // domain ends
      '0XFF453A',                                       // danger
    ])
  })
})
