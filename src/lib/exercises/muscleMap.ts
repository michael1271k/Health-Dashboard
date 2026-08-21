/**
 * The authoritative primary+secondary muscle tags per exercise — the source of
 * truth for the Freshness Map, Muscle Analytics, the weekly MEV/MAV accumulator,
 * the per-muscle tonnage breakdown and the markdown export.
 *
 * Matched by order-independent keyword tokens so naming variants ("Neutral-Grip
 * Lat Pulldown" ↔ "lat pulldown neutral grip", "(Cable)" tags) all resolve.
 *
 * PRIMARY vs SECONDARY IS A REAL DISTINCTION, NOT A RANKING. A primary mover is
 * the muscle the movement is chosen to train; a secondary is one that genuinely
 * contributes force but under a shorter range, a worse leverage or a lighter
 * relative load. Both earn credit — see SECONDARY_SET_CREDIT in
 * training/landmarks.ts for how much, and why it is not 100%.
 *
 * EVERY exercise in the live catalogue has an entry here. The fallback to
 * `exercises.muscle_groups` still exists for a row created outside the app, but
 * nothing in the catalogue depends on it any more: the DB column was seeded from
 * this file and has drifted since (Face Pull was still tagged `shoulders, biceps`
 * there, which folds to SIDE delts and biceps — neither of which a face pull
 * trains). The name is the key; the column is a cache.
 */
export interface MuscleEntry { primary: string[]; secondary: string[] }

/**
 * Keyed by a canonical keyword phrase; ALL tokens must appear in the name, and
 * the longest matching phrase wins. Order within the array does not matter.
 */
