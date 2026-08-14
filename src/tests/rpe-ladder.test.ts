import { describe, it, expect } from 'vitest'
import {
  RPE_LADDER,
  rpeStopIndex,
  rpeLabel,
  rpeColor,
  nudgeRpe,
  normalizeCr10,
  cr10Label,
} from '@/lib/training/effort'
import { resolveSeededRpe, deriveSessionRpe } from '@/lib/training/rpeMemory'
import { cascadeSetEdit, type DraftSet } from '@/lib/sessions/draft'
import { buildTemplateDraft, type ExerciseHistoryEntry } from '@/lib/sessions/templateDraft'
import { payloadToTemplate, templateToDraft } from '@/lib/sessions/routineTemplate'
import { PROGRAMS } from '@/lib/programs'

/**
 * The per-set ladder.
 *
 * Per-set RPE was three chips — Easy 7 / Hard 9 / Failure 10 — which collapsed
 * the one distinction that matters most in a hypertrophy block: a set with zero
 * reps left but clean form is not a set you failed. Seven stops, all of them on
 * the 0.5 grid `workout_sets.rpe` already stores, so no DDL.
 */
describe('RPE_LADDER — seven stops on the existing 0.5 grid', () => {
  it('is the agreed ladder, in order', () => {
    expect(RPE_LADDER.map((s) => [s.value, s.label])).toEqual([
      [5, 'Very Easy'],
      [6.5, 'Easy'],
      [7.5, 'Medium'],
      [8.5, 'Hard'],
      [9, 'Very Hard'],
      [9.5, 'Max Effort'],
      [10, 'Failure'],
    ])
  })

  it('every stop survives normalizeCr10 unchanged — the column can store all of them', () => {
    for (const s of RPE_LADDER) expect(normalizeCr10(s.value)).toBe(s.value)
  })

  it('is strictly ascending, so a pip index is a monotonic effort', () => {
    const vals = RPE_LADDER.map((s) => s.value)
    expect([...vals].sort((a, b) => a - b)).toEqual(vals)
  })
})

describe('rpeStopIndex — which pip is lit', () => {
  it('finds the exact stop', () => {
    expect(rpeStopIndex(5)).toBe(0)
    expect(rpeStopIndex(8.5)).toBe(3)
    expect(rpeStopIndex(10)).toBe(6)
  })

  it('returns -1 for a value between stops — a nudged rating lights no pip cleanly', () => {
    expect(rpeStopIndex(8)).toBe(-1)
    expect(rpeStopIndex(6)).toBe(-1)
  })

  it('returns -1 for unrated', () => {
    expect(rpeStopIndex(null)).toBe(-1)
    expect(rpeStopIndex(undefined)).toBe(-1)
  })
})

describe('rpeLabel — every stored value gets a word, including historical ones', () => {
  it('uses the ladder label on an exact stop', () => {
    expect(rpeLabel(9.5)).toBe('Max Effort')
    expect(rpeLabel(10)).toBe('Failure')
  })

  /**
   * The four rows written by the old 3-chip picker hold 9 and 10; the ten rated
   * sessions hold 6, 7 and 8. None of those may render as a dash.
   */
  it('falls back to the CR10 anchor for off-ladder legacy values', () => {
    expect(rpeLabel(8)).toBe(cr10Label(8))
    expect(rpeLabel(7)).toBe(cr10Label(7))
    expect(rpeLabel(6)).toBe(cr10Label(6))
    expect(rpeLabel(8)).not.toBe('—')
  })

  it('is a dash only when there is genuinely no rating', () => {
    expect(rpeLabel(null)).toBe('—')
    expect(rpeLabel(undefined)).toBe('—')
  })
})

/**
 * GOLD means a personal record and nothing else, app-wide (`WEEK_STATE.pr`).
 * The ladder therefore ramps emerald → sand → ember → oxide and never touches it.
 */
