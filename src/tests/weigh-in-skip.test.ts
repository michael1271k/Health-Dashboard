import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WEIGH_IN_SKIP_REASON, WEIGH_IN_SKIP_REASONS,
  weighInSkipReason, isDefaultSkipReason,
} from '@/lib/body/weighIn'

/**
 * ONE vocabulary, ONE fallback, shared by the writer (BodyPanel) and the reader
 * (weeklyExport). The export must never hardcode a reason of its own — change a
 * day to "Travel" and the export says Travel, with no second place to edit.
 */
describe('weigh-in skip reasons', () => {
  it('defaults an unrecorded day to the protocol, not to "unknown"', () => {
    expect(weighInSkipReason(null)).toBe('As Planned')
    expect(weighInSkipReason(undefined)).toBe('As Planned')
    expect(weighInSkipReason('')).toBe('As Planned')
    // Whitespace is not a reason; printing it produces "[Skip: ]".
    expect(weighInSkipReason('   ')).toBe('As Planned')
  })

  it('reads a recorded reason straight back, trimmed', () => {
    expect(weighInSkipReason('Travel')).toBe('Travel')
    expect(weighInSkipReason('  No BM ')).toBe('No BM')
    // Anything at all — the column is free text so the vocabulary grows
    // without DDL.
    expect(weighInSkipReason('Scale battery died')).toBe('Scale battery died')
  })

  it('leads the chip row with the default', () => {
    expect(WEIGH_IN_SKIP_REASONS[0]).toBe(DEFAULT_WEIGH_IN_SKIP_REASON)
    expect(new Set(WEIGH_IN_SKIP_REASONS).size).toBe(WEIGH_IN_SKIP_REASONS.length)
  })

  it('treats "nothing stored" and "stored as the default" as the same day', () => {
    expect(isDefaultSkipReason(null)).toBe(true)
    expect(isDefaultSkipReason('As Planned')).toBe(true)
    expect(isDefaultSkipReason('Sick')).toBe(false)
  })
})
