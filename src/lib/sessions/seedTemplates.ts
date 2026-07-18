/**
 * Explicit per-set seed templates for the Command Center's empty state. Unlike
 * the wk1Kg model in programs.ts (one target per exercise), these carry the
 * exact per-set structure the user actually performs — including a cardio
 * warm-up. They are ONLY the fallback: when real history exists for an exercise,
 * useExerciseMemory overrides the numbers (see buildTemplateDraft). Names are the
 * canonical catalog names the sessions commit under, so memory resolves.
 */

export interface SeedSet { weightKg: number; reps: number }
export interface SeedExercise { name: string; muscles?: string[]; sets: SeedSet[] }
export interface SeedCardio { name: string; distanceKm?: number; durationSec?: number }
export interface SeedTemplate { cardio?: SeedCardio; exercises: SeedExercise[] }

const TREADMILL: SeedCardio = { name: 'Treadmill', distanceKm: 0.4, durationSec: 300 }

export const SEED_TEMPLATES: Record<string, SeedTemplate> = {
  cb_b: {
    cardio: TREADMILL,
    exercises: [
      { name: 'Chest Press (Machine)', muscles: ['chest', 'triceps'], sets: [{ weightKg: 35, reps: 12 }, { weightKg: 37.5, reps: 12 }, { weightKg: 37.5, reps: 12 }] },
      { name: 'Neutral-Grip Lat Pulldown', muscles: ['back'], sets: [{ weightKg: 45, reps: 12 }, { weightKg: 45, reps: 12 }] },
      { name: 'Seated Cable Row - Bar Wide Grip', muscles: ['back'], sets: [{ weightKg: 35, reps: 12 }, { weightKg: 35, reps: 12 }] },
      { name: 'Single Arm Cable Crossover', muscles: ['chest'], sets: [{ weightKg: 7.5, reps: 12 }, { weightKg: 7.5, reps: 15 }] },
      { name: 'Single Arm Lateral Raise (Cable)', muscles: ['shoulders'], sets: [{ weightKg: 3.75, reps: 16 }, { weightKg: 3.75, reps: 15 }, { weightKg: 2.5, reps: 20 }] },
      { name: 'Single Arm Triceps Pushdown (Cable)', muscles: ['triceps'], sets: [{ weightKg: 5, reps: 15 }, { weightKg: 6.25, reps: 14 }] },
      { name: 'Preacher Curl (Machine)', muscles: ['biceps'], sets: [{ weightKg: 15, reps: 12 }, { weightKg: 17.5, reps: 12 }, { weightKg: 17.5, reps: 10 }] },
    ],
  },
  legs_b: {
    cardio: TREADMILL,
    exercises: [
      { name: 'Romanian Deadlift (Dumbbell)', muscles: ['hamstrings', 'glutes', 'back'], sets: [{ weightKg: 30, reps: 12 }, { weightKg: 30, reps: 12 }, { weightKg: 30, reps: 12 }] },
      { name: 'Hip Thrust (Machine)', muscles: ['glutes'], sets: [{ weightKg: 25, reps: 14 }, { weightKg: 25, reps: 13 }, { weightKg: 25, reps: 12 }] },
      { name: 'Leg Press Horizontal', muscles: ['quads', 'glutes'], sets: [{ weightKg: 57.5, reps: 15 }, { weightKg: 70, reps: 12 }, { weightKg: 70, reps: 12 }] },
      { name: 'Seated Leg Curl', muscles: ['hamstrings'], sets: [{ weightKg: 45, reps: 15 }, { weightKg: 45, reps: 13 }] },
      { name: 'Calf Press', muscles: ['calves'], sets: [{ weightKg: 65, reps: 15 }, { weightKg: 67.5, reps: 14 }, { weightKg: 67.5, reps: 13 }] },
      // Bodyweight / timed moves seed at 0 kg (reps = the count / seconds held).
      { name: 'Hanging Knee Raise', muscles: ['core'], sets: [{ weightKg: 0, reps: 16 }, { weightKg: 0, reps: 15 }, { weightKg: 0, reps: 12 }] },
      { name: 'Side Plank', muscles: ['core'], sets: [{ weightKg: 0, reps: 55 }, { weightKg: 0, reps: 52 }] },
    ],
  },
}
