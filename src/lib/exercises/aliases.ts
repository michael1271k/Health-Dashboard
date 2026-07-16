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
}

export function canonicalExerciseName(raw: string): string {
  return EXERCISE_ALIASES[raw.toLowerCase().trim()] ?? raw
}
