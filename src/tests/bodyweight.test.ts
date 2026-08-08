import { describe, it, expect } from 'vitest'
import { isBodyweightExercise, isUnloadedExercise } from '@/lib/exercises/bodyweight'

/**
 * The three movements that actually carry weight_kg = 0 across the whole
 * history (Hanging Knee Raise, Reverse Crunch, Side Plank) plus the loaded
 * lookalikes that must NOT be caught with them.
 */
describe('isBodyweightExercise', () => {
  it('flags the reps-only core work that logs at 0 kg', () => {
    expect(isBodyweightExercise('Hanging Knee Raise')).toBe(true)
    expect(isBodyweightExercise('Reverse Crunch')).toBe(true)
    expect(isBodyweightExercise('Leg Raise')).toBe(true)
    expect(isBodyweightExercise('Pull-Up')).toBe(true)
    expect(isBodyweightExercise('Push Ups')).toBe(true)
  })

  it('does NOT flag a loaded machine that shares the movement word', () => {
    // The one that would silently hide a 52.5 kg stack.
    expect(isBodyweightExercise('Crunch Machine')).toBe(false)
    expect(isBodyweightExercise('Assisted Pull-Up (Machine)')).toBe(false)
    expect(isBodyweightExercise('Cable Crunch')).toBe(false)
    expect(isBodyweightExercise('DB Sit-Up')).toBe(false)
  })

  it('does not confuse a lateral/front raise for a leg raise', () => {
    expect(isBodyweightExercise('Lateral Raise')).toBe(false)
    expect(isBodyweightExercise('Front Raise')).toBe(false)
    expect(isBodyweightExercise('Calf Raise')).toBe(false)
  })

  it('is null-safe', () => {
    expect(isBodyweightExercise(null)).toBe(false)
    expect(isBodyweightExercise('')).toBe(false)
  })

  it('leaves timed holds to isTimedExercise, and unions them in isUnloaded', () => {
    expect(isBodyweightExercise('Side Plank')).toBe(false)
    expect(isUnloadedExercise('Side Plank')).toBe(true)
    expect(isUnloadedExercise('Hanging Knee Raise')).toBe(true)
    expect(isUnloadedExercise('Leg Press')).toBe(false)
  })
})
