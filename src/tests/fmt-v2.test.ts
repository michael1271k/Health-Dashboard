import { describe, it, expect } from 'vitest'
import {
  isFmtV2, parseFmtV2, parseTable, parseTdeeAnchors, parseAsymmetry, bodyCompSeries,
} from '@/lib/reports/fmtV2'

/**
 * The header and section layout are quoted from a real pasted report. The full
 * document was not available, so the parser is deliberately tolerant and these
 * tests pin the two properties that matter more than any single field: nothing
 * is ever REQUIRED, and unrecognised text survives intact.
 */
const REPORT = [
  '⬢ HELIX OS · WEEKLY TELEMETRY & PERFORMANCE AUDIT',
  '╔═══════════════════════════════════════════════════════════════════╗',
  '║ W01 · 2026-07-19 → 07-25 · CUT / RE-ENTRY · SENTINEL-7 · FMT v2   ║',
  '╚═══════════════════════════════════════════════════════════════════╝',
  '',
  '▓ PART 1 — WEIGHT & METABOLIC VERIFICATION',
  '',
  '🧮 THE MATH & TDEE CHECK',
  'ANCHOR A · DIARY (blueprint primary)     2,400   ← ADOPTED',
  'ANCHOR B · SCALE BMR ×1.45               2,247',
  'ANCHOR C · HEALTHKIT ACTIVE + REST       2,512',
  'Adopted anchor drives the deficit maths below.',
  '',
  '📉 WEIGHT & BODY COMP TRAJECTORY',
  'Date | Wt | BF% | Fat kg | Musc% | Musc kg | FFM kg | H₂O% | Visc | BMR',
  '2026-07-19 | 64.8 | 17.9 | 11.6 | 46.1 | 29.9 | 53.2 | 55.1 | 5 | 1550',
  '2026-07-22 | 64.4 | 17.6 | 11.3 | 46.3 | 29.8 | 53.1 | 55.4 | 5 | 1548',
  '2026-07-25 | 64.1 | 17.4 | 11.2 | 46.4 | 29.7 | 52.9 | 55.6 | 5 | 1545',
  '',
  '▓ PART 2 — GYM PERFORMANCE & HYPERTROPHY',
  '',
  '📈 WEEKLY TOTALS — BASELINE ESTABLISHED',
  'Metric | W01 | Δ vs prior',
  'Volume kg | 28,410 | —',
  'Sets | 96 | —',
  '',
  '⚖️ ASYMMETRY WATCH',
  'Exercise | L | R | Note',
  'Single Arm Lateral Raise | 5 | 5 | balanced',
  'Single Arm Cable Crossover | 8.75 | 10 | right dominant',
].join('\n')

describe('isFmtV2', () => {
  it('recognises the version token wherever it sits', () => {
    expect(isFmtV2(REPORT)).toBe(true)
    expect(isFmtV2('… · SENTINEL-7 · FMT V2 …')).toBe(true)
    expect(isFmtV2('# Just a normal week\n\nfelt good')).toBe(false)
    expect(isFmtV2(null)).toBe(false)
  })
})

describe('parseFmtV2 header', () => {
  const r = parseFmtV2(REPORT)!

  it('pulls the week, range and phase out of the box banner', () => {
    expect(r.header.weekLabel).toBe('W01')
    expect(r.header.rangeLabel).toBe('2026-07-19 → 07-25')
    expect(r.header.phase).toBe('CUT / RE-ENTRY')
    expect(r.header.version).toBe('v2')
    expect(r.header.title).toContain('HELIX OS')
  })
})

describe('parseFmtV2 structure', () => {
  const r = parseFmtV2(REPORT)!

  it('splits on ▓ parts and emoji-led shouted sections', () => {
    expect(r.parts.map((p) => p.title)).toEqual([
      'WEIGHT & METABOLIC VERIFICATION',
      'GYM PERFORMANCE & HYPERTROPHY',
    ])
    expect(r.parts[0].sections.map((s) => s.title)).toEqual([
      'THE MATH & TDEE CHECK',
      'WEIGHT & BODY COMP TRAJECTORY',
    ])
  })

  it('does not mistake an ordinary sentence for a heading', () => {
    // "Adopted anchor drives the deficit maths below." has no emoji and is not
    // shouted; it must stay inside the TDEE section's body.
    expect(r.parts[0].sections[0].lines.join('\n')).toContain('Adopted anchor drives')
  })
})

