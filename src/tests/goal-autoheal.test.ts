import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { NUTRIENT_SIGNALS } from '@/lib/nutrition/nutrientTargets'

/**
 * The Nutrition page's auto-heal effect is keyed on `userGoals` and its body
 * invalidates `['user_goals']` — the query that produces `userGoals`. That is a
 * cycle by construction, and it terminated only because the refetch was assumed
 * to come back matching the preset, which makes the drift check fail second
 * time round.
 *
 * That assumption holds exactly as long as the upsert succeeds, and its error
 * was never inspected. supabase-js RETURNS errors rather than throwing, so
 * offline, behind an RLS failure, or against a column the schema cache has not
 * caught up with, the write silently does nothing, the refetch returns the same
 * drifted row, the check fires again — and the page writes in a loop for as
 * long as it stays open.
 *
 * These assert the two structural properties that make termination independent
 * of the round-trip succeeding. Both are about code shape, so they read the
 * source: there is no way to observe "did not loop forever" from a render test.
 */
const RAW = readFileSync('src/app/(dashboard)/nutrition/page.tsx', 'utf8')
const SRC = RAW
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('the goal auto-heal cannot loop', () => {
  it('latches, so the write is attempted at most once per mount', () => {
    expect(SRC).toMatch(/const healed = useRef\(false\)/)
    expect(SRC).toMatch(/if \(!g \|\| healed\.current\) return/)
    // Set BEFORE the await — two effect passes can otherwise both get through.
    const branch = SRC.slice(SRC.indexOf('healed.current) return'))
    const latchAt = branch.indexOf('healed.current = true')
    const awaitAt = branch.indexOf('await supabase')
    expect(latchAt).toBeGreaterThan(-1)
    expect(latchAt).toBeLessThan(awaitAt)
  })

  it('only re-reads when the write actually landed', () => {
    // Invalidating after a FAILED write is what closed the cycle.
    expect(SRC).toMatch(/const \{ error \} = await supabase\.from\('user_goals'\)\.upsert/)
    expect(SRC).toMatch(/if \(!error\) qc\.invalidateQueries\(\{ queryKey: \['user_goals'\] \}\)/)
  })

  it('does not derive what it DISPLAYS from the row it is repairing', () => {
    // This used to be "still shows the preset when the heal could not be
    // written", enforced by a second setGoals(preset) branch inside the effect.
    // The effect no longer owns the display at all: `useNutritionGoals()` ranks
    // the plan+phase preset above the stored row, so a failed heal costs a stale
    // widget rather than a wrong ring, and the fallback branch is unreachable
    // code that can be deleted. See nutrition-goals.test.ts for the ranking.
    expect(SRC).toMatch(/const goals = useNutritionGoals\(\)/)
    expect(SRC).not.toMatch(/setGoals\(/)
    expect(SRC).not.toMatch(/1955/)
  })
})

describe('wrist temperature is described as what it holds', () => {
  const wrist = NUTRIENT_SIGNALS.find((s) => s.key === 'wrist_temp_delta')!

  /**
   * The column is named `wrist_temp_delta` and holds the night's ABSOLUTE
   * average °C — ingest writes AppleSleepingWristTemperature straight through.
   * The label and the reference both believed the column name, so the deep-dive
   * rendered "36.2 °C" beside "±0.3 °C is normal" and every ordinary night read
   * as an anomaly.
   */
  it('does not call an absolute reading a delta', () => {
    expect(wrist.label).toBe('Wrist Temp')
    expect(wrist.label).not.toContain('Δ')
  })

  it('does not quote a delta band as the normal range for an absolute value', () => {
    expect(wrist.reference).not.toMatch(/±\s*0\.3/)
    expect(wrist.reference.toLowerCase()).toContain('baseline')
  })
})
