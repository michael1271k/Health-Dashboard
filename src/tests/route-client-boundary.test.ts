import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

/**
 * A route handler must not reach a `'use client'` module.
 *
 * `/api/widget/snapshot` returned **500 on every request it ever served** —
 * `widget_tokens.last_used_at` was NULL not because the widget never called, but
 * because the call never succeeded. One import was the whole cause:
 *
 *   import { validWeight } from '@/lib/utils/units'   // 'use client'
 *
 * Next replaces a client module imported from server code with a client-reference
 * proxy, and calling through it throws at RUNTIME:
 *
 *   Attempted to call validWeight() from the server but validWeight is on the
 *   client.
 *
 * Nothing catches that. It is not a type error, not a lint error, and not a build
 * error — `next build` compiles it happily and the route 500s in production. The
 * only signal was a status code on a surface with no UI to show it.
 *
 * `utils/units.ts` is an easy trap because most of it is pure arithmetic; the
 * directive is there for one hook at the bottom. This test walks every route's
 * import graph so the next such import fails here instead of in a widget.
 */

const SRC = resolve('src')
const EXTS = ['.ts', '.tsx', '.js', '.jsx']

function walk(dir: string, match: RegExp, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, match, out)
    else if (match.test(path)) out.push(path)
  }
  return out
}

/** `@/lib/x` and `./x` → an actual file on disk, or null for a package import. */
function resolveImport(spec: string, fromFile: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
  else return null // node_modules — not ours to police

  for (const ext of ['', ...EXTS]) {
    const candidate = base + ext
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  for (const ext of EXTS) {
    const candidate = join(base, `index${ext}`)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Import specifiers whose bindings SURVIVE to runtime.
 *
 * `import type { WidgetSnapshot } from '@/lib/widget/snapshot'` is erased by the
 * compiler and can point anywhere — flagging it would be a false positive, and a
 * guard that cries wolf gets deleted. Same for a whole-line `export type`.
 */
function runtimeImports(code: string): string[] {
  const out: string[] = []
  for (const m of code.matchAll(/^\s*(?:import|export)\s+([\s\S]*?)from\s+['"]([^'"]+)['"]/gm)) {
    const [, clause, spec] = m
    if (/^\s*type\s/.test(clause)) continue
    out.push(spec)
  }
  // Bare side-effect imports: `import '@/lib/x'`
  for (const m of code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) out.push(m[1])
  return out
}

function isClientModule(code: string): boolean {
  // The directive must be the first statement, so only the leading block matters.
  return /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/.*\n\s*)*['"]use client['"]/.test(code)
}

/** Every `'use client'` module a route pulls in, with the path that got there. */
function clientReach(routeFile: string): string[] {
  const seen = new Set<string>()
  const bad: string[] = []

  const visit = (file: string, trail: string[]) => {
    if (seen.has(file)) return
    seen.add(file)
    const code = readFileSync(file, 'utf8')
    if (isClientModule(file === routeFile ? '' : code)) {
      bad.push([...trail, file].map((p) => p.replace(`${process.cwd()}/`, '')).join(' → '))
      return // its own imports are a client graph; stop here
    }
    for (const spec of runtimeImports(code)) {
      const target = resolveImport(spec, file)
      if (target) visit(target, [...trail, file])
    }
  }

  visit(routeFile, [])
  return bad
}

const ROUTES = walk(join(SRC, 'app', 'api'), /route\.tsx?$/)

describe('no route handler reaches a client module', () => {
  it('finds the routes at all (guards the scanner itself)', () => {
    expect(ROUTES.length).toBeGreaterThan(3)
  })

  it('resolves @/ and relative specifiers (guards the resolver)', () => {
    const probe = join(SRC, 'app', 'api', 'compute-score', 'route.ts')
    expect(resolveImport('@/lib/utils/measure', probe)).toContain('utils/measure.ts')
    expect(resolveImport('next/server', probe)).toBeNull()
  })

  it('recognises the directive it exists to catch (guards the detector)', () => {
    expect(isClientModule(readFileSync(join(SRC, 'lib/utils/units.ts'), 'utf8'))).toBe(true)
    expect(isClientModule(readFileSync(join(SRC, 'lib/utils/measure.ts'), 'utf8'))).toBe(false)
    // A file whose comment merely mentions the directive is not one.
    expect(isClientModule("/**\n * about 'use client'\n */\nexport const a = 1")).toBe(false)
  })

  it.each(ROUTES.map((r) => [r.replace(`${process.cwd()}/`, ''), r] as const))('%s', (_label, route) => {
    expect(clientReach(route)).toEqual([])
  })
})