describe('the TDEE ladder', () => {
  const r = parseFmtV2(REPORT)!

  it('reads every anchor and marks the adopted one', () => {
    expect(r.tdee).toEqual([
      { key: 'A', label: 'DIARY (blueprint primary)', value: 2400, adopted: true },
      { key: 'B', label: 'SCALE BMR ×1.45', value: 2247, adopted: false },
      { key: 'C', label: 'HEALTHKIT ACTIVE + REST', value: 2512, adopted: false },
    ])
  })

  it('takes the LAST number on the line, so a label may contain digits', () => {
    const [a] = parseTdeeAnchors(['ANCHOR D · TDEE ×1.15 CORRECTED    2,133'])
    expect(a.label).toBe('TDEE ×1.15 CORRECTED')
    expect(a.value).toBe(2133)
  })

  it('ignores a line with no number at all', () => {
    expect(parseTdeeAnchors(['ANCHOR E · NOT MEASURED THIS WEEK'])).toEqual([])
  })
})

describe('the body-composition table', () => {
  const r = parseFmtV2(REPORT)!

  it('parses a pipe table that carries NO markdown separator row', () => {
    // This is exactly why remark-gfm renders it as one long paragraph.
    expect(r.bodyComp?.columns[0]).toBe('Date')
    expect(r.bodyComp?.rows).toHaveLength(3)
    expect(r.bodyComp?.rows[0][1]).toBe('64.8')
  })

  it('keeps only the columns that are actually numeric', () => {
    const series = bodyCompSeries(r.bodyComp!)
    expect(series.map((s) => s.label)).toContain('Wt')
    expect(series.map((s) => s.label)).toContain('BF%')
    expect(series.find((s) => s.label === 'Wt')?.points.map((p) => p.value)).toEqual([64.8, 64.4, 64.1])
  })

  it('drops a column that is mostly non-numeric', () => {
    const t = parseTable([
      'Date | Wt | Note',
      '2026-07-19 | 64.8 | felt heavy',
      '2026-07-22 | 64.4 | fine',
    ])!
    expect(bodyCompSeries(t).map((s) => s.label)).toEqual(['Wt'])
  })

  it('still drops a genuine markdown separator when one IS present', () => {
    const t = parseTable(['A | B | C', '--- | :---: | ---:', '1 | 2 | 3'])!
    expect(t.rows).toEqual([['1', '2', '3']])
  })
})

describe('the asymmetry block', () => {
  const r = parseFmtV2(REPORT)!

  it('reads L/R columns and computes the gap', () => {
    expect(r.asymmetry).toEqual([
      { exercise: 'Single Arm Lateral Raise', left: 5, right: 5, gapPct: 0 },
      { exercise: 'Single Arm Cable Crossover', left: 8.75, right: 10, gapPct: 14.3 },
    ])
  })

  it('falls back to inline L … R when there is no table', () => {
    expect(parseAsymmetry(['Single Arm Row · L 20 × 12 · R 22.5 × 12'])).toEqual([
      { exercise: 'Single Arm Row', left: 20, right: 22.5, gapPct: 12.5 },
    ])
  })
})

describe('tolerance — the format is not a contract', () => {
  it('never returns null for text that has content', () => {
    const r = parseFmtV2('just some notes about the week')!
    expect(r).not.toBeNull()
    expect(r.parts).toEqual([])
    expect(r.preamble).toEqual(['just some notes about the week'])
  })

  it('returns null only for nothing at all', () => {
    expect(parseFmtV2('')).toBeNull()
    expect(parseFmtV2('   \n  ')).toBeNull()
    expect(parseFmtV2(null)).toBeNull()
  })

  it('keeps a part whose sections it cannot classify', () => {
    const r = parseFmtV2('▓ PART 9 — SOMETHING NEW\nline one\nline two')!
    expect(r.parts).toHaveLength(1)
    expect(r.parts[0].sections[0].lines).toEqual(['line one', 'line two'])
    expect(r.tdee).toEqual([])
    expect(r.bodyComp).toBeNull()
  })
})

/**
 * The document that shipped. Every part and section in a real Sentinel-7 paste
 * is a MARKDOWN HEADING, not a bare line — which the first version of this
 * parser did not accept, so the live report parsed as one 246-line preamble and
 * every chart it exists to draw stayed dark.
 */
