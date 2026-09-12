/**
 * THE GOLDEN FIXTURE, AND THE ONE PLACE THAT WRITES IT.
 *
 * `native/Packages/OnyxCore/Tests/OnyxCoreTests/Fixtures/weekly-export.json`
 * holds eight weeks as INPUT and the document each one renders to as EXPECTED,
 * and it is read by both languages: this suite and `export-layout.test.ts` on
 * the TypeScript side, `ReportsGoldenTests.swift` on the Swift side. That is
 * what makes "byte for byte" a fact rather than an intention.
 *
 * ── WHY A WRITER LIVES INSIDE A TEST ─────────────────────────────────────────
 * Until v4 the `expected` half was maintained BY HAND — eight full documents,
 * rewritten for every format change. That is the kind of cost that quietly
 * decides a format will never be improved again, and it was most of the reason
 * v3 stayed unreadable for as long as it did.
 *
 * So the renderer writes its own fixture:
 *
 *     ONYX_WRITE_FIXTURE=1 npx vitest run src/tests/export-golden.test.ts
 *
 * and every other run ASSERTS against it. A regeneration is a diff you read
 * before you commit it, which is the only safety a golden file ever had.
 *
 * It is a test rather than a `scripts/*.mjs` on purpose: the renderer is
 * TypeScript behind an `@/` alias, vitest already resolves both, and the repo's
 * own guard rightly refuses to run anything under `scripts/` without ceremony.
 * The Swift port is then the only half that has to be matched by hand.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'fs'
import {
  buildWeeklyExport, weeklySummary, trendTotals, energyBalance,
  type WeeklyExportInput,
} from '@/lib/reports/weeklyExport'
import { derivedWeek } from '@/lib/reports/derived'

const FIXTURE = 'native/Packages/OnyxCore/Tests/OnyxCoreTests/Fixtures/weekly-export.json'

interface Case {
  name: string
  input: WeeklyExportInput
  expected: Record<string, unknown>
}

const doc = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
  module: string; fn: string; note: string; cases: Case[]
}

/** Everything the fixture pins for one week. */
function render(input: WeeklyExportInput) {
  return {
    markdown: buildWeeklyExport(input),
    summary: weeklySummary(input),
    totals: trendTotals(input.days, input.sessions, input.cardio ?? []),
    energy: energyBalance(input.days),
    derived: derivedWeek(input),
  }
}

describe('the weekly export, byte for byte', () => {
  if (process.env.ONYX_WRITE_FIXTURE) {
    it('REGENERATES the fixture — read the diff before committing it', () => {
      doc.note = 'The whole document, byte for byte, plus the aggregates it renders from. '
        + 'Regenerate with ONYX_WRITE_FIXTURE=1 npx vitest run src/tests/export-golden.test.ts; '
        + 'the Swift port must then be matched by hand.'
      doc.fn = 'buildWeeklyExport / weeklySummary / trendTotals / energyBalance / derivedWeek'
      for (const c of doc.cases) c.expected = render(c.input) as unknown as Record<string, unknown>
      writeFileSync(FIXTURE, `${JSON.stringify(doc, null, 2)}\n`)
      expect(doc.cases.length).toBeGreaterThan(0)
    })
    return
  }

  for (const c of doc.cases) {
    it(c.name, () => {
      const got = render(c.input)
      // Markdown first and on its own: a whole-object diff on a failure prints
      // the document twice and the first differing LINE nowhere.
      expect(got.markdown).toBe(c.expected.markdown)
      expect(JSON.parse(JSON.stringify(got.summary))).toEqual(c.expected.summary)
      expect(JSON.parse(JSON.stringify(got.totals))).toEqual(c.expected.totals)
      expect(JSON.parse(JSON.stringify(got.energy))).toEqual(c.expected.energy)
      expect(JSON.parse(JSON.stringify(got.derived))).toEqual(c.expected.derived)
    })
  }
})
