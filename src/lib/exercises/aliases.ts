/**
 * Exercise alias map — incoming (coach/Hevy) names → canonical catalog names.
 *
 * Hevy's exercise list lacks some variants, so placeholder names stand in for
 * what is actually performed (e.g. close-grip lat pulldown logged in Hevy is
 * really the neutral-grip movement). Canonicalizing here — at resolve time on
 * the server AND at draft-build time on the client — keeps the catalog free of
 * duplicate rows and every surface displaying the true movement name.
 *
 * Keys are lowercase + trimmed. Extend alongside the coach-prompt vocabulary;
 * the raw incoming name is always preserved inside the archived coach_report.
 */
export const EXERCISE_ALIASES: Record<string, string> = {
  // Hevy has no neutral-grip lat pulldown — close grip is the stand-in.
  'lat pulldown - close grip (cable)': 'Neutral-Grip Lat Pulldown',
  'lat pulldown close grip (cable)': 'Neutral-Grip Lat Pulldown',
  'close grip lat pulldown (cable)': 'Neutral-Grip Lat Pulldown',
  // Renamed 2026-08-01. Kept so historical rows, exports and any device still
  // holding a cached draft resolve to the new canonical name instead of
  // creating a duplicate `exercises` row.
  'hack/smith squat': 'Hack Squat',
  'smith squat': 'Hack Squat',

  // ── One machine, one row (merged 2026-08-01) ──
  // The day templates named the same three stations differently on their A and
  // B days, so each had TWO `exercises` rows and therefore two separate PR
  // baselines. The effect was silent and wrong: Leg Press ran 72.5 kg × 13 on
  // 07-27 as `Leg Press`, then the identical 72.5 kg × 13 on 07-31 as
  // `Leg Press Horizontal (Machine)` counted as a fresh record because that
  // row had never seen it. Grip is a CUE (now a program `note`), not an
  // exercise identity.
  'chest press machine': 'Chest Press (Machine)',
  'machine chest press': 'Chest Press (Machine)',
  'leg press horizontal': 'Leg Press',
  'leg press horizontal (machine)': 'Leg Press',
  'seated cable row (v-grip)': 'Seated Cable Row',
  'seated cable row (v grip)': 'Seated Cable Row',
  'seated cable row - bar wide grip': 'Seated Cable Row',
  'wide-grip cable row': 'Seated Cable Row',

  // ── Same station, two names (merged 2026-08-02) ──
  // `Cable Lateral Raise` (Delts & Arms) and `Single Arm Lateral Raise (Cable)`
  // (Upper B) were the same single-arm cable movement under two catalog rows,
  // so the 5 kg × 15 on 07-28 was judged against a baseline that had never seen
  // the 5 kg × 13 on 07-23. Identical failure mode to the machine merges above.
  'cable lateral raise': 'Single Arm Lateral Raise (Cable)',
  'single arm cable lateral raise': 'Single Arm Lateral Raise (Cable)',
  'sa lateral raise (cable)': 'Single Arm Lateral Raise (Cable)',
  'sa lateral raise': 'Single Arm Lateral Raise (Cable)',

  // ── Empty duplicate, deleted 2026-08-03 ──
  // `Incline DB Bench Press` existed as a second catalog row holding ZERO sets
  // while all 9 real sets sat under `Incline DB Press`. Nothing was wrong yet,
  // which is the point: the first session logged under the longer name would
  // have been judged against a baseline that had never seen a single rep, and
  // every set of it would have counted as a record.
  'incline db bench press': 'Incline DB Press',
  'incline dumbbell bench press': 'Incline DB Press',
  'incline dumbbell press': 'Incline DB Press',
}

export function canonicalExerciseName(raw: string): string {
  return EXERCISE_ALIASES[raw.toLowerCase().trim()] ?? raw
}
