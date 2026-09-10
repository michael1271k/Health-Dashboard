#!/usr/bin/env node
/**
 * The version SSoT, pushed into the two Xcode projects.
 *
 * ── WHY A SCRIPT AND NOT A BUILD SETTING ─────────────────────────────────────
 * There are three places a version has to be true at once: `package.json` (the
 * web app and every npm script), `native/project.yml` (XcodeGen writes the
 * native app, its widget extension and the watch app from it) and
 * `ios/App/App.xcodeproj/project.pbxproj` (the Capacitor shell, which is
 * hand-edited and cannot be generated). Before this they were four different
 * numbers — `0.1.0`, `1.0`, `1.0` and a watch app that had drifted to `1.1`.
 *
 * `package.json.version` is now the ONLY place a human edits. Everything else
 * is written from it, and `--check` fails the gate when they disagree.
 *
 * XcodeGen cannot read `package.json`, and pointing the spec at an environment
 * variable would break the bare `xcodegen generate` that `native/README.md` and
 * the ship gate both tell you to run. So the values are written into the spec
 * and committed: the spec stays self-contained, and staleness is a check away.
 *
 * ── THE BUILD NUMBER ─────────────────────────────────────────────────────────
 * CURRENT_PROJECT_VERSION is DERIVED, not stored: 1.3.0 → 10300. It is
 * monotonic for as long as the marketing version is, which is what App Store
 * Connect actually requires, and it costs no second field that can rot out of
 * step with the first.
 *
 * ponytail: a rejected binary normally needs only a build bump, and this cannot
 * give you one — bump the patch version instead. Add a `buildNumber` override
 * in package.json the first time that is genuinely not acceptable.
 *
 *   node scripts/sync-version.mjs           # write
 *   node scripts/sync-version.mjs --check   # verify, exit 1 when stale
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version ?? '')
if (!m) {
  console.error(`package.json version must be x.y.z, got ${JSON.stringify(pkg.version)}`)
  process.exit(1)
}
const [, major, minor, patch] = m.map(Number)
const marketing = pkg.version
const build = String(major * 10000 + minor * 100 + patch)

/** Every rewrite this script owns: one regex per setting, per file. */
const edits = [
  {
    file: 'native/project.yml',
    subs: [
      [/^(\s*MARKETING_VERSION: )".*"$/gm, `$1"${marketing}"`],
      [/^(\s*CURRENT_PROJECT_VERSION: )".*"$/gm, `$1"${build}"`],
    ],
  },
  {
    // The Capacitor shell's Info.plist already reads $(MARKETING_VERSION), so
    // the build settings are the only thing to touch here.
    file: 'ios/App/App.xcodeproj/project.pbxproj',
    subs: [
      [/^(\s*MARKETING_VERSION = ).*;$/gm, `$1${marketing};`],
      [/^(\s*CURRENT_PROJECT_VERSION = ).*;$/gm, `$1${build};`],
    ],
  },
]

const stale = []
for (const { file, subs } of edits) {
  const path = join(ROOT, file)
  const before = readFileSync(path, 'utf8')
  let after = before
  let hits = 0
  for (const [re, to] of subs) {
    hits += after.match(re)?.length ?? 0
    after = after.replace(re, to)
  }
  // A spec that stopped declaring the setting at all is a silent no-op, and the
  // symptom is an App Store upload rejected for a version that never moved.
  if (hits === 0) {
    console.error(`${file}: no version settings matched — did the spec change shape?`)
    process.exit(1)
  }
  if (after === before) continue
  stale.push(file)
  if (!check) writeFileSync(path, after)
}

if (check && stale.length) {
  console.error(`stale version in: ${stale.join(', ')} — run \`npm run version:sync\``)
  process.exit(1)
}
console.log(`${marketing} (${build})${stale.length ? ` → ${stale.join(', ')}` : ' · already in sync'}`)