const DICT: Array<{ tokens: string[]; muscles: MuscleEntry }> = [
  // ── Quads ───────────────────────────────────────────────────────────────────
  // ── ADDUCTORS AND FOREARMS WERE MISSING, AND IT SHOWED ────────────────────
  // Reconciled against Hevy's own breakdown for a real session: a leg press
  // spreads the stance wide enough to load the adductors, and a dumbbell RDL is
  // held for its whole set — the grip is a real secondary, which is why every
  // other database lists it. Both were absent here, so the weekly totals for
  // two muscles read zero on days that trained them.
  { tokens: ['leg', 'press', 'horizontal'], muscles: { primary: ['quadriceps'], secondary: ['glutes', 'hamstrings', 'adductors'] } },
  { tokens: ['leg', 'press'], muscles: { primary: ['quadriceps'], secondary: ['glutes', 'hamstrings', 'adductors'] } },
  { tokens: ['hack', 'squat'], muscles: { primary: ['quadriceps'], secondary: ['glutes', 'hamstrings'] } },
  { tokens: ['leg', 'extension'], muscles: { primary: ['quadriceps'], secondary: [] } },

  // ── Posterior chain ─────────────────────────────────────────────────────────
  // The calf is a secondary on a leg curl through the gastrocnemius, which
  // crosses the knee — it is a real contributor, not a courtesy tag.
  { tokens: ['seated', 'leg', 'curl'], muscles: { primary: ['hamstrings'], secondary: ['calves'] } },
  { tokens: ['leg', 'curl'], muscles: { primary: ['hamstrings'], secondary: ['calves'] } },
  { tokens: ['romanian', 'deadlift'], muscles: { primary: ['hamstrings'], secondary: ['glutes', 'lower back', 'upper back', 'lats', 'forearms'] } },
  { tokens: ['rdl'], muscles: { primary: ['hamstrings'], secondary: ['glutes', 'lower back', 'upper back', 'lats', 'forearms'] } },
  { tokens: ['hip', 'thrust'], muscles: { primary: ['glutes'], secondary: ['hamstrings', 'quadriceps'] } },
  // Hip adduction was invisible to the accumulator TWICE OVER: no dictionary
  // entry, and the DB tagged the machine variant `inner_thigh`, a token
  // toLandmarkMuscle did not know. The Adductors target could never be met
  // because nothing on earth credited it.
  { tokens: ['hip', 'adduction'], muscles: { primary: ['adductors'], secondary: [] } },
  { tokens: ['adductor'], muscles: { primary: ['adductors'], secondary: [] } },

  // ── Calves ──────────────────────────────────────────────────────────────────
  { tokens: ['calf', 'press'], muscles: { primary: ['calves'], secondary: [] } },
  { tokens: ['calf', 'raise'], muscles: { primary: ['calves'], secondary: [] } },

  // ── Abs / core ──────────────────────────────────────────────────────────────
  { tokens: ['crunch'], muscles: { primary: ['abdominals'], secondary: [] } },
  { tokens: ['reverse', 'crunch'], muscles: { primary: ['abdominals'], secondary: [] } },
  { tokens: ['bicycle', 'crunch'], muscles: { primary: ['abdominals'], secondary: ['obliques'] } },
  { tokens: ['hanging', 'knee', 'raise'], muscles: { primary: ['abdominals'], secondary: [] } },
  { tokens: ['leg', 'raise'], muscles: { primary: ['abdominals'], secondary: [] } },
  { tokens: ['hollow', 'rock'], muscles: { primary: ['abdominals'], secondary: [] } },
  { tokens: ['russian', 'twist'], muscles: { primary: ['obliques'], secondary: ['abdominals'] } },
  { tokens: ['side', 'plank'], muscles: { primary: ['obliques'], secondary: ['abdominals'] } },

  // ── Chest ───────────────────────────────────────────────────────────────────
  { tokens: ['incline', 'bench', 'press', 'dumbbell'], muscles: { primary: ['chest'], secondary: ['triceps', 'front_delts'] } },
  { tokens: ['incline', 'db', 'press'], muscles: { primary: ['chest'], secondary: ['triceps', 'front_delts'] } },
  { tokens: ['chest', 'press'], muscles: { primary: ['chest'], secondary: ['triceps', 'front_delts'] } },
  // A FLY IS NOT A TRICEPS MOVEMENT. The elbow angle is fixed, so the triceps
  // never shorten under load; tagging pec deck and crossovers `triceps` (as this
  // file and the DB both did) credited an isolation movement to a muscle that
  // does no work in it, and inflated the weekly triceps count with sets that
  // never touched them.
  { tokens: ['pec', 'deck'], muscles: { primary: ['chest'], secondary: ['front_delts'] } },
  { tokens: ['butterfly'], muscles: { primary: ['chest'], secondary: ['front_delts'] } },
  { tokens: ['cable', 'crossover'], muscles: { primary: ['chest'], secondary: ['front_delts'] } },
  { tokens: ['cable', 'fly'], muscles: { primary: ['chest'], secondary: ['front_delts'] } },

  // ── Back ────────────────────────────────────────────────────────────────────
  { tokens: ['lat', 'pulldown'], muscles: { primary: ['lats'], secondary: ['upper back', 'biceps', 'forearms'] } },
  { tokens: ['lat', 'pulldown', 'neutral'], muscles: { primary: ['lats'], secondary: ['upper back', 'biceps', 'forearms'] } },
  { tokens: ['lat', 'pulldown', 'close'], muscles: { primary: ['lats'], secondary: ['upper back', 'biceps', 'forearms'] } },
  // A row's rear delt involvement is real and load-bearing (horizontal
  // abduction against the cable), unlike a pulldown's, which is incidental.
  { tokens: ['cable', 'row'], muscles: { primary: ['upper back'], secondary: ['lats', 'traps', 'rear_delts', 'biceps', 'forearms'] } },
  { tokens: ['seated', 'cable', 'row', 'wide'], muscles: { primary: ['upper back'], secondary: ['lats', 'traps', 'rear_delts', 'biceps', 'forearms'] } },
  { tokens: ['seated', 'cable', 'row', 'v'], muscles: { primary: ['upper back'], secondary: ['lats', 'biceps', 'forearms'] } },
  // Elbows locked, shoulder extension only — the long head of the triceps does
  // cross the shoulder, so it earns a secondary here where a fly does not.
  { tokens: ['straight', 'arm', 'pulldown'], muscles: { primary: ['lats'], secondary: ['triceps', 'upper back'] } },

  // ── Delts ───────────────────────────────────────────────────────────────────
  // Deltoid work is NOT interchangeable for volume accounting. A bare 'shoulders'
  // primary folded everything (press + face pull + lateral raise) into Side delts
  // via toLandmarkMuscle, so overhead press and rear-delt face pulls inflated the
  // side-delt count. Route each head to its real primary instead.
  { tokens: ['face', 'pull'], muscles: { primary: ['rear_delts'], secondary: ['upper back', 'traps'] } },
  // `Shoulder Press (DB)` used to resolve to NOTHING: the parenthesis was
  // stripped before matching, so `['db','shoulder','press']` could not fire, and
  // the fallback `muscle_groups[0]` was a bare 'shoulders' that folded to SIDE
  // delts — the exact mis-credit the split above exists to prevent. One bare
  // `['shoulder','press']` entry catches every spelling.
  { tokens: ['shoulder', 'press'], muscles: { primary: ['front_delts'], secondary: ['side_delts', 'triceps'] } },
  { tokens: ['lateral', 'raise'], muscles: { primary: ['side_delts'], secondary: [] } },

  // ── Triceps ─────────────────────────────────────────────────────────────────
  { tokens: ['triceps', 'pushdown'], muscles: { primary: ['triceps'], secondary: [] } },
  { tokens: ['triceps', 'extension'], muscles: { primary: ['triceps'], secondary: [] } },
  { tokens: ['overhead', 'extension'], muscles: { primary: ['triceps'], secondary: [] } },
  { tokens: ['overhead', 'triceps'], muscles: { primary: ['triceps'], secondary: [] } },
  { tokens: ['cable', 'extension'], muscles: { primary: ['triceps'], secondary: [] } },

  // ── Biceps / forearms ───────────────────────────────────────────────────────
  { tokens: ['hammer', 'curl'], muscles: { primary: ['biceps'], secondary: ['forearms'] } },
  { tokens: ['neutral', 'grip', 'curl'], muscles: { primary: ['biceps'], secondary: ['forearms'] } },
  // Reverse (pronated) curl is a brachioradialis/forearm movement — the program
  // itself tags it forearms-first. muscleMap said biceps, so 2 forearm sets/week
  // were mis-credited to biceps.
  { tokens: ['reverse', 'curl'], muscles: { primary: ['forearms'], secondary: ['biceps'] } },
  { tokens: ['wrist', 'curl'], muscles: { primary: ['forearms'], secondary: [] } },
  { tokens: ['preacher', 'curl'], muscles: { primary: ['biceps'], secondary: [] } },
  { tokens: ['incline', 'curl'], muscles: { primary: ['biceps'], secondary: [] } },
  { tokens: ['bicep', 'curl'], muscles: { primary: ['biceps'], secondary: [] } },
  { tokens: ['biceps', 'curl'], muscles: { primary: ['biceps'], secondary: [] } },
]