describe('rpeColor — a dedicated ramp, because cr10Color flattens the ladder', () => {
  it('never returns gold', () => {
    for (const s of RPE_LADDER) expect(rpeColor(s.value).toUpperCase()).not.toBe('#D4AF37')
  })

  it('separates the top four stops, which cr10Color paints identically', () => {
    const top = [8.5, 9, 9.5, 10]
    expect(new Set(top.map(rpeColor)).size).toBeGreaterThan(1)
  })

  it('is monotonic — no stop is cooler than the one below it', () => {
    const ramp = RPE_LADDER.map((s) => rpeColor(s.value))
    const firstIndexOf = new Map<string, number>()
    ramp.forEach((c, i) => { if (!firstIndexOf.has(c)) firstIndexOf.set(c, i) })
    // A colour, once left behind, never comes back.
    const seen: string[] = []
    for (const c of ramp) if (seen[seen.length - 1] !== c) seen.push(c)
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('returns the muted token when unrated', () => {
    expect(rpeColor(null)).toBe('#8E9AAC')
  })
})

describe('nudgeRpe — long-press reaches the values between stops', () => {
  it('steps by a half in both directions', () => {
    expect(nudgeRpe(8.5, 1)).toBe(9)
    expect(nudgeRpe(8.5, -1)).toBe(8)
  })

  it('clamps to the column CHECK, never outside 1–10', () => {
    expect(nudgeRpe(10, 1)).toBe(10)
    expect(nudgeRpe(1, -1)).toBe(1)
  })

  it('is a no-op on an unrated set — a nudge cannot invent a rating', () => {
    expect(nudgeRpe(null, 1)).toBeNull()
    expect(nudgeRpe(undefined, -1)).toBeNull()
  })
})

/**
 * MEMORY + AUTO-RESET.
 *
 * Last session's rating seeds this session's set. It must clear the moment the
 * work gets harder, or the deck quietly reports that 62.5 kg felt exactly like
 * 60 kg did — a number you never gave it.
 */
describe('resolveSeededRpe — harder work clears the remembered rating', () => {
  const seed = { rpe: 8.5, weightKg: 60, reps: 10 }

  it('clears when the load goes up', () => {
    expect(resolveSeededRpe(seed, { weightKg: 62.5, reps: 10 })).toEqual({ rpe: undefined, stale: true })
  })

  it('clears when the reps go up at the same load — the other half of double progression', () => {
    expect(resolveSeededRpe(seed, { weightKg: 60, reps: 12 })).toEqual({ rpe: undefined, stale: true })
  })

  it('keeps the rating when the reps drop', () => {
    expect(resolveSeededRpe(seed, { weightKg: 60, reps: 8 })).toEqual({ rpe: 8.5, stale: false })
  })

  /**
   * A deload would otherwise wipe every remembered value in the program at once.
   * The old rating is imperfect on a lighter set; it is not wrong the way an
   * inherited rating on a HEAVIER set is wrong.
   */
  it('keeps the rating when the load drops', () => {
    expect(resolveSeededRpe(seed, { weightKg: 57.5, reps: 10 })).toEqual({ rpe: 8.5, stale: false })
  })

  it('restores after an up-and-back-down nudge — a mis-tap is not a decision', () => {
    const cleared = resolveSeededRpe(seed, { weightKg: 62.5, reps: 10 })
    expect(cleared.rpe).toBeUndefined()
    expect(resolveSeededRpe(seed, { weightKg: 60, reps: 10 })).toEqual({ rpe: 8.5, stale: false })
  })

  /**
   * weight === 0 is REAL DATA, not missing data. Both sides of the comparison
   * are 0, so the load branch can never fire and the reps branch is the only one
   * that can — which is exactly right. Do not "fix" this with a weightKg > 0 guard.
   */
  it('uses the reps branch for bodyweight work, where the load is always 0', () => {
    const bw = { rpe: 9, weightKg: 0, reps: 10 }
    expect(resolveSeededRpe(bw, { weightKg: 0, reps: 14 })).toEqual({ rpe: undefined, stale: true })
    expect(resolveSeededRpe(bw, { weightKg: 0, reps: 10 })).toEqual({ rpe: 9, stale: false })
    expect(resolveSeededRpe(bw, { weightKg: 0, reps: 7 })).toEqual({ rpe: 9, stale: false })
  })

  it('treats putting a belt on a bodyweight lift as a load increase', () => {
    const bw = { rpe: 9, weightKg: 0, reps: 10 }
    expect(resolveSeededRpe(bw, { weightKg: 10, reps: 10 })).toEqual({ rpe: undefined, stale: true })
  })

  it('is inert with no seed — nothing remembered is not the same as stale', () => {
    expect(resolveSeededRpe(undefined, { weightKg: 60, reps: 10 })).toEqual({ rpe: undefined, stale: false })
  })
})

/**
 * session_rpe stays a column, but stops being a thing you type. Volume-weighted,
 * because battery drain reads it as an intensity multiplier and a max would
 * over-drain a session whose only hard set was a finisher.
 */
describe('deriveSessionRpe — volume-weighted mean over rated working sets', () => {
  it('weights by set volume, not by set count', () => {
    // 100kg×10 @10 (1000 kg) vs 10kg×10 @5 (100 kg) → pulled hard toward the 10.
    const v = deriveSessionRpe([
      { weightKg: 100, reps: 10, rpe: 10 },
      { weightKg: 10, reps: 10, rpe: 5 },
    ])
    expect(v).toBe(9.5)
  })

  it('ignores warm-ups', () => {
    expect(deriveSessionRpe([
      { weightKg: 60, reps: 10, rpe: 5, setType: 'warmup' },
      { weightKg: 60, reps: 10, rpe: 9 },
    ])).toBe(9)
  })

  it('ignores unrated sets rather than scoring them zero', () => {
    expect(deriveSessionRpe([
      { weightKg: 60, reps: 10, rpe: 8.5 },
      { weightKg: 60, reps: 10 },
    ])).toBe(8.5)
  })

  it('returns null when nothing is rated — never a fabricated number', () => {
    expect(deriveSessionRpe([{ weightKg: 60, reps: 10 }])).toBeNull()
    expect(deriveSessionRpe([])).toBeNull()
  })

  /**
   * An unloaded set has zero volume and would vanish from a volume-weighted mean
   * entirely. It still happened, so it falls back to counting once.
   */
  it('still counts a rated bodyweight set, which has no tonnage to weight by', () => {
    expect(deriveSessionRpe([{ weightKg: 0, reps: 20, rpe: 9 }])).toBe(9)
  })

  it('snaps to the 0.5 grid the column stores', () => {
    const v = deriveSessionRpe([
      { weightKg: 60, reps: 10, rpe: 8.5 },
      { weightKg: 60, reps: 10, rpe: 9 },
    ])
    expect(v).toBe(9) // mean 8.75 → 8.5 or 9, never 8.75
    expect(normalizeCr10(v)).toBe(v)
  })
})

/**
 * THE CASCADE.
 *
 * `cascadeSetEdit` propagates a set-1 weight change to every later set that
 * still matched. Those rows carry inherited ratings too, and an inherited rating
 * that survives a cascade is the same lie as one that survives a direct edit —
 * so the reconciliation runs over the WHOLE list, not just the edited row.
 */
describe('cascadeSetEdit — inherited ratings clear across the cascade', () => {
  const seeded = (weightKg: number, reps: number, rpe: number): DraftSet => ({
    weightKg, reps, rpe, rpeSeed: rpe, rpeSeedWeightKg: weightKg, rpeSeedReps: reps,
  })

  it('clears the edited row when its load goes up', () => {
    const out = cascadeSetEdit([seeded(60, 10, 8.5)], 0, { weightKg: 62.5 })
    expect(out[0].rpe).toBeUndefined()
    expect(out[0].rpeStale).toBe(true)
  })

  it('clears the CASCADED rows too, not just the one that was touched', () => {
    const sets = [seeded(60, 10, 8.5), seeded(60, 10, 9), seeded(60, 10, 9.5)]
    const out = cascadeSetEdit(sets, 0, { weightKg: 65 })
    expect(out.map((s) => s.weightKg)).toEqual([65, 65, 65])
    expect(out.every((s) => s.rpe === undefined && s.rpeStale)).toBe(true)
  })

  it('leaves a manually-tuned later set alone — it neither cascades nor clears', () => {
    const sets = [seeded(60, 10, 8.5), seeded(70, 8, 9)]
    const out = cascadeSetEdit(sets, 0, { weightKg: 62.5 })
    expect(out[1].weightKg).toBe(70)
    expect(out[1].rpe).toBe(9)
    expect(out[1].rpeStale).toBeUndefined()
  })

  it('restores when the load comes back down', () => {
    const sets = [seeded(60, 10, 8.5)]
    const up = cascadeSetEdit(sets, 0, { weightKg: 65 })
    expect(up[0].rpe).toBeUndefined()
    const back = cascadeSetEdit(up, 0, { weightKg: 60 })
    expect(back[0].rpe).toBe(8.5)
    expect(back[0].rpeStale).toBeUndefined()
  })

  /**
   * Once you tap a rating it is YOURS. Without releasing the seed, a later
   * weight nudge would wipe a value you deliberately entered.
   */
  it('a rating you tapped yourself survives a later load increase', () => {
    const sets = [seeded(60, 10, 8.5)]
    const rated = cascadeSetEdit(sets, 0, { rpe: 10 })
    expect(rated[0].rpeSeed).toBeUndefined()
    const heavier = cascadeSetEdit(rated, 0, { weightKg: 70 })
    expect(heavier[0].rpe).toBe(10)
  })

  it('does not invent a rating on a set that never had one', () => {
    const out = cascadeSetEdit([{ weightKg: 60, reps: 10 }], 0, { weightKg: 65 })
    expect(out[0].rpe).toBeUndefined()
    expect(out[0].rpeStale).toBeUndefined()
  })
})

/**
 * THE THREE SEEDING PATHS.
 *
 * A stored routine template short-circuits history entirely, so RPE memory that
 * only worked through `seedFromHistory` would have been dead on every templated
 * day while appearing to work on the rare cold-start one.
 */
describe('RPE memory reaches the deck through every seeding path', () => {
  const legsB = PROGRAMS.apex51.days.find((d) => d.key === 'legs_b')!

  it('path 1 — history: seeds the rating and the numbers it was earned against', () => {
    const history = new Map<string, ExerciseHistoryEntry>([
      ['Leg Press', {
        date: '2026-08-07',
        sets: [
          { weightKg: 60, reps: 15, setType: 'warmup', rpe: 5 },
          { weightKg: 100, reps: 12, rpe: 8.5 },
        ],
      }],
    ])
    const press = buildTemplateDraft(legsB, '2026-08-14', history)
      .exercises.find((e) => e.name === 'Leg Press')!
    const [warm, work] = press.sets
    expect(work.rpe).toBe(8.5)
    expect([work.rpeSeedWeightKg, work.rpeSeedReps]).toEqual([100, 12])
    // A warm-up is never rated, so it never seeds one.
    expect(warm.rpe).toBeUndefined()
    expect(warm.rpeSeed).toBeUndefined()
  })

  it('path 0 — stored template: the payload round-trips the rating', () => {
    const tpl = payloadToTemplate([
      { exerciseName: 'Leg Press', weightKg: 100, reps: 12, rpe: 8.5 },
      { exerciseName: 'Leg Press', weightKg: 60, reps: 15, rpe: 5, setType: 'warmup' },
    ])!
    const stored = tpl.exercises[0].sets
    expect(stored[0].rpe).toBe(8.5)
    expect(stored[1].rpe).toBeUndefined()   // warm-up carries none

    const press = templateToDraft(tpl, legsB, '2026-08-14').exercises[0]
    expect(press.sets[0].rpe).toBe(8.5)
    expect([press.sets[0].rpeSeedWeightKg, press.sets[0].rpeSeedReps]).toEqual([100, 12])
  })

  it('a templated deck clears the seeded rating when you raise the load', () => {
    const tpl = payloadToTemplate([
      { exerciseName: 'Leg Press', weightKg: 100, reps: 12, rpe: 8.5 },
    ])!
    const press = templateToDraft(tpl, legsB, '2026-08-14').exercises[0]
    const out = cascadeSetEdit(press.sets, 0, { weightKg: 105 })
    expect(out[0].rpe).toBeUndefined()
    expect(out[0].rpeStale).toBe(true)
  })

  it('a cold start seeds no rating at all — there is nothing to remember', () => {
    const d = buildTemplateDraft(legsB, '2026-08-14')
    for (const ex of d.exercises) for (const s of ex.sets) {
      expect(s.rpe).toBeUndefined()
      expect(s.rpeSeed).toBeUndefined()
    }
  })
})
