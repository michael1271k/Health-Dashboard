import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { safePath } from '@/lib/native/deepLink'

/**
 * Every destination the widget can send you to must be one the app will accept.
 *
 * `safePath` is an ALLOW-LIST, not a sanitiser — a custom URL scheme is callable
 * by anything on the device, so unknown paths are dropped silently. Silently is
 * the problem: a widget face wired to a route nobody added to `ALLOWED` does
 * nothing at all when tapped, on a surface where there is no error to see and no
 * console to read. This fails at build time instead.
 */

const PALETTE = readFileSync('ios/App/HelixWidgets/HelixPalette.swift', 'utf8')

/** The URL `HelixLink.path()` actually builds: `helix://open?path=…`. */
const widgetUrl = (path: string) => `helix://open?path=${encodeURIComponent(path)}`

/** The `static let progress = path("/pathfinder")` declarations in HelixLink. */
function swiftLinks(): Array<{ name: string; path: string }> {
  return [...PALETTE.matchAll(/static let (\w+)\s*=\s*path\("([^"]+)"\)/g)]
    .map((m) => ({ name: m[1], path: m[2] }))
}

describe('widget deep links', () => {
  const links = swiftLinks()

  it('declares links at all — a silent regex miss would pass everything', () => {
    expect(links.length).toBeGreaterThanOrEqual(8)
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
