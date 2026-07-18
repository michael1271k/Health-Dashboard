/**
 * Muscle Freshness dictionary — the authoritative primary+secondary muscle tags
 * per exercise (drives the Freshness Map + Muscle Analytics). Matched by
 * order-independent keyword tokens so naming variants ("Neutral-Grip Lat
 * Pulldown" ↔ "lat pulldown neutral grip", "(Cable)" tags) all resolve.
 */
export interface MuscleEntry { primary: string[]; secondary: string[] }

/** Keyed by a canonical keyword phrase; all tokens must appear in the name. */
const DICT: Array<{ tokens: string[]; muscles: MuscleEntry }> = [
  { tokens: ['leg', 'press', 'horizontal'], muscles: { primary: ['quadriceps'], secondary: ['hamstrings', 'glutes'] } },
  { tokens: ['hack', 'squat'], muscles: { primary: ['quadriceps'], secondary: ['glutes', 'hamstrings'] } },
  { tokens: ['leg', 'extension'], muscles: { primary: ['quadriceps'], secondary: [] } },
  { tokens: ['seated', 'leg', 'curl'], muscles: { primary: ['hamstrings'], secondary: ['calves'] } },
  { tokens: ['leg', 'curl'], muscles: { primary: ['hamstrings'], secondary: ['calves'] } },
  { tokens: ['calf', 'press'], muscles: { primary: ['calves'], secondary: [] } },
  { tokens: ['crunch', 'machine'], muscles: { primary: ['abdominals'], secondary: [] } },
  { tokens: ['reverse', 'crunch'], muscles: { primary: ['abdominals'], secondary: [] } },
  { tokens: ['incline', 'bench', 'press', 'dumbbell'], muscles: { primary: ['chest'], secondary: ['triceps', 'shoulders'] } },
  { tokens: ['incline', 'db', 'press'], muscles: { primary: ['chest'], secondary: ['triceps', 'shoulders'] } },
  { tokens: ['lat', 'pulldown', 'neutral'], muscles: { primary: ['lats'], secondary: ['upper back', 'biceps'] } },
  { tokens: ['lat', 'pulldown', 'close'], muscles: { primary: ['lats'], secondary: ['upper back', 'biceps'] } },
  { tokens: ['lat', 'pulldown'], muscles: { primary: ['lats'], secondary: ['upper back', 'biceps', 'forearms'] } },
  { tokens: ['seated', 'cable', 'row', 'wide'], muscles: { primary: ['upper back'], secondary: ['lats', 'traps', 'biceps', 'forearms'] } },
  { tokens: ['seated', 'cable', 'row', 'v'], muscles: { primary: ['upper back'], secondary: ['lats', 'biceps', 'forearms'] } },
  { tokens: ['seated', 'cable', 'row'], muscles: { primary: ['upper back'], secondary: ['lats', 'biceps', 'forearms'] } },
  { tokens: ['chest', 'press'], muscles: { primary: ['chest'], secondary: ['shoulders', 'triceps'] } },
  { tokens: ['butterfly'], muscles: { primary: ['chest'], secondary: ['shoulders', 'triceps'] } },
  { tokens: ['pec', 'deck'], muscles: { primary: ['chest'], secondary: ['shoulders', 'triceps'] } },
  { tokens: ['straight', 'arm', 'pulldown'], muscles: { primary: ['lats'], secondary: ['triceps'] } },
  { tokens: ['face', 'pull'], muscles: { primary: ['shoulders'], secondary: ['biceps'] } },
  { tokens: ['shoulder', 'press', 'dumbbell'], muscles: { primary: ['shoulders'], secondary: ['triceps'] } },
  { tokens: ['db', 'shoulder', 'press'], muscles: { primary: ['shoulders'], secondary: ['triceps'] } },
  { tokens: ['incline', 'curl'], muscles: { primary: ['biceps'], secondary: [] } },
  { tokens: ['lateral', 'raise'], muscles: { primary: ['shoulders'], secondary: [] } },
  { tokens: ['overhead', 'triceps'], muscles: { primary: ['triceps'], secondary: [] } },
  { tokens: ['triceps', 'pushdown'], muscles: { primary: ['triceps'], secondary: [] } },
  { tokens: ['triceps', 'extension'], muscles: { primary: ['triceps'], secondary: [] } },
  { tokens: ['hammer', 'curl'], muscles: { primary: ['biceps'], secondary: ['forearms'] } },
  { tokens: ['reverse', 'curl'], muscles: { primary: ['biceps'], secondary: ['forearms'] } },
  { tokens: ['single', 'arm', 'cable', 'crossover'], muscles: { primary: ['chest'], secondary: [] } },
  { tokens: ['cable', 'crossover'], muscles: { primary: ['chest'], secondary: [] } },
  { tokens: ['cable', 'fly'], muscles: { primary: ['chest'], secondary: [] } },
  { tokens: ['preacher', 'curl'], muscles: { primary: ['biceps'], secondary: [] } },
  { tokens: ['romanian', 'deadlift'], muscles: { primary: ['hamstrings'], secondary: ['glutes', 'lower back', 'upper back', 'lats'] } },
  { tokens: ['rdl'], muscles: { primary: ['hamstrings'], secondary: ['glutes', 'lower back', 'upper back', 'lats'] } },
  { tokens: ['hip', 'thrust'], muscles: { primary: ['glutes'], secondary: ['hamstrings', 'quadriceps', 'abductors'] } },
  { tokens: ['hanging', 'knee', 'raise'], muscles: { primary: ['abdominals'], secondary: [] } },
  { tokens: ['side', 'plank'], muscles: { primary: ['abdominals'], secondary: [] } },
]

function tokenize(name: string): Set<string> {
  return new Set(name.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/))
}

/**
 * Resolve an exercise name → its muscle tags (primary + secondary, flat) using
 * the most-specific dictionary entry whose tokens are all present. null = unknown.
 */
export function lookupMuscles(name: string): MuscleEntry | null {
  const nameTokens = tokenize(name)
  let best: { entry: MuscleEntry; specificity: number } | null = null
  for (const { tokens, muscles } of DICT) {
    if (tokens.every((t) => nameTokens.has(t))) {
      if (!best || tokens.length > best.specificity) best = { entry: muscles, specificity: tokens.length }
    }
  }
  return best?.entry ?? null
}

/** Flat muscle tags (primary first) for `exercises.muscle_groups`, or null. */
export function muscleGroupsFor(name: string): string[] | null {
  const e = lookupMuscles(name)
  return e ? [...e.primary, ...e.secondary] : null
}
