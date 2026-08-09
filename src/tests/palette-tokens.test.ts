import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A design token that nothing consumes is not a design decision, it is a note
 * to self — and it rots. Before this test the `@theme` block carried 33
 * `--color-*` tokens of which **21 had zero consumers**, including all four
 * macro colours and all five split colours. Every one of them duplicated a
 * value in palette.ts, so the two "sources of truth" had quietly diverged into
 * one real one and one decorative one.
 *
 * The rule this pins: a token exists only if something reads it. Runtime values
 * live in palette.ts; CSS-only surfaces get a token.
 */

const CSS = readFileSync('src/app/globals.css', 'utf8')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) sourceFiles(path, out)
    else if (/\.(tsx?|css)$/.test(entry)) out.push(path)
  }
  return out
}

/** Every `--color-*` declared in the @theme block (not the travel overrides). */
function declaredTokens(): string[] {
  const theme = CSS.slice(CSS.indexOf('@theme {'), CSS.indexOf('\n}\n'))
  return [...theme.matchAll(/^\s*--color-([a-z0-9-]+):/gm)].map((m) => m[1])
}

describe('@theme colour tokens', () => {
  const tokens = declaredTokens()
  const corpus = sourceFiles('src')
    .filter((f) => !f.includes('/tests/'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n')

  it('declares a plausible number of tokens', () => {
    // Sanity: if the parse breaks, every other assertion here passes vacuously.
    expect(tokens.length).toBeGreaterThan(5)
    expect(tokens).toContain('primary')
  })

  it.each(declaredTokens())('--color-%s has at least one consumer', (token) => {
    // Either read directly as a custom property, or via a Tailwind utility that
    // Tailwind v4 generates from the token name (bg-primary, text-muted,
    // border-border, ring-primary/60, from-surface-2, …).
    const asVar = new RegExp(`--color-${token}\\b`)
    const asUtility = new RegExp(
      `\\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|shadow|divide|accent|caret|decoration)-${token}\\b`,
    )
    expect(
      asVar.test(corpus) || asUtility.test(corpus),
      `--color-${token} is declared in globals.css but nothing reads it. ` +
      'Delete it, or use it. Runtime values belong in src/lib/theme/palette.ts.',
    ).toBe(true)
  })
})

describe('the two colour sources agree', () => {
  const palette = readFileSync('src/lib/theme/palette.ts', 'utf8')
  const hexOf = (name: string) =>
    palette.match(new RegExp(`export const ${name} = '(#[0-9A-Fa-f]{6})'`))?.[1]?.toUpperCase()

  // Only the tokens that survived the cull, each against the palette export it
  // mirrors. A drift here means CSS and JS are painting different colours with
  // the same name — which is exactly how #E0653C and #E0703C both ended up in
  // the app calling themselves ember.
  it.each([
    ['bg', 'OBSIDIAN'], ['surface', 'GRAPHITE'], ['surface-2', 'SLATE_SURFACE'],
    ['primary', 'EMBER'], ['info', 'STEEL'], ['success', 'EMERALD'],
    ['warn', 'GOLD'], ['danger', 'OXIDE'], ['text', 'TEXT'],
    ['muted', 'MUTED'], ['border', 'HAIRLINE'],
  ])('--color-%s matches %s', (token, exportName) => {
    const css = CSS.match(new RegExp(`--color-${token}:\\s*(#[0-9A-Fa-f]{6})`))?.[1]?.toUpperCase()
    expect(css, `--color-${token} not found in globals.css`).toBeTruthy()
    expect(css).toBe(hexOf(exportName))
  })
})

/**
 * Comments are not values. Several of these hexes are deliberately NAMED in
 * comments that explain why they were removed, and that history is worth
 * keeping — so the ban applies to code, not to prose.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // /* … */ and CSS comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1')  // // … but not the // in https://
}

describe('the deleted neon never comes back as a value', () => {
  const corpus = (
    sourceFiles('src')
      .filter((f) => !f.includes('/tests/'))
      .map((f) => stripComments(readFileSync(f, 'utf8')))
      .join('\n') + readFileSync('public/manifest.json', 'utf8')
  ).toUpperCase()

  it.each([
    ['#16F5C3', 'neon teal — was PHASE_RGB.peak'],
    ['#5BFF9D', 'neon green — was the icon gradient'],
    ['#20E08F', 'neon mint — was travel mode'],
    ['#19E3B1', 'was the manifest theme_color'],
    ['#E0653C', 'the phantom second ember — was PHASE_RGB.cut'],
  ])('%s (%s) appears in no code path', (hex) => {
    expect(corpus).not.toContain(hex)
  })

  it('still finds a hex that IS present, so the scan is not vacuous', () => {
    expect(corpus).toContain('#E0703C')
  })
})
