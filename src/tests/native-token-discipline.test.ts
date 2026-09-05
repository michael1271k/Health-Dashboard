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
/** The tiles: the same rule, and no legacy list — they were re-skinned wholesale. */
const TILES = 'native/Packages/HelixUI/Sources/HelixUI/Tiles'

/** Where colour is ALLOWED to be spelled out, because it is defined there. */
const TOKEN_FILES = ['native/Packages/HelixUI/Sources/HelixUI/DesignSystem/HelixTokens.swift']

/** Where the widget scale is DEFINED, and so may spell a point size. */
const WIDGET_TYPE_FILE = 'HelixPrimitives.swift'

/**
 * Files whose deletion is part of the design and must not come back.
 *
 * `HelixSurface.swift` was a SECOND corner scale (`HelixRadius` 6/8/12/16) and a
 * second depth primitive (`helixCard`/`helixRow`) sitting beside `HelixCorner`
 * and `helixGlass`. Two scales for one decision is how a design system stops
 * being one, and the way that happens is somebody re-adding the file.
 *
 * `HelixPalette.swift` was the forty-hex Tailwind transliteration the whole app
 * used to read, and latterly the parking space for that second scale. Wave 2.4
 * re-skinned its last reader — the Live Logger — and deleted it. Every meaning
 * it carried now has exactly one definition, in `HelixTokens.swift`.
 */
const DELETED = [
  'native/Packages/HelixUI/Sources/HelixUI/DesignSystem/HelixSurface.swift',
  'native/Packages/HelixUI/Sources/HelixUI/DesignSystem/HelixPalette.swift',
]

/**
 * Screens written before the tokens existed.
 *
 * A ratchet, not a ban — exactly like the TypeScript twin, and as of Wave 2.4 it
 * is EMPTY: the Live Logger was the last holdout and it is on the tokens. It
 * stays here as the mechanism rather than the list, because the rule the empty
 * set states — no view may name a colour — is the one worth keeping enforceable.
 * New files may not join it and it may only ever shrink.
 */
const LEGACY = new Set<string>([])

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
    const scan = (root: string, exempt: Set<string>, patterns: RegExp[]) => {
      for (const file of swiftFiles(root)) {
        if (exempt.has(file)) continue
        const src = stripComments(readFileSync(join(root, file), 'utf8'))
        for (const pattern of patterns) {
          const hits = src.match(pattern)
          if (hits) offenders.push(`${root}/${file} (${hits.length}× ${pattern.source})`)
        }
      }
    }
    // `Color(hex:)` and `Color(red:green:blue:)` are the two ways to say a
    // colour without naming it. `0x` on its own is not enough — a bitmask or
    // a byte count is not a colour.
    scan(FEATURES, LEGACY, [/Color\(hex:/g, /Color\(\s*red:/g, /UIColor\(red:/g])
    // The tiles get the stricter reading: no `0x` either (nothing there masks
    // bits), and no `Color(white:)` — the old palette's grey was exactly that.
    expect(existsSync(TILES), `${TILES} is missing`).toBe(true)
    scan(TILES, new Set(), [/Color\(hex/g, /Color\(\s*red:/g, /Color\(\s*white:/g, /UIColor\(red:/g, /\b0x[0-9A-Fa-f]+/g])

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
    expect(LEGACY.size).toBe(0)
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
      '0X6B78F0', '0XE3A650', '0X46B39D', '0XA79FD6',  // domain starts: Ion Solar Tide Lunar
      '0X4FB6E8', '0XE07A7A', '0X2E9AA6', '0XC9D3EE',  // domain ends
      '0XE5484D',                                       // danger
      '0X4CAF87',                                       // good
      '0XFFD35C',                                       // record — the only fifth hue
      '0X5AA9E6',                                       // water
      '0X5B62C9', '0XE07A9A', '0X6E6E78',               // sleep: deep, rem, awake
    ])
    // Protein, carbs, fat and the core sleep stage are DOMAIN STOPS, not hues of
    // their own — if one of them ever gains a hex here, the four-accent rule has
    // quietly become a five- or six-accent one.
    expect(tokens).toContain('public static let protein = HelixDomain.fuel.end')
    expect(tokens).toContain('public static let carbs = HelixDomain.fuel.start')
    expect(tokens).toContain('public static let fat = HelixDomain.recover.start')
  })

  /**
   * §3.1 and §3.3: the scales exist so that a screen names a decision instead of
   * typing a number. A literal is not a smaller version of a token — it is the
   * absence of one, and it is invisible in review because `.padding(16)` looks
   * like somebody meant it.
   *
   * The ranges are where the damage was: 14/16/18 used interchangeably for the
   * same relationship, and ~200 hand-typed font sizes. Below 14 the numbers are
   * mostly optical nudges inside a component and banning them would be noise;
   * that line moves down as the screen waves land.
   */
  it('no screen spells a spacing or a font size', () => {
    const offenders: string[] = []
    for (const file of swiftFiles(FEATURES)) {
      if (LEGACY.has(file)) continue
      const src = stripComments(readFileSync(join(FEATURES, file), 'utf8'))
      for (const pattern of [
        /\.padding\((1[4-9]|2[0-9])\)/g,
        /spacing: (1[4-9]|2[0-9])\b/g,
        /\.system\(size:/g,
      ]) {
        const hits = src.match(pattern)
        if (hits) offenders.push(`${FEATURES}/${file} (${hits.length}× ${pattern.source})`)
      }
    }
    expect(
      offenders,
      'A screen typed a number instead of naming a step. Spacing is HelixSpace ' +
        '(xs 4 · s 8 · m 12 · l 16 · xl 24) and type is one of the six HelixType ' +
        'roles — nothing in the app is smaller than 11 pt.',
    ).toEqual([])
  })

  it('the widget faces go through HelixWidgetType', () => {
    // The faces ARE point-sized, deliberately: WidgetKit delivers no Dynamic
    // Type and a Lock Screen accessory is 40 pt tall. What the rule buys is that
    // every one of them is spelled the same way, so the widget scale can be swept
    // in one grep and the app's scale can ban `.system(size:` outright.
    const offenders = swiftFiles(TILES)
      .filter((file) => file !== WIDGET_TYPE_FILE)
      .filter((file) => /\.font\(\.system\(size:/.test(readFileSync(join(TILES, file), 'utf8')))
    expect(offenders, 'A tile face typed a bare font size; use HelixWidgetType.').toEqual([])
  })

  it('the deleted files stay deleted', () => {
    for (const file of DELETED) {
      expect(existsSync(file), `${file} came back`).toBe(false)
    }
  })
})
