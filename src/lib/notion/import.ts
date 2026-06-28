/**
 * Notion helpers retained after the live historical-import route was retired
 * (Phase 5.3) in favour of the local `scripts/generate_notion_seed.ts` SQL-dump
 * workflow. Only the duration parser remains in use.
 */

/** Parse a Notion "Duration" text like "1h 15m", "75", "1:15" → minutes. */
export function parseDurationMin(raw: string | null): number | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()
  let m = s.match(/(\d+)\s*h(?:ours?)?\s*(\d+)?/)
  if (m) return parseInt(m[1]) * 60 + (m[2] ? parseInt(m[2]) : 0)
  m = s.match(/^(\d+):(\d+)$/)
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2])
  m = s.match(/(\d+)\s*m/)
  if (m) return parseInt(m[1])
  m = s.match(/^(\d+)$/)
  if (m) return parseInt(m[1])
  return null
}
