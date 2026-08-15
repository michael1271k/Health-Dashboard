import { describe, it, expect } from 'vitest'
import { progressionCue } from '@/components/session-detail/ExerciseBreakdown'

/**
 * The session report's progression cue, now a chip on the exercise header row
 * rather than a bordered sentence under its ledger.
 *
 * The chip is the DECISION and the sentence is the explanation; both have to
 * survive the move, and the states that mean "nothing to do" must render
 * nothing at all — a cue that always appears is a cue nobody reads.
 */

const t = (state: string, ceiling: number | null, suggestKg: number | null) =>
  ({ progression: { state, ceiling, suggestKg } })

describe('progressionCue', () => {
  it('says how much to add when the ceiling was cleared twice', () => {
    const cue = progressionCue(t('ready', 12, 42.5), false, 'kg')!
    expect(cue.short).toMatch(/^\+/)
    expect(cue.title).toContain('Cleared twice')
    expect(cue.title).toContain('42.5kg')
  })

  it('says "extend", not "add load", on bodyweight work', () => {
    // There is nothing to add to a pull-up; the progression is reps.
    const cue = progressionCue(t('ready', 12, null), false, 'kg')!
    expect(cue.short).toBe('extend')
    expect(cue.title).toContain('12 reps')
  })

  it('measures a hold in seconds, not reps', () => {
    const cue = progressionCue(t('ready', 45, null), true, 'kg')!
    expect(cue.title).toContain('45s')
    expect(cue.title).not.toContain('reps')
  })

  it('asks for one more clean session when only one has landed', () => {
    const cue = progressionCue(t('one-more', 15, 30), false, 'kg')!
    expect(cue.short).toBe('1 more')
    expect(cue.title).toContain('One more clean session at 15 reps')
  })

  it('renders NOTHING for every other state', () => {
    expect(progressionCue(t('hold', 12, 40), false, 'kg')).toBeNull()
    expect(progressionCue(t('below', 12, 40), false, 'kg')).toBeNull()
    expect(progressionCue(undefined, false, 'kg')).toBeNull()
  })

  it('carries the unit the caller is displaying in', () => {
    expect(progressionCue(t('ready', 12, 42.5), false, 'lb')!.title).toContain('lb')
  })
})
