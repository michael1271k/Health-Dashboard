import { describe, it, expect } from 'vitest'
import { isUnilateralExercise } from '@/lib/exercises/unilateral'

describe('isUnilateralExercise', () => {
  it('matches every unilateral name in the program catalog', () => {
    for (const name of [
      'Single Arm Cable Crossover',
      'Single Arm Lateral Raise (Cable)',
      'Single Arm Triceps Pushdown (Cable)',
    ]) {
      expect(isUnilateralExercise(name), name).toBe(true)
    }
  })

  it('accepts the spellings a free-typed name actually uses', () => {
    for (const name of [
      'single arm cable lateral raise',
      'Single-Arm DB Row',
      'One Arm Row',
      'One-Legged Leg Press',
      '1-Arm Lat Pulldown',
      'Unilateral Leg Extension',
      'DB Row (per side)',
      'Cable Curl each arm',
    ]) {
      expect(isUnilateralExercise(name), name).toBe(true)
    }
  })

  it('matches the movements that are unilateral without saying so', () => {
    for (const name of [
      'Bulgarian Split Squat',
      'Split Squat',
      'Walking Lunge',
      'Reverse Lunges',
      'Step-Up',
      'Step Ups',
      'Pistol Squat',
      'Copenhagen Plank',
      'Suitcase Carry',
      'Side Plank',
    ]) {
      expect(isUnilateralExercise(name), name).toBe(true)
    }
  })

  it('rejects the bilateral catalog — splitting these halves the session', () => {
    for (const name of [
      'Incline DB Press',
      'DB Shoulder Press',
      'Lateral Raise DB',
      'Chest Press (Machine)',
      'Leg Press',
      'Seated Leg Curl',
      'Lat Pulldown',
      'Neutral-Grip Lat Pulldown',
      'Seated Cable Row (V-Grip)',
      'Hip Thrust',
      'Romanian Deadlift (Dumbbell)',
      'Rope Triceps Pushdown',
      'Hanging Knee Raise',
      'Reverse Crunch',
      'Hollow Rock',
      'Face Pull',
      'Hack Squat',
      'Preacher Curl',
    ]) {
      expect(isUnilateralExercise(name), name).toBe(false)
    }
  })

  it('lets an explicit "double" override a tell-tale', () => {
    expect(isUnilateralExercise('Double Arm Cable Row')).toBe(false)
    expect(isUnilateralExercise('Two-Arm Kettlebell Swing')).toBe(false)
  })

  it('an alternating lift is NOT a pair — one set, N total reps', () => {
    expect(isUnilateralExercise('Alternating DB Curl')).toBe(false)
  })

  it('is safe on empty input', () => {
    expect(isUnilateralExercise(null)).toBe(false)
    expect(isUnilateralExercise(undefined)).toBe(false)
    expect(isUnilateralExercise('   ')).toBe(false)
  })
})
