/**
 * Exercise alias map — historical and variant names → canonical catalog names.
 *
 * Some entries date from when workouts arrived as pasted Hevy exports, whose
 * exercise list lacks certain variants, so a placeholder name stood in for what
 * was actually performed (a close-grip lat pulldown logged in Hevy is really
 * the neutral-grip movement). The rest are renames and merges. Canonicalizing
 * here — at resolve time on the server AND at draft-build time on the client —
 * keeps the catalog free of duplicate rows and every surface displaying the
 * true movement name.
 *
 * Keys are lowercase + trimmed.
 *
 * ── THIS MAP IS NO LONGER RECOVERABLE, SO IT IS NO LONGER GUESSWORK ──────────
 * This header used to end "the raw incoming name is always preserved inside the
 * archived coach_report" — the safety net that made a wrong alias a display bug
 * rather than a data-loss bug. That archive is gone: the paste importer was
 * deleted along with `lib/hevy/` and `lib/coach/reportSchema.ts`, they were
 * `coach_report`'s only two writers, and the field no longer rides the commit
 * payload at all (see `buildCommitPayload`).
 *
 * Nothing about that endangers the rows here, because nothing arrives from a
 * foreign vocabulary any more: every workout is logged natively against the
 * catalog, so the "incoming name" is a name this app already chose. What it
 * does remove is the licence to add a SPECULATIVE alias. An entry that maps the
 * wrong pair now silently merges two movements' history with no record of what
 * was typed — which is the failure mode `exercise-catalog-merges` exists to
 * warn about, minus the archive that used to make it reversible. Add a key only
 * for a rename or a merge you are performing deliberately.
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
  // ── SEATED CABLE ROW IS THE ONE EXCEPTION, carved back out 2026-08-06 ──
  // The machine merges above stand: on a chest press or a leg press the grip is
  // a cue and the movement is identical. The cable row is not that case, and
  // folding it in with them cost a real record.
  //
  // The two grips are programmed as different lifts on different days — V-grip
  // on Upper A (Sunday, wk1 38.5 kg, a close neutral pull), wide bar on Upper B
  // (Thursday, wk1 35 kg, an upper-back pull) — and the logs show two clean,
  // non-overlapping load ladders: Upper A sat at 42.5 kg from its first session,
  // Upper B climbed 35 → 42.5. Sharing one row meant the Sunday ladder set the
  // bar for the Thursday one, so 2026-08-06's 42.5 × 11 (467.5 kg, 58.1 e1RM —
  // a best against every wide-bar set ever logged) was judged against Sunday's
  // 42.5 × 13 and lost both axes.
  //
  // These aliases now RESOLVE THE VARIANT rather than erasing it. The bare name
  // stays a valid third identity for the PPL legacy plan, which never logged it.
  'seated cable row (v grip)': 'Seated Cable Row (V-Grip)',
  'seated cable row v-grip': 'Seated Cable Row (V-Grip)',
  'seated cable row - v-bar': 'Seated Cable Row (V-Grip)',
  'seated cable row - bar wide grip': 'Seated Cable Row (Wide Grip)',
  'seated cable row (wide bar)': 'Seated Cable Row (Wide Grip)',
  'wide-grip cable row': 'Seated Cable Row (Wide Grip)',

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
