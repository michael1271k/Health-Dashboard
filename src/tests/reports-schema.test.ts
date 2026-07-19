import { describe, it, expect } from 'vitest'
import { repairReportPayload } from '@/lib/hooks/useReports'

/**
 * The tab-switch crash was `r.payload.sessions` on a null/legacy JSONB payload.
 * repairReportPayload guarantees a well-formed ReportPayload for any input, so
 * the Progression / Journey render can never throw.
 */
describe('repairReportPayload', () => {
  it('repairs a null payload to zeroed stats (was the crash)', () => {
    const p = repairReportPayload(null)
    expect(p.sessions).toBe(0)
    expect(p.volumeKg).toBe(0)
    expect(p.days).toEqual([])
    expect(p.weightDelta).toBeNull()
  })

  it('repairs a legacy Shape-B object (no payload keys) to zeros', () => {
    const p = repairReportPayload({ period_start: '2026-07-12', content_md: '## Report' })
    expect(p.sessions).toBe(0)
    expect(p.days).toEqual([])
  })

  it('passes a well-formed payload through, keeping day splits', () => {
    const raw = {
      volumeKg: 12400, sets: 96, prs: 3, calories: 1955, durationMin: 315, sessions: 5,
      weightDelta: -0.6, fatDelta: -0.2,
      days: [{ date: '2026-07-13', label: 'Push', volumeKg: 2400, prs: 1, split: 'push' }],
    }
    const p = repairReportPayload(raw)
    expect(p.volumeKg).toBe(12400)
    expect(p.prs).toBe(3)
    expect(p.weightDelta).toBe(-0.6)
    expect(p.days[0].split).toBe('push')
  })

  it('coerces non-finite / wrong-typed numbers to safe defaults', () => {
    const p = repairReportPayload({ volumeKg: 'nope', sessions: NaN, prs: null, days: 'bad' })
    expect(p.volumeKg).toBe(0)
    expect(p.sessions).toBe(0)
    expect(p.prs).toBe(0)
    expect(p.days).toEqual([])
  })
})
