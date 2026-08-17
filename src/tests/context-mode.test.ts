import { describe, it, expect } from 'vitest'
import {
  contextFromDayLabel, contextFromSetting, scoringContextFor, suspendsStepGoal,
  rangeCovers, contextRangesIn, contextRangeLabel, contextRangeLine, isRangeMode,
} from '@/lib/nutrition/context'
import { computeActivityScore } from '@/lib/scoring/score'

describe('one vocabulary, read from either column', () => {
  it('folds the old day labels in, whatever their case', () => {
    expect(contextFromDayLabel('Illness')).toBe('illness')
    expect(contextFromDayLabel(' refeed ')).toBe('refeed')
    expect(contextFromDayLabel(null)).toBe('normal')
    expect(contextFromDayLabel('   ')).toBe('normal')
  })

  it('keeps an unknown stored value AS an exception day', () => {
    // A value written before the list changed must never silently stop counting
    // — that would quietly un-forgive a day someone declared months ago.
    expect(contextFromDayLabel('Wedding')).toBe('event')
  })

  it('reads the settings column with the old four still valid', () => {
    expect(contextFromSetting('travel')).toBe('travel')
    expect(contextFromSetting('emergency')).toBe('emergency')
    expect(contextFromSetting('nonsense')).toBe('normal')
  })
})

describe('what each mode does', () => {
  it('maps only the range modes onto the scorer', () => {
    expect(scoringContextFor('illness')).toBe('illness')
    expect(scoringContextFor('travel')).toBe('travel')
    // A dinner out must not improve your sleep score.
    expect(scoringContextFor('event')).toBe('normal')
    expect(scoringContextFor('refeed')).toBe('normal')
  })

  it('suspends the step goal for illness and emergency only', () => {
    expect(suspendsStepGoal('illness')).toBe(true)
    expect(suspendsStepGoal('emergency')).toBe(true)
    // An airport is one of the few places you outwalk your goal by accident.
    expect(suspendsStepGoal('travel')).toBe(false)
    expect(suspendsStepGoal('normal')).toBe(false)
  })

  it('knows which modes persist', () => {
    expect((['travel', 'illness', 'emergency'] as const).every(isRangeMode)).toBe(true)
    expect((['event', 'refeed', 'social', 'normal'] as const).some(isRangeMode)).toBe(false)
  })
})

describe('the activity component under a suspended target', () => {
  const day = { steps: 2100, activeCal: 90, stepsGoal: 12000, activeCalGoal: 500 }

  it('scores low under a normal context — which is the point of the suspension', () => {
    const score = computeActivityScore({ ...day, contextMode: 'normal' })
    expect(score).not.toBeNull()
    expect(score!).toBeLessThan(30)
  })

  it('goes NULL under illness, so the component drops out rather than grading low', () => {
    expect(computeActivityScore({ ...day, contextMode: 'illness' })).toBeNull()
    expect(computeActivityScore({ ...day, contextMode: 'emergency' })).toBeNull()
  })

  it('still grades a travel day', () => {
    expect(computeActivityScore({ ...day, contextMode: 'travel' })).not.toBeNull()
  })
})

describe('rangeCovers', () => {
  it('covers every day from the start to today', () => {
    expect(rangeCovers('illness', '2026-08-12', '2026-08-14', '2026-08-16')).toBe(true)
    expect(rangeCovers('illness', '2026-08-12', '2026-08-11', '2026-08-16')).toBe(false)
  })

  it('never covers the future', () => {
    expect(rangeCovers('illness', '2026-08-12', '2026-08-17', '2026-08-16')).toBe(false)
  })

  it('covers TODAY ONLY when the start date is unknown', () => {
    // Pre-migration. Assuming the range extends backwards would stamp arbitrary
    // history with a context, and there is no undo for that.
    expect(rangeCovers('illness', null, '2026-08-16', '2026-08-16')).toBe(true)
    expect(rangeCovers('illness', null, '2026-08-15', '2026-08-16')).toBe(false)
  })

  it('is never true for a one-day mode', () => {
    expect(rangeCovers('refeed', '2026-08-12', '2026-08-14', '2026-08-16')).toBe(false)
  })
})

describe('ranges in a week, for the export header', () => {
  const week = [
    { date: '2026-08-10', exception: null },
    { date: '2026-08-11', exception: 'Illness' },
    { date: '2026-08-12', exception: 'Illness' },
    { date: '2026-08-13', exception: 'Illness' },
    { date: '2026-08-14', exception: null },
    { date: '2026-08-15', exception: 'Refeed' },
    { date: '2026-08-16', exception: 'Illness' },
  ]

  it('collapses consecutive days into one range', () => {
    const rs = contextRangesIn(week)
    expect(rs).toHaveLength(2)
    expect(rs[0]).toMatchObject({ mode: 'illness', from: '2026-08-11', to: '2026-08-13', days: 3 })
  })

  it('a gap breaks the range rather than spanning it', () => {
    // The Thursday in between was an ordinary day; saying otherwise is a claim
    // the data does not support.
    expect(contextRangesIn(week)[1]).toMatchObject({ from: '2026-08-16', to: '2026-08-16', days: 1 })
  })

  it('leaves one-day modes off the header — they belong on their own line', () => {
    expect(contextRangesIn(week).some((r) => r.mode === 'refeed')).toBe(false)
  })

  it('reads as a sentence', () => {
    expect(contextRangeLabel(contextRangesIn(week)[0])).toBe('Illness · 2026-08-11 → 2026-08-13 (3 days)')
    expect(contextRangeLine('illness', '2026-08-14', '2026-08-16')).toBe('Context: Illness since 2026-08-14 (3 days)')
    expect(contextRangeLine('normal', null, '2026-08-16')).toBeNull()
  })
})
