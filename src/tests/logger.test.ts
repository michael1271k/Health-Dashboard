import { describe, it, expect } from 'vitest'
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

describe('volume calculation', () => {
  it('sums weight × reps for all sets', () => {
    const total = mockPayload.sets.reduce((sum, s) => sum + s.weightKg * s.reps, 0)
    expect(total).toBe(EXPECTED_VOLUME)
  })
})
