import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * BACK IS A DIRECTION, NOT AN ACTION.
 *
 * `btn-glass` is a filled, bordered, inset-shadowed surface — the treatment this
 * app gives a thing you DO. It was also, in eight places, the treatment given to
 * going back and to stepping between days and exercises. On a pinned header that
 * puts three glass boxes in a row and makes the way out compete with the real
 * actions beside it, when iOS has drawn the same control as a bare chevron since
 * the first Settings app.
 *
 * The app already agreed with itself in two places — the Pathfinder calendar and
 * the DatePicker step their months with bare chevrons — so this was never a new
 * opinion, only an unevenly applied one.
 *
 * The rule guarded here: a navigation control goes through `BackLink` /
 * `NavChevron`. Reaching for `btn-glass` and an `aria-label` that says "Back"
 * would look right in a screenshot and be wrong in the system, which is exactly
 * the kind of drift a source assertion catches and a render test does not.
 */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name))
      : /\.tsx$/.test(e.name) ? [join(dir, e.name)] : [],
  )
}

/** The shared components are allowed to define the treatment they replace. */
const EXEMPT = ['src/components/nav/NavChevron.tsx']

/** An element carrying btn-glass whose label or icon says it navigates. */
const GLASS_TAG = /<(?:button|a|Link)\b[^>]*btn-glass[^>]*>/g
const NAVIGATIONAL = /aria-label="(?:Back|Previous|Next)\b|ChevronLeft|ChevronRight|ArrowLeft/

describe('navigation is drawn as chevrons', () => {
  it('leaves no back or step control styled as a glass button', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('src')) {
      if (EXEMPT.includes(file)) continue
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(GLASS_TAG)) {
        // The icon usually sits between the tags, so look at a little after it.
        const window_ = src.slice(m.index, m.index + m[0].length + 120)
        if (NAVIGATIONAL.test(window_)) {
          offenders.push(`${file}:${src.slice(0, m.index).split('\n').length}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the shared controls tappable without a background', () => {
    // Removing the fill must not remove the target: the 44pt minimum comes from
    // padding. If this ever drops, the chevrons become a precision-tap game.
    const src = readFileSync('src/components/nav/NavChevron.tsx', 'utf8')
    expect(src).toMatch(/min-h-\[44px\]/)
    // Comments stripped first — the file names `btn-glass` to explain why it is
    // not used, and that sentence is the reason the file exists.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/btn-glass/)
  })
})
