// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { render } from '@/lib/reports/webview/renderer'

/**
 * The offline report renderer.
 *
 * ── WHAT THIS IS GUARDING ───────────────────────────────────────────────────
 * The native app shows a saved report in a `WKWebView` loading a bundled HTML
 * file, with no network at all. Two things can quietly break that:
 *
 *   1. the renderer stops handling a shape of the FMT v2 dialect (the tables
 *      with no separator row, the `⚑`/`◆` headings, the anchor ladder), and a
 *      report silently loses half of itself;
 *   2. something in the bundle starts pointing at a URL, and the whole screen
 *      goes blank the first time it is opened on a train.
 *
 * The sample is the document that actually shipped, carried from
 * `src/tests/fmt-v2.test.ts`.
 */

/** The real markdown-heading layout, as the parser was written against it. */
const DOC = `# ⬢ HELIX OS · WEEKLY TELEMETRY & PERFORMANCE AUDIT

\`\`\`
╔══════════════════════════════════════════╗
║ W01 · 2026-07-19 → 07-25 · CUT · FMT v2  ║
╚══════════════════════════════════════════╝
\`\`\`

# ▓ PART 1 — WEIGHT & METABOLIC VERIFICATION

## 🟢 QUICK VERDICT
The cut is working.

## 🧮 THE MATH & TDEE CHECK
ANCHOR A · DIARY (blueprint primary)     2,400   ← ADOPTED
ANCHOR B · HISTORICAL CUT @1,925         2,430   (−0.46 kg/wk @ 65.6 kg)
ANCHOR C · BOTTOM-UP THIS WEEK           2,290   (range 2,163–2,420)

## 📉 WEIGHT & BODY COMP TRAJECTORY
Date | Wt | BF% | Fat kg | Musc kg
2026-07-19 | 64.8 | 17.9 | 11.6 | 29.9
2026-07-22 | 64.4 | 17.6 | 11.3 | 29.8
2026-07-25 | 64.1 | 17.4 | 11.2 | 29.7

# ▓ PART 2 — GYM PERFORMANCE & HYPERTROPHY

## ⚑ DB LADDER VALIDATOR
Steps are 11–25% relative.

Protein ████████████░░░░ 78%

## Adherence notes
not a section heading — it does not shout
`

function root(): HTMLElement {
  return document.getElementById('root')!
}

describe('the offline report renderer', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('draws both parts, with the ▓ and the numbering stripped', () => {
    render(DOC)
    const parts = [...root().querySelectorAll('h2.part')].map((n) => n.textContent)
    expect(parts).toEqual([
      'WEIGHT & METABOLIC VERIFICATION',
      'GYM PERFORMANCE & HYPERTROPHY',
    ])
  })

  it('treats a glyph-led SHOUTED heading as a section, including ⚑', () => {
    render(DOC)
    const sections = [...root().querySelectorAll('h3.section')].map((n) => n.textContent)
    expect(sections).toContain('⚑DB LADDER VALIDATOR')
    expect(sections).toContain('🧮THE MATH & TDEE CHECK')
    // Not shouted, so not a section — it stays in the body as ordinary markdown.
    expect(sections.some((s) => s?.includes('Adherence notes'))).toBe(false)
    expect(root().textContent).toContain('Adherence notes')
  })

  it('renders a separator-less table as a real table', () => {
    render(DOC)
    const table = root().querySelector('table')
    expect(table).not.toBeNull()
    const headers = [...table!.querySelectorAll('th')].map((n) => n.textContent)
    expect(headers).toEqual(['Date', 'Wt', 'BF%', 'Fat kg', 'Musc kg'])
    // Three data rows, not one run-on paragraph.
    expect(table!.querySelectorAll('tbody tr').length).toBe(3)
  })

  it('draws the TDEE ladder and marks the adopted anchor', () => {
    render(DOC)
    const ladder = root().querySelector('.ladder')
    expect(ladder).not.toBeNull()
    expect(ladder!.querySelectorAll('.ladder-row').length).toBe(3)
    expect(ladder!.textContent).toContain('adopted')
    // The trailing parenthetical must not become the value: 2,430 is the
    // anchor, 65.6 is the working shown in brackets after it.
    expect(ladder!.textContent).toContain('2,430')
    expect(ladder!.textContent).not.toContain('65.6')
  })

  it('bars use the author\'s own percentage', () => {
    render(DOC)
    // Scoped to `.bars`: the TDEE ladder draws with the same track, and its
    // first fill is a percentage of the anchor SPAN, not of anything the report
    // wrote down.
    const fill = root().querySelector('.bars .bar-fill') as HTMLElement | null
    expect(fill).not.toBeNull()
    // 12 filled of 16 glyphs is 75%, and the line says 78%. The line wins.
    expect(fill!.style.width).toBe('78%')
  })

  it('draws a closed banner box as a card, not as ASCII', () => {
    render(DOC)
    const hero = root().querySelector('.hero')
    expect(hero).not.toBeNull()
    expect(hero!.textContent).toContain('W01')
    // The segments after the first become chips rather than one long line.
    expect([...hero!.querySelectorAll('.chip')].map((n) => n.textContent))
      .toContain('FMT v2')
  })

  it('keeps a GRID — an ASCII table — verbatim in a pre', () => {
    // A box with column joints is a table, and squashing one into a card would
    // delete its columns. It stays monospace, unwrapped, ligatures off.
    render([
      'FMT v2',
      '',
      '# ▓ PART 1 — X',
      '',
      '## 🟢 A LEDGER',
      '```',
      '┌────────┬───────┐',
      '│ Set    │ Load  │',
      '├────────┼───────┤',
      '│ 1      │ 60 kg │',
      '└────────┴───────┘',
      '```',
    ].join('\n'))
    const pre = root().querySelector('pre.report-pre')
    expect(pre?.textContent).toContain('┬')
    expect(pre?.textContent).toContain('60 kg')
  })

  it('never executes HTML found in a report body', () => {
    // A report is arbitrary text pasted from a model. The web renderer refuses
    // to run HTML in it, and so does this.
    render('FMT v2\n\n# ▓ PART 1 — X\n\n## 🟢 A NOTE\n<img src=x onerror="alert(1)">\n')
    expect(root().querySelector('img')).toBeNull()
    expect(root().textContent).toContain('<img src=x')
  })

  it('prints an unrecognised document rather than dropping it', () => {
    render('just some notes I pasted, no parts at all')
    expect(root().textContent).toContain('just some notes I pasted')
  })

  it('renders an empty body without throwing', () => {
    expect(() => render('')).not.toThrow()
  })
})

describe('the built bundle', () => {
  const BUNDLE = 'native/Onyx/Resources/ReportRenderer.html'

  it('exists — run `npm run report:bundle` after changing the renderer', () => {
    expect(existsSync(BUNDLE)).toBe(true)
  })

  it('reaches for nothing outside itself', () => {
    const html = readFileSync(BUNDLE, 'utf8')
    // The whole point: a report opens on a phone with no signal. Any absolute
    // URL in here is a request that will fail, silently, on that phone.
    const external = html.match(/(?:src|href)\s*=\s*["'](https?:|\/\/)[^"']*/gi) ?? []
    expect(external).toEqual([])
    expect(html).toContain('window.onyxRender')
  })
})
