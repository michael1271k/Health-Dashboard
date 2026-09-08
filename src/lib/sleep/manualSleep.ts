/**
 * The sleep sentinel — `sleep_sessions.hk_uuid` for a night the user edited.
 *
 * Same shape as `manualWater.ts` and `manualEntry.ts`: per NIGHT, keyed by the
 * wake date, so two edited nights never collide should the column ever carry a
 * unique index. Every sleep writer — the web ingest, the phone's `writeSleep`,
 * `HealthSync`'s overnight-HRV read — checks it before touching the night: a
 * trimmed window that the next sync quietly re-widened would be a correction
 * that stopped being honoured with nothing on screen able to say so.
 */
export const MANUAL_SLEEP_PREFIX = 'manual-sleep-'

export function manualSleepSentinel(wakeDateISO: string): string {
  return `${MANUAL_SLEEP_PREFIX}${wakeDateISO}`
}

export function isManualSleepHkUuid(hkUuid: string | null | undefined): boolean {
  return typeof hkUuid === 'string' && hkUuid.startsWith(MANUAL_SLEEP_PREFIX)
}