describe('parseFmtV2 — markdown headings (the real layout)', () => {
  const DOC = [
    '# ⬢ HELIX OS · WEEKLY TELEMETRY & PERFORMANCE AUDIT',
    '',
    '```',
    '╔══════════════════════════════════════════╗',
    '║ W01 · 2026-07-19 → 07-25 · CUT · FMT v2  ║',
    '╚══════════════════════════════════════════╝',
    '```',
    '',
    '# ▓ PART 1 — WEIGHT & METABOLIC VERIFICATION',
    '',
    '## 🟢 QUICK VERDICT',
    'The cut is working.',
    '',
    '## 🧮 THE MATH & TDEE CHECK',
    'ANCHOR A · DIARY (blueprint primary)     2,400   ← ADOPTED',
    'ANCHOR B · HISTORICAL CUT @1,925         2,430   (−0.46 kg/wk @ 65.6 kg)',
    'ANCHOR C · BOTTOM-UP THIS WEEK           2,290   (range 2,163–2,420)',
    '',
    '# ▓ PART 2 — GYM PERFORMANCE & HYPERTROPHY',
    '',
    '## ⚑ DB LADDER VALIDATOR',
    'Steps are 11–25% relative.',
    '',
    '## Adherence notes',
    'not a section heading — it does not shout',
  ].join('\n')

  it('reads `# ▓ PART n` as a part', () => {
    const r = parseFmtV2(DOC)!
    expect(r.parts.map((p) => p.title)).toEqual([
      'WEIGHT & METABOLIC VERIFICATION', 'GYM PERFORMANCE & HYPERTROPHY',
    ])
  })

  it('reads `## 🟢 TITLE` as a section and lifts the emoji out', () => {
    const r = parseFmtV2(DOC)!
    expect(r.parts[0].sections.map((s) => [s.emoji, s.title])).toEqual([
      ['🟢', 'QUICK VERDICT'], ['🧮', 'THE MATH & TDEE CHECK'],
    ])
  })

  it('accepts a glyph that is not Extended_Pictographic (⚑, ◆)', () => {
    const r = parseFmtV2(DOC)!
    expect(r.parts[1].sections[0]).toMatchObject({ emoji: '⚑', title: 'DB LADDER VALIDATOR' })
  })

  it('does not promote an ordinary sentence-case heading to a section', () => {
    const r = parseFmtV2(DOC)!
    const titles = r.parts[1].sections.map((s) => s.title)
    expect(titles).not.toContain('Adherence notes')
    // It survives as body text under the section above it — never dropped.
    expect(r.parts[1].sections.some((s) => s.lines.some((l) => /Adherence notes/.test(l)))).toBe(true)
  })

  it('leaves the banner in the preamble, not in a part', () => {
    const r = parseFmtV2(DOC)!
    expect(r.preamble.join('\n')).toContain('W01')
    expect(r.preamble.join('\n')).toContain('HELIX OS')
  })

  it('classifies the TDEE section and reads all three anchors', () => {
    const r = parseFmtV2(DOC)!
    expect(r.parts[0].sections[1].kind).toBe('tdee')
    expect(r.tdee).toEqual([
      { key: 'A', label: 'DIARY (blueprint primary)', value: 2400, adopted: true },
      { key: 'B', label: 'HISTORICAL CUT @1,925', value: 2430, adopted: false },
      { key: 'C', label: 'BOTTOM-UP THIS WEEK', value: 2290, adopted: false },
    ])
  })
})

describe('parseTdeeAnchors — trailing parentheticals', () => {
  it('ignores an annotation that carries its own numbers', () => {
    // Without this the ladder read 65.6 and 2,420 — a 65-kcal rung on a daily
    // energy chart, drawn to scale next to a bar it invented.
    expect(parseTdeeAnchors(['ANCHOR B · HISTORICAL CUT @1,925   2,430   (−0.46 kg/wk @ 65.6 kg)']))
      .toEqual([{ key: 'B', label: 'HISTORICAL CUT @1,925', value: 2430, adopted: false }])
    expect(parseTdeeAnchors(['ANCHOR C · BOTTOM-UP   2,290   (range 2,163–2,420)'])[0].value).toBe(2290)
  })

  it('still takes the last number when there is no parenthetical', () => {
    expect(parseTdeeAnchors(['ANCHOR D · TDEE ×1.15   2,760'])[0])
      .toMatchObject({ label: 'TDEE ×1.15', value: 2760 })
  })
})
