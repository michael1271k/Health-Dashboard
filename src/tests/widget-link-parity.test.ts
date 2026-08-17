import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { safePath } from '@/lib/native/deepLink'
import { DAY_SECTIONS } from '@/lib/day/sections'

/**
 * Every destination the widget can send you to must be one the app will accept.
 *
 * `safePath` is an ALLOW-LIST, not a sanitiser — a custom URL scheme is callable
 * by anything on the device, so unknown paths are dropped silently. Silently is
 * the problem: a widget face wired to a route nobody added to `ALLOWED` does
 * nothing at all when tapped, on a surface where there is no error to see and no
 * console to read. This fails at build time instead.
 *
 * ── AND NOW THE SAME RULE FOR THE DRAWER ─────────────────────────────────────
 * The links carry a `?section=` naming a drawer on the day page. That is a
 * second string that can be wrong in exactly the same invisible way: the route
 * resolves, the day opens, and the thing you actually tapped stays closed. The
 * day page validates against `DAY_SECTIONS`, and every section the Swift side
 * emits is asserted to be a member of it here.
 */

const PALETTE = readFileSync('ios/App/HelixWidgets/HelixPalette.swift', 'utf8')
const INTENTS = readFileSync('ios/App/HelixWidgets/HelixIntents.swift', 'utf8')
const TRAINING = readFileSync('ios/App/HelixWidgets/HelixTraining.swift', 'utf8')

/** The URL `HelixLink.path()` actually builds: `helix://open?path=…`. */
const widgetUrl = (path: string) => `helix://open?path=${encodeURIComponent(path)}`

/** The `static let progress = path("/pathfinder")` declarations in HelixLink. */
function swiftLinks(): Array<{ name: string; path: string }> {
  return [...PALETTE.matchAll(/static let (\w+)\s*=\s*path\("([^"]+)"\)/g)]
    .map((m) => ({ name: m[1], path: m[2] }))
}

/**
 * Every `section: "…"` argument passed to `HelixLink.day` anywhere in the
 * extension. These are the drawers the widget claims it can open.
 */
function swiftSections(): string[] {
  const sources = [INTENTS, TRAINING, PALETTE]
  const found = new Set<string>()
  for (const src of sources) {
    for (const m of src.matchAll(/HelixLink\.day\([^)]*section:\s*"([^"]+)"/g)) found.add(m[1])
  }
  return [...found]
}

describe('widget deep links', () => {
  const links = swiftLinks()

  it('declares links at all — a silent regex miss would pass everything', () => {
    expect(links.length).toBeGreaterThanOrEqual(7)
  })

  it('every declared destination survives the allow-list', () => {
    for (const { name, path } of links) {
      expect(safePath(widgetUrl(path)), `HelixLink.${name} → ${path}`).toBe(path)
    }
  })

  it('still rejects what it is there to reject', () => {
    // Same envelope, hostile contents — a scheme anything on the device can call.
    expect(safePath(widgetUrl('/etc/passwd'))).toBeNull()
    expect(safePath(widgetUrl('//evil.example'))).toBeNull()
    expect(safePath('https://example.com/nutrition')).toBeNull()
  })
})

describe('dated day links', () => {
  // `HelixLink.day` builds these; the shape is asserted here rather than the
  // Swift, because what matters is that the RESULT gets through `safePath`.
  const dated = (iso: string, section?: string) =>
    section ? `/day/${iso}?section=${section}` : `/day/${iso}`

  it('a bare day link survives the allow-list', () => {
    expect(safePath(widgetUrl(dated('2026-08-17')))).toBe('/day/2026-08-17')
  })

  it('a day link KEEPS its section — the query string is the whole point', () => {
    // `safePath` splits on `?` only to validate the root, and returns the
    // original path. If that ever changes to return the cleaned path, every
    // precision link silently degrades to "opens the day", which is the exact
    // behaviour this wave replaced.
    const path = dated('2026-08-17', 'sleep')
    expect(safePath(widgetUrl(path))).toBe(path)
  })

  it('every section the widget can emit is a drawer the day page knows', () => {
    const emitted = swiftSections()
    expect(emitted.length).toBeGreaterThan(0)
    for (const section of emitted) {
      expect(DAY_SECTIONS as readonly string[], `HelixLink.day(section: "${section}")`)
        .toContain(section)
    }
  })

  it('every drawer the day page knows still survives the allow-list', () => {
    for (const section of DAY_SECTIONS) {
      const path = dated('2026-08-17', section)
      expect(safePath(widgetUrl(path)), section).toBe(path)
    }
  })

  it('does not smuggle a foreign route in through the section', () => {
    // The section is appended after a `?`, so it cannot change the route — but
    // asserting it means a future builder that interpolates into the PATH gets
    // caught rather than shipped.
    expect(safePath(widgetUrl('/day/2026-08-17?section=../../settings'))).toBe(
      '/day/2026-08-17?section=../../settings')
    // ...and the day page drops it, because it is not in DAY_SECTIONS.
    expect(DAY_SECTIONS as readonly string[]).not.toContain('../../settings')
  })
})
