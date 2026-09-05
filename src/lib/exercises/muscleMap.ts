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
 *
 * EXPORTED for the golden vectors only. This is a table, not a formula, so the
 * only honest way to hold the Swift port to it is to ship the table itself and
 * assert the two are equal entry for entry — a hand-transcribed copy in the
 * test file would be the same "typed in twice" failure the vectors exist to
 * catch. Nothing in the app reads it; go through `lookupMuscles`.
 *
 * ORDER IS PART OF THE DATA. `lookupMuscles` only replaces its best match on a
 * STRICTLY longer token list, so of two entries with the same specificity the
 * FIRST one here wins — `['overhead','extension']` beats `['cable','extension']`
 * for "Cable Overhead Extension" because it is written above it.
 */
export const MUSCLE_DICT: Array<{ tokens: string[]; muscles: MuscleEntry }> = [
  // ── Quads ───────────────────────────────────────────────────────────────────
  // ── ADDUCTORS AND FOREARMS WERE MISSING, AND IT SHOWED ────────────────────
  // Reconciled against Hevy's own breakdown for a real session: a leg press
  // spreads the stance wide enough to load the adductors, and a dumbbell RDL is
  // held for its whole set — the grip is a real secondary, which is why every
  // other database lists it. Both were absent here, so the weekly totals for
  // two muscles read zero on days that trained them.
  // ── THE ADDUCTORS ARE THE HIP THRUST'S, NOT THE LEG PRESS'S ───────────────
  // They were put here on the reasoning that a leg press spreads the stance
  // wide enough to load them, and the arithmetic seemed to agree — one session
  // with three leg-press sets produced Hevy's Adductors 1.5 exactly. It was a
  // coincidence of set counts. Across the whole week the same rule pays 3.5
  // against Hevy's 1.5, and Hevy's own leg-press definition lists only
  // hamstrings and glutes. A machine leg press fixes the feet; there is no
  // adduction moment to resist.
  //
  // The hip thrust is where that credit belongs, and 0.5 × 3 sets is Hevy's
  // 1.5 to the decimal. The adductor magnus is a primary hip extensor — in a
  // thrust it is doing the same job as the glute, which is exactly what a
  // secondary tag is for.
  { tokens: ['leg', 'press', 'horizontal'], muscles: { primary: ['quadriceps'], secondary: ['glutes', 'hamstrings'] } },
  { tokens: ['leg', 'press'], muscles: { primary: ['quadriceps'], secondary: ['glutes', 'hamstrings'] } },
  { tokens: ['hack', 'squat'], muscles: { primary: ['quadriceps'], secondary: ['glutes', 'hamstrings'] } },
  { tokens: ['leg', 'extension'], muscles: { primary: ['quadriceps'], secondary: [] } },

  // ── Posterior chain ─────────────────────────────────────────────────────────
  // The calf is a secondary on a leg curl through the gastrocnemius, which
  // crosses the knee — it is a real contributor, not a courtesy tag.
  { tokens: ['seated', 'leg', 'curl'], muscles: { primary: ['hamstrings'], secondary: ['calves'] } },
  { tokens: ['leg', 'curl'], muscles: { primary: ['hamstrings'], secondary: ['calves'] } },
  // `upper back` is BACK, and it was removed in error. Hevy's own definition
  // lists it, and dropping it only appeared to fix the weekly Upper back total
  // because the straight-arm pulldown was over-counting there by the same 1.5.
  // Two wrongs summing to the right answer is the worst kind of green.
  //
  // `forearms` stays despite not appearing in Hevy's displayed "other muscles"
  // list, because Hevy's own NUMBERS say it is there: the 2026-08-21 session
  // has exactly one grip-loaded movement, this one, and Hevy reported Forearms
  // 1.5 for it — which is 0.5 × 3 sets of dumbbell RDL and cannot be anything
  // else. The displayed list is abbreviated; the arithmetic is not.
  { tokens: ['romanian', 'deadlift'], muscles: { primary: ['hamstrings'], secondary: ['glutes', 'lower back', 'upper back', 'lats', 'forearms'] } },
  { tokens: ['rdl'], muscles: { primary: ['hamstrings'], secondary: ['glutes', 'lower back', 'upper back', 'lats', 'forearms'] } },
  { tokens: ['hip', 'thrust'], muscles: { primary: ['glutes'], secondary: ['hamstrings', 'quadriceps', 'adductors'] } },
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
  //
  // ── AND IT IS NOT A FRONT-DELT MOVEMENT EITHER ────────────────────────────
  // The same argument, one joint over, and it took a second pass to see it. A
  // fly is a single-joint movement about the SHOULDER, so unlike the triceps
  // the anterior deltoid genuinely does shorten — which is why the secondary
  // looked defensible and survived a reconciliation that removed the triceps.
  //
  // What settled it was the arithmetic across a full week rather than one
  // session. Against Hevy: Upper A (23 Aug) paid Shoulders 6.5 to Hevy's 5.5,
  // and the excess was 0.5 x 2 pec-deck sets. Upper B (20 Aug) paid 6.5 to
  // Hevy's 4.5, and 1.0 of that 2.0 was 0.5 x 2 crossover sets. One session's
  // gap is an argument; the same gap appearing in two sessions on two different
  // fly variants, at exactly the credit this line grants, is the line being
  // wrong.
  //
  // The mechanism the credit rule actually asks about is not "does the muscle
  // shorten" but "is it under a load chosen to train it". On a fly the cable is
  // set for the pec at a length where the anterior delt has no leverage; the
  // delt is holding a position, not producing the working moment. Hevy lists
  // flies as chest and nothing else, and it is right.
  { tokens: ['pec', 'deck'], muscles: { primary: ['chest'], secondary: [] } },
  { tokens: ['butterfly'], muscles: { primary: ['chest'], secondary: [] } },
  { tokens: ['cable', 'crossover'], muscles: { primary: ['chest'], secondary: [] } },
  { tokens: ['cable', 'fly'], muscles: { primary: ['chest'], secondary: [] } },

  // ── Back ────────────────────────────────────────────────────────────────────
  { tokens: ['lat', 'pulldown'], muscles: { primary: ['lats'], secondary: ['upper back', 'biceps', 'forearms'] } },
  { tokens: ['lat', 'pulldown', 'neutral'], muscles: { primary: ['lats'], secondary: ['upper back', 'biceps', 'forearms'] } },
  { tokens: ['lat', 'pulldown', 'close'], muscles: { primary: ['lats'], secondary: ['upper back', 'biceps', 'forearms'] } },
  // ── THE ROW'S REAR DELT WAS A GRIP DISTINCTION THAT DID NOT SURVIVE ───────
  // This file used to hold that a wide-grip row trains the rear delt (real
  // horizontal abduction against the cable) while a V-grip row does not (elbows
  // tucked, pure retraction). The mechanics of that are sound and the split is
  // why `Seated Cable Row` is two entries rather than one — see the note in
  // `exercise-catalog-merges`: the grips are different movements and must not
  // be re-merged.
  //
  // The CREDIT is what changed, not the split. Upper B (20 Aug) paid Shoulders
  // 6.5 against Hevy's 4.5; 1.0 of that 2.0 gap is 0.5 x 2 wide-grip row sets
  // landing on the rear delt. Hevy classes every row as back work and gives the
  // shoulder nothing, on either grip.
  //
  // Which is the more useful answer here, because the rear delt's contribution
  // to a row is real but it is not what the row is FOR: the load is chosen for
  // the mid-back, and a rear delt credited on every row makes the rear-delt
  // line a function of how much back work the week held rather than of how much
  // rear-delt work it held. Face pulls and reverse flies are where that muscle
  // is actually trained, and they still carry it as a PRIMARY.
  //
  // Both grips keep `traps` — Hevy reports Traps separately (1.0 for this
  // session's two sets), and Helix folds traps into `Upper back`, where the
  // row's own primary already dominates it under the max-per-set dedupe.
  { tokens: ['cable', 'row'], muscles: { primary: ['upper back'], secondary: ['lats', 'traps', 'biceps', 'forearms'] } },
  { tokens: ['seated', 'cable', 'row', 'wide'], muscles: { primary: ['upper back'], secondary: ['lats', 'traps', 'biceps', 'forearms'] } },
  { tokens: ['seated', 'cable', 'row', 'v'], muscles: { primary: ['upper back'], secondary: ['lats', 'biceps', 'forearms'] } },
  // Elbows locked, shoulder extension only — the long head of the triceps does
  // cross the shoulder, so it earns a secondary here where a fly does not. The
  // upper back does NOT: the scapulae depress rather than retract, and Hevy's
  // definition names the triceps alone. This was the real source of the weekly
  // Upper back over-count that the RDL was wrongly blamed for.
  { tokens: ['straight', 'arm', 'pulldown'], muscles: { primary: ['lats'], secondary: ['triceps'] } },

  // ── Delts ───────────────────────────────────────────────────────────────────
  // Deltoid work is NOT interchangeable for volume accounting. A bare 'shoulders'
  // primary folded everything (press + face pull + lateral raise) into Side delts
  // via toLandmarkMuscle, so overhead press and rear-delt face pulls inflated the
  // side-delt count. Route each head to its real primary instead.
  // A FACE PULL IS NOT UPPER-BACK WORK. It reads like it — the scapulae retract
  // — but the load is chosen for the rear delt and the rhomboids never shorten
  // against anything like it. Hevy classes the whole movement as shoulders and
  // gives the upper back nothing, and reconciling a real week against it, that
  // secondary was 1.5 of the 3.0 by which Helix over-counted Upper back.
  //
  // IT DOES PAY THE BICEPS, and that was the last line in the whole breakdown
  // still short of Hevy: exactly 1.5, which is 0.5 × these three sets. A rope
  // face pull is elbow FLEXION under load as much as it is horizontal
  // abduction — the hands finish beside the ears, which they cannot do without
  // the elbow closing. Hevy's own definition is "Primary: Shoulders, Secondary:
  // Biceps"; `rear_delts` is how this taxonomy spells that primary, because a
  // bare `shoulders` token folds to SIDE delts and would re-create the exact
  // mis-credit the three-head split exists to prevent.
  { tokens: ['face', 'pull'], muscles: { primary: ['rear_delts'], secondary: ['biceps'] } },
  // `Shoulder Press (DB)` used to resolve to NOTHING: the parenthesis was
  // stripped before matching, so `['db','shoulder','press']` could not fire, and
  // the fallback `muscle_groups[0]` was a bare 'shoulders' that folded to SIDE
  // delts — the exact mis-credit the split above exists to prevent. One bare
  // `['shoulder','press']` entry catches every spelling.
  //
  // ── AND IT PAYS THE TRICEPS, NOT THE SIDE DELT ────────────────────────────
  // `side_delts` was a secondary here on the anatomy: the lateral head does
  // abduct, and in a dumbbell press it stabilises through the whole path. But
  // Delts & Arms (18 Aug) paid Shoulders 8.5 against Hevy's 7.0, and the gap is
  // 0.5 x 3 press sets to the decimal — this line and nothing else.
  //
  // Removing it is also the honest reading of what the three-head split is FOR.
  // The split exists so that "shoulders" stops being one number that a press,
  // a lateral raise and a face pull all inflate indistinguishably. A press that
  // credits the side delt on every set puts that number back: the side-delt
  // line would rise on a day with no lateral raise in it. The press is a front
  // delt movement with a triceps cost, which is exactly what Hevy says.
  { tokens: ['shoulder', 'press'], muscles: { primary: ['front_delts'], secondary: ['triceps'] } },
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
  // Reverse (pronated) curl: BICEPS primary, forearms secondary. This file has
  // now had it both ways round. The brachioradialis argument is real — pronation
  // does shift load onto it — but the movement is still elbow flexion against a
  // load chosen for the elbow flexors, and the biceps brachii shortens through
  // the whole range whichever way the hand faces. Hevy calls it biceps-primary,
  // and flipping it back is what puts the weekly Forearms line on 8.5 instead
  // of 9.5.
  { tokens: ['reverse', 'curl'], muscles: { primary: ['biceps'], secondary: ['forearms'] } },
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
  for (const { tokens, muscles } of MUSCLE_DICT) {
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
