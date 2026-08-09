import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A ratchet, not a ban.
 *
 * There are ~297 hex literals in src outside the palette, and the honest thing
 * to say about them is that ~94% are CORRECT — they spell out the exact value
 * of a palette constant, usually with an alpha suffix. Converting all of them
 * would be a 60-file diff with no user-visible change and real regression risk,
 * so most are deliberately left alone.
 *
 * An eslint rule was the obvious alternative and is the wrong tool: it would
 * fire on ~45 legitimately-deferred files, need a blanket disable, and teach
 * everyone that the rule is noise.
 *
 * So this test allows the debt but stops it growing:
 *   · a NEW hex that is not a palette value fails immediately,
 *   · and the total can only go down.
 *
 * It has already earned its place — the sibling token test found a fourth copy
 * of a phantom ember in a file nobody would have thought to check, and this one
 * caught `#3D7ABC`, a one-character typo for SAPPHIRE that no eye would ever
 * catch on screen.
 */

/** Comments are documentation, not values — several deleted colours are named there on purpose. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) sourceFiles(path, out)
    else if (/\.tsx?$/.test(entry)) out.push(path)
  }
  return out
}

const PALETTE_SRC = readFileSync('src/lib/theme/palette.ts', 'utf8')
const PALETTE_VALUES = new Set(
  [...PALETTE_SRC.matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0].toUpperCase()),
)

/**
 * Hexes that are NOT palette values and are allowed to remain, each with the
 * reason. Anything not on this list and not in the palette is a new orphan.
 *
 * Most of these are real semantic colours that deserve promoting to named
 * palette exports; they are listed rather than promoted so that this commit
 * stays about the BODY system. Shrinking this list is the point.
 */
const ALLOWED_ORPHANS: Record<string, string> = {
  '#C9A227': 'a second gold, for records in the logger — reconciled with GOLD in the timeline commit',
  '#E0A03C': 'AMBER — "one more session: earned, not yet due". A real state with no palette name yet',
  '#9A6DD7': 'DROP — drop sets. A real set-type with no palette name yet',
  '#050608': 'auth page backdrop, darker than OBSIDIAN on purpose',
  '#0C0D11': 'Sheet panel fill — deliberately a touch above the canvas',
  '#0F1115': 'global-error surface, rendered when the app cannot boot',
  '#C8542A': 'auth CTA gradient end',
  '#8B7CF6': 'micronutrient chart series',
  '#5FB8E8': 'micronutrient chart series',
  '#6CC1EE': 'micronutrient chart series',
  '#2E6AAE': 'micronutrient chart series',
  '#3A4250': 'chart gridline, darker than HAIRLINE',
  '#4A5462': 'chart axis tick',
  '#4A5568': 'chart axis tick',
}

/**
 * Today's count. This number may only ever be lowered.
 * If a change legitimately adds colour, convert something else first.
 */
const HEX_CEILING = 297

function scan() {
  const files = sourceFiles('src').filter(
    (f) => !f.includes('/tests/') && !f.endsWith('theme/palette.ts'),
  )
  let total = 0
  const orphans: Array<{ file: string; hex: string }> = []
  for (const file of files) {
    for (const m of stripComments(readFileSync(file, 'utf8')).matchAll(/#[0-9A-Fa-f]{6}\b/g)) {
      const hex = m[0].toUpperCase()
      total += 1
      if (!PALETTE_VALUES.has(hex) && !(hex in ALLOWED_ORPHANS)) orphans.push({ file, hex })
    }
  }
  return { total, orphans }
}

describe('palette discipline', () => {
  it('introduces no hex that is neither a palette value nor a listed exception', () => {
    const { orphans } = scan()
    expect(
      orphans,
      orphans.length
        ? `New colours that belong in src/lib/theme/palette.ts:\n` +
          orphans.map((o) => `  ${o.hex}  ${o.file}`).join('\n')
        : '',
    ).toEqual([])
  })

  it('never grows the total', () => {
    const { total } = scan()
    expect(
      total,
      `Hex count rose to ${total} (ceiling ${HEX_CEILING}). Use a palette import, ` +
      'or lower the ceiling if you converted some.',
    ).toBeLessThanOrEqual(HEX_CEILING)
  })

  it('has a ceiling that is still honest', () => {
    // A ceiling far above the real count has stopped ratcheting. Re-baseline it.
    const { total } = scan()
    expect(HEX_CEILING - total).toBeLessThan(25)
  })
})
