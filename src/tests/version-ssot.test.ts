import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * ONE version, five surfaces.
 *
 * The web app, the native app, the widget extension, the watch app and the
 * Capacitor shell all state a version, and before this they stated four
 * different ones — `0.1.0`, `1.0`, `1.0`, and a watch app that had drifted to
 * `1.1` while the phone it must pair with still said `1.0`. Nothing failed;
 * the numbers were simply wrong, which is the expensive kind of wrong when a
 * bug report quotes one of them.
 *
 * `package.json.version` is the source. `scripts/sync-version.mjs` writes the
 * rest. This is what fails when someone edits a number by hand and forgets.
 */

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
const YML = readFileSync('native/project.yml', 'utf8')
const PBX = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8')

/** `1.3.0` → `10300`. Mirrors the derivation in `scripts/sync-version.mjs`. */
function buildNumber(version: string): string {
  const [major, minor, patch] = version.split('.').map(Number)
  return String(major * 10000 + minor * 100 + patch)
}

describe('the version single source of truth', () => {
  it('is a plain x.y.z in package.json', () => {
    // The Xcode side has no opinion on prereleases and App Store Connect
    // rejects them, so the SSoT does not get to hold one.
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('is what native/project.yml declares, once, at project level', () => {
    // Once — not once per target. Three targets each carrying their own copy
    // is how the watch app drifted a minor version away from its companion.
    const marketing = YML.match(/^\s*MARKETING_VERSION: "(.*)"$/gm) ?? []
    const build = YML.match(/^\s*CURRENT_PROJECT_VERSION: "(.*)"$/gm) ?? []
    expect(marketing).toHaveLength(1)
    expect(build).toHaveLength(1)
    expect(marketing[0]).toContain(`"${pkg.version}"`)
    expect(build[0]).toContain(`"${buildNumber(pkg.version)}"`)
  })

  it('is what every generated Info.plist reads, by reference', () => {
    // A plist with a literal in it is a plist that stops tracking the setting
    // the moment the setting moves.
    for (const plist of [
      'native/Onyx/Support/Info.plist',
      'native/OnyxWidgets/Support/Info.plist',
      'native/OnyxWatch/Support/Info.plist',
      'ios/App/App/Info.plist',
    ]) {
      const s = readFileSync(plist, 'utf8')
      expect(s, plist).toContain('<string>$(MARKETING_VERSION)</string>')
      expect(s, plist).toContain('<string>$(CURRENT_PROJECT_VERSION)</string>')
    }
  })

  it('is what the Capacitor shell builds with', () => {
    // Hand-edited, never generated — so every configuration has to be checked,
    // not just the first one the regex finds.
    const marketing = [...PBX.matchAll(/^\s*MARKETING_VERSION = (.*);$/gm)].map((m) => m[1])
    const build = [...PBX.matchAll(/^\s*CURRENT_PROJECT_VERSION = (.*);$/gm)].map((m) => m[1])
    expect(marketing.length).toBeGreaterThan(0)
    expect(new Set(marketing)).toEqual(new Set([pkg.version]))
    expect(new Set(build)).toEqual(new Set([buildNumber(pkg.version)]))
  })

  it('has a changelog entry for the version being shipped', () => {
    // The CLAUDE.md directive says a wave without release notes is not
    // finished. This is that directive with teeth.
    const log = readFileSync('docs/CHANGELOG.md', 'utf8')
    expect(log).toContain(`## [${pkg.version}]`)
  })
})
