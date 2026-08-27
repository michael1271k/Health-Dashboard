import { describe, it, expect } from 'vitest'
import { sessionElapsedSec, elapsedDurationMin, MAX_SESSION_SEC } from '@/lib/sessions/sessionElapsed'
import { isWorkingSet, setComposition, setTagFor } from '@/lib/training/setTags'
import { isPrIneligible } from '@/lib/training/prEngine'

/**
 * Total session time is DERIVED from the draft's own `startedAt`, so the two
 * things that can go wrong are both about that timestamp being something other
 * than "when this workout began": a back-dated log rewrites the date and keeps
 * the time of day, and an edit deck seeds it from the stored row.
 *
 * In both cases `now − startedAt` is days. The bug this guards against is the
 * Finish sheet cheerfully pre-filling Duration with 4,317 minutes.
 */
describe('session elapsed', () => {
  const now = Date.parse('2026-08-27T11:00:00Z')

  it('measures a live session', () => {
    expect(sessionElapsedSec('2026-08-27T10:00:00Z', now)).toBe(3600)
  })

  it('refuses a back-dated draft rather than reporting days', () => {
    // `setDate` keeps the time of day, so a session logged for last Thursday has
    // a startedAt six days old.
    expect(sessionElapsedSec('2026-08-21T10:00:00Z', now)).toBeNull()
  })

  it('refuses a start in the future', () => {
    expect(sessionElapsedSec('2026-08-27T12:00:00Z', now)).toBeNull()
  })

  it('holds right up to the bound and refuses past it', () => {
    const at = (sec: number) => new Date(now - sec * 1000).toISOString()
    expect(sessionElapsedSec(at(MAX_SESSION_SEC), now)).toBe(MAX_SESSION_SEC)
    expect(sessionElapsedSec(at(MAX_SESSION_SEC + 1), now)).toBeNull()
  })

  it('refuses nothing and nonsense', () => {
    expect(sessionElapsedSec(null, now)).toBeNull()
    expect(sessionElapsedSec(undefined, now)).toBeNull()
    expect(sessionElapsedSec('not a date', now)).toBeNull()
  })

  it('rounds to whole minutes rather than flooring them', () => {
    // 61:40 is a 62-minute session. Flooring would under-report every workout
    // by up to a minute, systematically, for no reason anyone could name.
    expect(elapsedDurationMin(61 * 60 + 40)).toBe(62)
    expect(elapsedDurationMin(61 * 60 + 20)).toBe(61)
  })

  it('declines to claim a workout took no time', () => {
    // 0 is a real value in `duration_min` — it would be stored, and it would
    // then be averaged into the routine's own duration seed.
    expect(elapsedDurationMin(20)).toBeNull()
    expect(elapsedDurationMin(0)).toBeNull()
    expect(elapsedDurationMin(null)).toBeNull()
    expect(elapsedDurationMin(31)).toBe(1)
  })
})

/**
 * ── A GHOST SET COUNTS FOR NOTHING, IN BOTH DIRECTIONS ───────────────────────
 *
 * The tag exists so a set that happened but should not count can be recorded as
 * itself, instead of being called a warm-up — which was the only option and
 * which then dragged the routine's warm-up count and the export's composition
 * string with it.
 *
 * The two exclusions have to hold TOGETHER. A ghost that is PR-ineligible but
 * still a working set would silently become a baseline, and the coach would
 * pace you against a set you explicitly said did not count.
 */
describe('ghost sets', () => {
  it('is not a working set, and neither is a warm-up', () => {
    expect(isWorkingSet('ghost')).toBe(false)
    expect(isWorkingSet('warmup')).toBe(false)
  })

  it('leaves the tags that DO count alone', () => {
    expect(isWorkingSet('normal')).toBe(true)
    expect(isWorkingSet('failure')).toBe(true)
    expect(isWorkingSet('dropset')).toBe(true)
    expect(isWorkingSet(null)).toBe(true)
    expect(isWorkingSet(undefined)).toBe(true)
  })

  it('can never claim a record', () => {
    expect(isPrIneligible('ghost')).toBe(true)
  })

  it('is excluded on BOTH sides — no baseline and no record', () => {
    // The pair that makes the tag mean what it says. A ghost that failed only
    // one of these would be a set that cannot win but can still set the bar.
    expect(isWorkingSet('ghost')).toBe(false)
    expect(isPrIneligible('ghost')).toBe(true)
    // A drop set is the deliberate contrast: it counts as work (its tonnage is
    // real) but it never takes a top-set record.
    expect(isWorkingSet('dropset')).toBe(true)
    expect(isPrIneligible('dropset')).toBe(true)
  })

  it('has a letter of its own, so the export stops calling it a warm-up', () => {
    expect(setTagFor('ghost')?.label).toBe('G')
    expect(setComposition({ warmup: 2, ghost: 1 }).map((t) => t.label)).toEqual(['W', 'G'])
  })
})
