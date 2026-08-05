import { MUTED, EMERALD, GOLD, OXIDE } from '@/lib/theme/palette'

/**
 * One severity ramp for the whole app: index by severity 0–3.
 *
 * Lives in its own leaf module because both the tracker and the SVG soreness
 * map need it, and having the map import it from `RecoveryTrackers` — which
 * imports the map — is an import cycle. Nothing here imports a component.
 */
export const SEVERITY_COLOR = [MUTED, EMERALD, GOLD, OXIDE]
export const SEVERITY_WORD = ['none', 'mild', 'moderate', 'severe']
