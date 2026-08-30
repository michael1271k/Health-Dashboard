import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { SetEditorRow } from '@/components/command-center/SetEditorRow'
import { SET_QUALITY, SET_QUALITY_KEYS, isSetQuality, setQualityFor } from '@/lib/training/setTags'
import { buildCommitPayload, type SessionDraft, type DraftSet } from '@/lib/sessions/draft'
import { SaveWorkoutSchema } from '@/lib/sessions/schema'
import { setDetail, type ExportSet } from '@/lib/reports/weeklyExport'
import { sessionVolumeKg } from '@/lib/sessions/volume'

/**
 * Set quality is a SECOND AXIS, not another set type.
 *
 * "Warm-up" and "form broke" are both true of the same set, so they cannot
 * share a field — and folding technique into `set_type` would give the twenty
 * existing consumers of `isWorkingSet` an opinion about form, which none of
 * them should have. These pin that separation, and pin that absence means "not
 * reported" rather than "clean".
 */

const draftWith = (sets: DraftSet[]): SessionDraft => ({
  splitDay: 'upper',
  date: '2026-08-28',
  notes: '',
  startedAt: '2026-08-28T12:00:00.000Z',
  exercises: [{ localId: 'x', name: 'Seated Cable Row (Wide Grip)', sets }],
})

describe('the vocabulary', () => {
  it('is closed, and the guard matches it exactly', () => {
    // The DB CHECK holds the same six. A seventh value here would be accepted
    // by the app and rejected by Postgres — which deletes the session and
    // throws, because there is no self-heal for a constraint violation.
    expect(SET_QUALITY_KEYS).toHaveLength(6)
    for (const k of SET_QUALITY_KEYS) expect(SET_QUALITY[k]).toBeTruthy()
    expect(Object.keys(SET_QUALITY).sort()).toEqual([...SET_QUALITY_KEYS].sort())
  })

  it('rejects anything outside it, including a stale key from an old draft', () => {
    expect(isSetQuality('momentum')).toBe(true)
    expect(isSetQuality('sloppy')).toBe(false)
    expect(isSetQuality(null)).toBe(false)
    expect(isSetQuality(undefined)).toBe(false)
    expect(isSetQuality('')).toBe(false)
  })

  it('resolves a clean set to nothing rather than to a "clean" label', () => {
    expect(setQualityFor(null)).toBeUndefined()
    expect(setQualityFor(undefined)).toBeUndefined()
    expect(setQualityFor('momentum')?.label).toBe('Momentum')
  })
})

describe('it changes no arithmetic', () => {
  it('leaves tonnage alone — a momentum-assisted set still happened', () => {
    // The whole reason quality is its own column: a flagged set is real work.
    // Only `ghost` removes a set from the totals.
    expect(sessionVolumeKg([{ weightKg: 40, reps: 10 }]))
      .toBe(sessionVolumeKg([{ weightKg: 40, reps: 10, setType: 'normal' }]))
  })
})

describe('the write path', () => {
  it('carries a flagged set through the payload and past the schema', () => {
    const payload = buildCommitPayload(draftWith([
      { weightKg: 40, reps: 10, quality: 'form_breakdown' },
      { weightKg: 40, reps: 10 },
    ]))
    expect(payload.sets[0].quality).toBe('form_breakdown')
    expect(SaveWorkoutSchema.safeParse(payload).success).toBe(true)
  })

  it('nulls a value the vocabulary does not contain rather than sending it', () => {
    // A draft is localStorage and can hold whatever a stale build once wrote.
    // Sending it would fail the DB CHECK, which deletes the session.
    const payload = buildCommitPayload(draftWith([
      { weightKg: 40, reps: 10, quality: 'totally-made-up' },
    ]))
    expect(payload.sets[0].quality).toBeNull()
    expect(SaveWorkoutSchema.safeParse(payload).success).toBe(true)
  })

  it('sends null for a clean set, never a default', () => {
    // 2,190 historical rows must not start asserting they were inspected.
    const payload = buildCommitPayload(draftWith([{ weightKg: 40, reps: 10 }]))
    expect(payload.sets[0].quality).toBeNull()
  })
})

