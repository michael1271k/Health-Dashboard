import { describe, it, expect } from 'vitest'
import { formatSessionForNotion, formatSetsAsBlocks } from '@/lib/notion/gym-log'
import type { SaveWorkoutPayload } from '@/lib/types/workout'

const mockPayload: SaveWorkoutPayload = {
  splitDay: 'push',
  startedAt: '2026-06-25T08:00:00.000Z',
  endedAt: '2026-06-25T09:30:00.000Z',
  notes: 'אימון מצוין היום',
  sets: [
    { exerciseId: 'abc', exerciseName: 'Bench Press', exerciseNameHe: 'לחיצת חזה',
      setNumber: 1, weightKg: 100, reps: 5 },
    { exerciseId: 'abc', exerciseName: 'Bench Press',
      setNumber: 2, weightKg: 100, reps: 5, rpe: 8 },
    { exerciseId: 'def', exerciseName: 'OHP',
      setNumber: 1, weightKg: 60, reps: 8 },
  ],
}

const EXPECTED_VOLUME = 100 * 5 + 100 * 5 + 60 * 8  // 1480

describe('formatSessionForNotion', () => {
  it('formats date from startedAt', () => {
    const props = formatSessionForNotion(mockPayload, 1480)
    expect(props.Date.date.start).toBe('2026-06-25')
  })

  it('capitalizes split label', () => {
    const props = formatSessionForNotion(mockPayload, 1480)
    expect(props.Split.select.name).toBe('Push')
  })

  it('rounds volume', () => {
    const props = formatSessionForNotion(mockPayload, 1480.7)
    expect(props.Volume.number).toBe(1481)
  })

  it('sets sets count correctly', () => {
    const props = formatSessionForNotion(mockPayload, 1480)
    expect(props.Sets.number).toBe(3)
  })

  it('includes Hebrew notes in rich_text', () => {
    const props = formatSessionForNotion(mockPayload, 1480)
    expect(props.Notes.rich_text[0]?.text.content).toBe('אימון מצוין היום')
  })

  it('returns empty rich_text when no notes', () => {
    const noNotes = { ...mockPayload, notes: '' }
    const props = formatSessionForNotion(noNotes, 0)
    expect(props.Notes.rich_text).toHaveLength(0)
  })
})

describe('formatSetsAsBlocks', () => {
  it('creates a heading for each unique exercise', () => {
    const blocks = formatSetsAsBlocks(mockPayload)
    const headings = blocks.filter((b) => b.type === 'heading_3')
    expect(headings).toHaveLength(2)  // Bench Press + OHP
  })

  it('creates bulleted list items for each set', () => {
    const blocks = formatSetsAsBlocks(mockPayload)
    const bullets = blocks.filter((b) => b.type === 'bulleted_list_item')
    expect(bullets).toHaveLength(3)  // 2 bench + 1 OHP
  })

  it('includes RPE when present', () => {
    const blocks = formatSetsAsBlocks(mockPayload)
    const bullets = blocks.filter((b) => b.type === 'bulleted_list_item')
    const set2Content = (bullets[1] as { type: 'bulleted_list_item'; bulleted_list_item: { rich_text: Array<{ text: { content: string } }> } })
      .bulleted_list_item.rich_text[0]?.text.content
    expect(set2Content).toContain('RPE 8')
  })

  it('omits RPE label when not present', () => {
    const blocks = formatSetsAsBlocks(mockPayload)
    const bullets = blocks.filter((b) => b.type === 'bulleted_list_item')
    const set1Content = (bullets[0] as { type: 'bulleted_list_item'; bulleted_list_item: { rich_text: Array<{ text: { content: string } }> } })
      .bulleted_list_item.rich_text[0]?.text.content
    expect(set1Content).not.toContain('RPE')
  })
})

describe('volume calculation', () => {
  it('sums weight × reps for all sets', () => {
    const total = mockPayload.sets.reduce((sum, s) => sum + s.weightKg * s.reps, 0)
    expect(total).toBe(EXPECTED_VOLUME)
  })
})
