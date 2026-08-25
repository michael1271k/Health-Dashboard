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
import { applySetPatch, cascadeSetEdit, type DraftSet } from '@/lib/sessions/draft'
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
describe('RPE_LADDER — eight stops on the existing 0.5 grid', () => {
  it('is the agreed ladder, in order', () => {
    expect(RPE_LADDER.map((s) => [s.value, s.label])).toEqual([
      [5, 'Very Easy'],
      [6.5, 'Easy'],
      [7.5, 'Medium'],
      [8, 'Challenging'],
      [8.5, 'Hard'],
      [9, 'Very Hard'],
      [9.5, 'Max Effort'],
      [10, 'Failure'],
    ])
  })

  /**
   * The gap that 8.0 closes. Medium → Hard used to be a full point while the
   * top four stops shared 1.5 between them, so the ladder was coarsest exactly
   * where a hypertrophy block spends its sets.
   */
  it('has no gap wider than 1.5, and none wider than a point above Medium', () => {
    const vals = RPE_LADDER.map((s) => s.value)
    const gaps = vals.slice(1).map((v, i) => Math.round((v - vals[i]) * 10) / 10)
    expect(Math.max(...gaps)).toBeLessThanOrEqual(1.5)
    const aboveMedium = vals.slice(vals.indexOf(7.5) + 1)
    for (const v of aboveMedium) {
      const prev = vals[vals.indexOf(v) - 1]
      expect(Math.round((v - prev) * 10) / 10).toBeLessThanOrEqual(0.5)
    }
  })

  /**
   * ── THE DATA-SAFETY CLAUSE ────────────────────────────────────────────────
   * The whole reason this stop could be added without a migration: it is on the
   * grid `numeric(3,1)` already stores. If a future stop is ever added off the
   * 0.5 grid, this fails before it reaches the database.
   */
  it('every stop is on the 0.5 grid the column stores', () => {
    for (const s of RPE_LADDER) expect(s.value * 2).toBe(Math.round(s.value * 2))
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
    expect(rpeStopIndex(8)).toBe(3)
    expect(rpeStopIndex(8.5)).toBe(4)
    expect(rpeStopIndex(10)).toBe(7)
  })

  it('returns -1 for a value between stops — a nudged rating lights no pip cleanly', () => {
    expect(rpeStopIndex(7)).toBe(-1)
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
    expect(rpeLabel(7)).toBe(cr10Label(7))
    expect(rpeLabel(6)).toBe(cr10Label(6))
    expect(rpeLabel(7)).not.toBe('—')
  })

  /**
   * ── WHAT ADDING 8.0 DID TO HISTORY, STATED EXACTLY ────────────────────────
   * A stored 8 used to fall through to the CR10 anchor "Very hard". It is now
   * an exact stop, so it reads "Challenging" instead. The NUMBER is untouched —
   * that is the whole contract. Nothing is orphaned, nothing renders as a dash,
   * and no row was rewritten.
   */
  it('relabels a stored 8 without moving it', () => {
    expect(rpeLabel(8)).toBe('Challenging')
    expect(rpeLabel(8)).not.toBe('—')
    expect(normalizeCr10(8)).toBe(8)
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

  /**
   * The reason AMBER exists. 8, 8.5 and 9 are the three rungs that separate
   * "hard" from "nearly failed"; before this band they all painted EMBER, so
   * the pip row said one thing at three different ratings.
   */
  it('gives 8.0 a band of its own, distinct from the stops on either side', () => {
    expect(rpeColor(8)).toBe('#E0A03C')
    expect(rpeColor(8)).not.toBe(rpeColor(7.5))
    expect(rpeColor(8)).not.toBe(rpeColor(8.5))
    expect(rpeColor(8.5)).toBe(rpeColor(9))
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

  it('clears the CASCADED row too, not just the one that was touched', () => {
    const sets = [seeded(60, 10, 8.5), seeded(60, 10, 9), seeded(60, 10, 9.5)]
    const out = cascadeSetEdit(sets, 0, { weightKg: 65 })
    // ONE STEP: set 2 follows set 1, set 3 does not. Set 3 keeps its rating
    // because nothing about it changed.
    expect(out.map((s) => s.weightKg)).toEqual([65, 65, 60])
    expect(out.slice(0, 2).every((s) => s.rpe === undefined && s.rpeStale)).toBe(true)
    expect(out[2].rpe).toBe(9.5)
  })

  it('cascades exactly one set forward — never to the third', () => {
    const sets: DraftSet[] = [
      { weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 },
    ]
    const out = cascadeSetEdit(sets, 0, { reps: 11 })
    expect(out.map((s) => s.reps)).toEqual([11, 11, 10])
  })

  it('carries an edit from a middle set to the one after it', () => {
    const sets: DraftSet[] = [
      { weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 },
    ]
    const out = cascadeSetEdit(sets, 1, { weightKg: 42.5 })
    expect(out.map((s) => s.weightKg)).toEqual([40, 42.5, 42.5])
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
   * ── THE VANISHING FAILURE ──────────────────────────────────────────────────
   * The exact sequence, from a real session. Leg Extension set 3 was taken to
   * failure last week, so it seeds this week at 10 with the top pip already lit
   * and its seed intact. Tapping that pip looked like "rate this Failure" and
   * was read as "withdraw the rating" — and because a CLEAR did not release the
   * seed (`patch.rpe !== undefined` is false when the value is undefined),
   * `applyRpeMemory` put the remembered 10 straight back. The tap did nothing.
   *
   * Memory therefore still owned the row, so adding one rep made the work
   * harder than the seed was earned against and the rating cleared itself. The
   * "10 · FAILURE" readout went, and the ± steppers went with it — they render
   * only over a rating that exists.
   *
   * The ladder now CONFIRMS a seeded stop on the first tap rather than clearing
   * it, and any patch that carries an `rpe` key at all takes ownership.
   */
  it('a confirmed seeded rating survives the rep that follows it', () => {
    const sets = [seeded(50, 11, 10)]
    // Tap the lit-but-seeded stop: confirm, not clear.
    const confirmed = cascadeSetEdit(sets, 0, { rpe: 10 })
    expect(confirmed[0].rpeSeed).toBeUndefined()
    expect(confirmed[0].setType).toBe('failure')
    // One more rep. The rating is the user's now; memory has no say.
    const after = cascadeSetEdit(confirmed, 0, { reps: 12 })
    expect(after[0].rpe).toBe(10)
    expect(after[0].setType).toBe('failure')
    expect(after[0].rpeStale).toBeUndefined()
  })

  it('clearing a rating is a decision, and memory does not undo it', () => {
    // `{ rpe: undefined }` is what the ladder sends on a withdraw. It used to
    // leave the seed in place, so the remembered value reappeared instantly.
    const out = cascadeSetEdit([seeded(50, 11, 8.5)], 0, { rpe: undefined })
    expect(out[0].rpe).toBeUndefined()
    expect(out[0].rpeSeed).toBeUndefined()
    expect(out[0].rpeStale).toBeUndefined()
  })

  /**
   * ── THE TAG IS DERIVED, SO EVERY CONTROL AGREES ────────────────────────────
   * The `F` tag used to be mirrored by hand at the pip's own click handler. The
   * ± steppers call the same `onPick` and were not part of that mirror, so
   * nudging 9.5 up to 10 produced a set reading "10 · FAILURE" with no tag.
   */
  it('any rating that lands on 10 tags the set failure, however it got there', () => {
    const stepped = cascadeSetEdit([{ weightKg: 50, reps: 11, rpe: 9.5 }], 0, { rpe: 10 })
    expect(stepped[0].setType).toBe('failure')
  })

  it('stepping off 10 puts the tag out', () => {
    const off = cascadeSetEdit([{ weightKg: 50, reps: 11, rpe: 10, setType: 'failure' }], 0, { rpe: 9.5 })
    expect(off[0].setType).toBeUndefined()
  })

  it('never overwrites a warm-up or a drop set — those are not claims about effort', () => {
    const warm = cascadeSetEdit([{ weightKg: 50, reps: 11, setType: 'warmup' }], 0, { rpe: 10 })
    expect(warm[0].setType).toBe('warmup')
    const drop = cascadeSetEdit([{ weightKg: 50, reps: 11, setType: 'dropset' }], 0, { rpe: 10 })
    expect(drop[0].setType).toBe('dropset')
  })

  it('an explicit setType in the same patch wins over the derivation', () => {
    // `pickType('warmup')` on a failed set sends both keys at once.
    const out = cascadeSetEdit(
      [{ weightKg: 50, reps: 11, rpe: 10, setType: 'failure' }], 0,
      { setType: 'warmup', rpe: undefined },
    )
    expect(out[0].setType).toBe('warmup')
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

/**
 * ── THE SPLIT SET IS A SECOND WRITE PATH, AND IT BYPASSES THE CASCADE ────────
 *
 * `useSessionDraft.updateSet` deliberately does NOT call `cascadeSetEdit` for a
 * unilateral set: the other side of a first-set pair always shares its value,
 * so cascading there would be mirroring under a different name — the exact
 * behaviour the Linked toggle was deleted for.
 *
 * Which means anything that lives inside the cascade is something a split set
 * silently never gets. When the failure derivation was first moved out of the
 * component and into `cascadeSetEdit`, that is precisely what happened: the F
 * tag lit on a bilateral set taken to failure and not on a per-side one, while
 * `DraftSet` documents failure as tracked PER SIDE and `save.ts` would have
 * persisted that side as `set_type: 'normal'` — the UI showing 10, the record
 * losing the tag, and no test looking.
 *
 * The per-SET rules therefore live in `applySetPatch`, which BOTH paths call.
 * These assert it directly, on a set carrying a `pairId`, because that is the
 * shape the bypass is keyed on.
 */
describe('applySetPatch — the rules a split set must get too', () => {
  const side = (s: 'L' | 'R', over: Partial<DraftSet> = {}): DraftSet =>
    ({ weightKg: 20, reps: 10, side: s, pairId: 'pair_x', ...over })

  it('derives the failure tag on a per-side set', () => {
    expect(applySetPatch(side('L'), { rpe: 10 }).setType).toBe('failure')
  })

  it('clears it when that side steps off 10, and leaves the other side alone', () => {
    const left = applySetPatch(side('L', { rpe: 10, setType: 'failure' }), { rpe: 9.5 })
    expect(left.setType).toBeUndefined()
    // The other side is a separate row and this function never sees it — which
    // is the whole point of splitting: a genuinely weaker arm gets its own record.
    const right = side('R', { rpe: 10, setType: 'failure' })
    expect(right.setType).toBe('failure')
  })

  it('takes ownership of a seeded rating on a per-side set', () => {
    const seededSide = side('L', { rpe: 8.5, rpeSeed: 8.5, rpeSeedWeightKg: 20, rpeSeedReps: 10 })
    const out = applySetPatch(seededSide, { rpe: 10 })
    expect(out.rpeSeed).toBeUndefined()
    expect(out.setType).toBe('failure')
  })

  it('still refuses to overwrite a warm-up', () => {
    expect(applySetPatch(side('L', { setType: 'warmup' }), { rpe: 10 }).setType).toBe('warmup')
  })

  it('leaves a patch that does not touch the rating completely alone', () => {
    const out = applySetPatch(side('L', { rpe: 10, setType: 'failure' }), { reps: 11 })
    expect(out.reps).toBe(11)
    expect(out.rpe).toBe(10)
    expect(out.setType).toBe('failure')
  })
})

/**
 * ── THE VANISHING FAILURE TAG, ROUND THREE ──────────────────────────────────
 *
 * Reported against Lateral Raise Cable, set 3: 3.75 kg × 16 @ 10 (Failure).
 * Add one rep and the readout, the word and both ± steppers left the screen in
 * the same frame.
 *
 * The first fix made TAPPING a seeded stop take ownership. It was correct and
 * it was not the reported gesture — the reported gesture is the rep stepper,
 * which never touches the rating at all. What actually happened is that
 * `resolveSeededRpe` withdrew the inherited value the moment 17 > 16, which is
 * right for the SAVE and was catastrophic for the SCREEN: the number was the
 * only copy of itself, and the control that could restore it was gated on the
 * number existing.
 *
 * Two rules now stand between the user and that:
 *   1. A set you have TICKED owns its rating — memory has no further say.
 *   2. A withdrawn rating is still drawn, as an unconfirmed ghost, and its
 *      controls stay mounted. `rpe` stays undefined until it is affirmed, so
 *      nothing dishonest is ever saved.
 */
describe('a rating never disappears from a set you are logging', () => {
  const lateralRaise = (): DraftSet => ({
    weightKg: 3.75, reps: 16, rpe: 10, setType: 'failure',
    rpeSeed: 10, rpeSeedWeightKg: 3.75, rpeSeedReps: 16, done: false,
  })

  it('keeps the remembered value reachable when a rep bump withdraws it', () => {
    const out = cascadeSetEdit([lateralRaise()], 0, { reps: 17 })[0]
    // Withdrawn from the save, exactly as before — an inherited 10 must never
    // claim that 17 reps felt like 16 did.
    expect(out.rpe).toBeUndefined()
    expect(out.rpeStale).toBe(true)
    // But still on the set, which is what the ladder draws its ghost from. This
    // is the assertion the old build could not make: the number survived only
    // inside `rpeSeed`, and nothing rendered `rpeSeed`.
    expect(out.rpeSeed).toBe(10)
  })

  it('lets one tap on the ghost make it the user’s own', () => {
    const stale = cascadeSetEdit([lateralRaise()], 0, { reps: 17 })[0]
    const confirmed = cascadeSetEdit([stale], 0, { rpe: 10 })[0]
    expect(confirmed.rpe).toBe(10)
    expect(confirmed.rpeSeed).toBeUndefined()
    expect(confirmed.rpeStale).toBeUndefined()
    expect(confirmed.setType).toBe('failure')
    // And now it is immovable: more reps cannot take it back off.
    expect(cascadeSetEdit([confirmed], 0, { reps: 18 })[0].rpe).toBe(10)
  })

  it('freezes the rating the moment the set is ticked green', () => {
    // The gesture that used to leave it exposed. `toggleSetDone` sent a bare
    // spread, so none of the per-set rules ran and the seed stayed in charge of
    // a set the user had already declared finished.
    const ticked = applySetPatch(lateralRaise(), { done: true })
    expect(ticked.rpeSeed).toBeUndefined()
    const after = cascadeSetEdit([ticked], 0, { reps: 17 })[0]
    expect(after.rpe).toBe(10)
    expect(after.setType).toBe('failure')
    expect(after.rpeStale).toBeUndefined()
  })

  it('does not answer the question for you when the ghost is still unconfirmed', () => {
    // Ticking a set whose proposal has already been withdrawn must NOT adopt
    // the proposal — that is the lie the whole memory system exists to prevent.
    // The seed stays so the ghost stays offerable; the rating stays absent.
    const stale = cascadeSetEdit([lateralRaise()], 0, { reps: 17 })[0]
    const ticked = applySetPatch(stale, { done: true })
    expect(ticked.rpe).toBeUndefined()
    expect(ticked.rpeSeed).toBe(10)
    expect(ticked.rpeStale).toBe(true)
  })

  it('leaves an unrated set unrated when it is ticked', () => {
    const plain: DraftSet = { weightKg: 40, reps: 12, done: false }
    expect(applySetPatch(plain, { done: true })).toEqual({ weightKg: 40, reps: 12, done: true })
  })
})