describe('the export', () => {
  const s = (over: Partial<ExportSet>): ExportSet =>
    ({ weightKg: 40, reps: 10, rpe: 8, side: null, failure: false, pairId: null, ...over })

  it('states it in the reader’s words, after the effort, and NAMES the axis', () => {
    // The label used to be dropped in bare — "(RPE 8 — Challenging, form
    // broke)" — which leaves a reader to work out what the third item is and
    // how it relates to the second. On a value like "Cold" or "Assisted" that
    // guess goes wrong: either reads as a comment on the effort rather than on
    // the technique. Naming the axis costs twelve characters.
    expect(setDetail([s({ quality: 'form_breakdown' })]))
      .toEqual(['Set 1: 40 kg × 10 (RPE 8 — Challenging, Set Quality: Form broke)'])
  })

  it('says nothing at all for a clean set', () => {
    expect(setDetail([s({})])).toEqual(['Set 1: 40 kg × 10 (RPE 8 — Challenging)'])
    expect(setDetail([s({ quality: null })])).toEqual(['Set 1: 40 kg × 10 (RPE 8 — Challenging)'])
  })

  it('sits alongside a set tag rather than replacing it', () => {
    // A warm-up CAN be sloppy — that is the reason for two axes.
    expect(setDetail([s({ warmup: true, rpe: null, quality: 'needed_warmup' })]))
      .toEqual(['Warm-up: 40 kg × 10 (warm-up, Set Quality: Cold)'])
  })
})

/**
 * ── THE FLAG DOES NOT LIVE IN THE ROW ────────────────────────────────────────
 *
 * It used to. `SetEditorRow` rendered the quality LABEL as a `<span>` sibling of
 * the set grid, inside a `flex items-center` button — so `block` and `mt-0.5`
 * were inert, and the label's width came straight out of the grid's `w-full`.
 * All four tracks narrowed on a flagged row and on no other, which is why the
 * weight, reps and RPE stopped lining up with the header and with every row
 * above them the moment you tagged a set "Momentum".
 *
 * The dot is on the SET BADGE — a fixed `w-7` flex child outside the grid — so
 * it cannot move a column by construction. These pin both halves.
 */
describe('a flagged set does not disturb the row', () => {
  const flagged: DraftSet = { weightKg: 60, reps: 10, rpe: 9, quality: 'momentum', done: false }
  const clean: DraftSet = { weightKg: 60, reps: 10, rpe: 9, done: false }

  const row = (set: DraftSet) => render(
    <SetEditorRow index={0} displayNum={1} set={set} active={false} trackRpe
      onActivate={() => {}} onChange={() => {}} onRemove={() => {}} />,
  ).container

  afterEach(cleanup)

  it('renders the same grid, cell for cell, flagged or not', () => {
    const a = row(flagged).querySelector('[class*="grid-cols-["]')!
    cleanup()
    const b = row(clean).querySelector('[class*="grid-cols-["]')!
    expect(a.children.length).toBe(b.children.length)
    expect(a.className).toBe(b.className)
  })

  it('puts nothing beside the grid inside the data button', () => {
    // One child, and it is the grid. A second child is the bug.
    const btn = Array.from(row(flagged).querySelectorAll('button'))
      .find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Edit'))!
    expect(btn.children.length).toBe(1)
    expect(btn.children[0].className).toMatch(/grid-cols-\[/)
  })

  it('never prints the quality LABEL in the row', () => {
    expect(row(flagged).textContent ?? '').not.toContain('Momentum')
  })

  it('says which flag it is in the badge label, for the reader who cannot see a dot', () => {
    const badge = Array.from(row(flagged).querySelectorAll('button'))
      .find((b) => (b.getAttribute('aria-label') ?? '').includes('Hold for set options'))!
    expect(badge.getAttribute('aria-label')).toContain(SET_QUALITY.momentum.full)
  })
})
