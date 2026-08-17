import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * iOS ZOOMS THE PAGE when a focused form control computes under 16px, and it
 * does not zoom back. You tap a bodyweight field and the whole app is left
 * magnified and scrolled sideways.
 *
 * `globals.css` has carried the fix — `@media (pointer: coarse) { input, select,
 * textarea { font-size: 16px } }` — for a long time, and it did nothing, because
 * it sat inside `@layer base`. Cascade layer order is resolved BEFORE
 * specificity, so a layered element selector loses to any Tailwind text-size
 * utility on the element. The controls that carried one were exactly the
 * controls that zoomed: a guard that applied only where it was not needed.
 *
 * Two assertions, because either one alone can be satisfied while the bug is
 * live:
 *
 *   1. the rule is UNLAYERED, so nothing can outrank it;
 *   2. no form control carries a text-size utility at all — including
 *      `text-fluid-base`, whose clamp floors at 0.92rem ≈ 14.7px and which sat
 *      on the weight and reps inputs, the most-touched controls in the app.
 *
 * Density lives in `.field-compact` (tracking and leading) instead. Type size is
 * no longer available as a design lever on a form control, and that is the point.
 */

const CSS = readFileSync('src/app/globals.css', 'utf8')

/** Anything whose computed size could land under 16px. */
const SIZE_UTILITY = /\btext-(?:xs|sm|base|\[\d{1,2}(?:\.\d+)?px\]|fluid-(?:xs|sm|base))\b/
const CONTROL = /<(input|textarea|select)\b/g

/** Every .tsx under a directory. `fs.globSync` exists at runtime but not in @types/node 20. */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsxFiles(join(dir, e.name))
      : e.name.endsWith('.tsx') ? [join(dir, e.name)] : [],
  )
}

/** The opening tag's full text, brace-aware so `{...}` props do not end it early. */
function openingTag(src: string, from: number): string {
  let i = from, depth = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0) break
    i++
  }
  return src.slice(from, i)
}

describe('nothing zooms the page on focus', () => {
  it('states the 16px floor outside every cascade layer', () => {
    const floor = CSS.indexOf('input, select, textarea { font-size: 16px; }')
    expect(floor).toBeGreaterThan(-1)

    // Walk back from the rule counting braces. Inside `@layer base { … }` the
    // depth at this point is at least 2 (layer + media); unlayered it is 1
    // (the media query alone).
    const before = CSS.slice(0, floor)
    const depth = (before.match(/\{/g)?.length ?? 0) - (before.match(/\}/g)?.length ?? 0)
    expect(depth).toBe(1)
  })

  it('leaves no form control carrying a sub-16px text utility', () => {
    const offenders: string[] = []
    for (const file of tsxFiles('src')) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(CONTROL)) {
        const tag = openingTag(src, m.index + m[0].length)
        const hit = SIZE_UTILITY.exec(tag)
        if (hit) offenders.push(`${file}:${src.slice(0, m.index).split('\n').length} <${m[1]}> ${hit[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