/**
 * Split a name into match tokens.
 *
 * PARENTHESES ARE SEPARATORS, NOT DELETIONS. They used to be stripped along with
 * their contents, which silently voided every entry whose distinguishing word
 * lived inside one: `Seated Cable Row (V-Grip)` and `(Wide Grip)` both fell
 * through to the generic row entry, `Shoulder Press (DB)` matched nothing at
 * all, and `Crunch (Machine)` behaved differently from `Crunch Machine`. The
 * grip, the implement and the machine are exactly the words that distinguish two
 * movements sharing a stem.
 */
function tokenize(name: string): Set<string> {
  return new Set(name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/))
}

/**
 * Resolve an exercise name → its muscle tags using the most-specific dictionary
 * entry whose tokens are all present. null = unknown.
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

/**
 * Primary and secondary movers for an exercise, resolved by NAME first and
 * falling back to the stored `muscle_groups` column.
 *
 * The one place every aggregator should go. The fallback split is
 * `[0]` = primary, rest = secondary, which is how `muscleGroupsFor` writes the
 * column — but the column is only reached for a row this dictionary has never
 * seen, and every exercise in the live catalogue has an entry.
 */
export function resolveMovers(
  name: string,
  stored?: readonly string[] | null,
): MuscleEntry {
  const entry = lookupMuscles(name)
  if (entry) return entry
  const tags = stored ?? []
  return { primary: tags.slice(0, 1), secondary: tags.slice(1) }
}
