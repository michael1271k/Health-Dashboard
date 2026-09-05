import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { PLATINUM } from '@/lib/theme/palette'

/**
 * The native asset catalogs are the one place the design system cannot reach.
 * Nothing in `src/` imports them, no bundler resolves them, and no typecheck
 * sees them — so they drift silently and the only symptom is on a device.
 *
 * They had drifted all the way to empty: the colorsets were bare
 * `{ "idiom": "universal" }` placeholders with no components at all, which
 * means the watch app was tinting with the system default rather than any
 * Helix colour. (The Capacitor widget extension this also guarded was removed
 * in Wave 5 — see native/OnyxWidgets.)
 */

const IOS = 'ios/App'
const WATCH = `${IOS}/HelixWatch Watch App/Assets.xcassets`

/** `#C9CDD6` → the `0xC9 / 0xCD / 0xD6` triple Xcode writes into a colorset. */
function components(hex: string) {
  return {
    red: `0x${hex.slice(1, 3).toUpperCase()}`,
    green: `0x${hex.slice(3, 5).toUpperCase()}`,
    blue: `0x${hex.slice(5, 7).toUpperCase()}`,
  }
}

function colorset(path: string) {
  const json = JSON.parse(readFileSync(path, 'utf8'))
  const c = json.colors?.[0]?.color?.components
  return c ? { red: c.red, green: c.green, blue: c.blue, alpha: c.alpha } : null
}

describe('native colorsets carry a real colour, and it is the palette one', () => {
  it.each([
    ['watch accent', `${WATCH}/AccentColor.colorset/Contents.json`, PLATINUM],
  ])('%s', (_name, path, hex) => {
    const set = colorset(path)
    // An empty colorset is not "no opinion" — it is the system default blue.
    expect(set, 'colorset has no components — the system tint wins').not.toBeNull()
    expect(set).toMatchObject({ ...components(hex), alpha: '1.000' })
  })
})

describe('every appiconset entry names a file that exists', () => {
  it.each([
    ['app', `${IOS}/App/Assets.xcassets/AppIcon.appiconset`],
    ['watch', `${WATCH}/AppIcon.appiconset`],
  ])('%s', (_name, dir) => {
    const json = JSON.parse(readFileSync(join(dir, 'Contents.json'), 'utf8'))
    expect(json.images.length).toBeGreaterThan(0)
    for (const img of json.images) {
      // A declared entry with no filename reads as an EMPTY set: Xcode does
      // not fail the build, it ships a grey placeholder.
      expect(img.filename, `${dir} declares a ${img.size} entry with no file`).toBeTruthy()
      expect(existsSync(join(dir, img.filename)), `${dir}/${img.filename} missing`).toBe(true)
    }
  })
})
