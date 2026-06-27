/**
 * Shared API auth guard for this single-user app.
 *
 * Two accepted callers:
 *  1. Same-origin UI requests (Referer starts with NEXT_PUBLIC_APP_URL).
 *  2. External automations presenting the webhook secret (x-webhook-secret).
 *
 * In development the gate is open. In production, deny by default when neither
 * condition is met. This centralizes the logic previously duplicated across
 * /api/sessions, /api/compute-score, and /api/ingest.
 */

export function isAllowed(req: Request): boolean {
  // Open in development for local testing
  if (process.env.NODE_ENV === 'development') return true

  const secret = process.env.INGEST_WEBHOOK_SECRET
  // If no secret is configured at all, fall back to same-origin only.
  const provided = req.headers.get('x-webhook-secret')
  if (secret && provided === secret) return true

  const referer = req.headers.get('referer') ?? ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  if (appUrl && referer.startsWith(appUrl)) return true

  return false
}

/** Returns a 401 Response if not allowed, otherwise null. */
export function denyIfUnauthorized(req: Request): Response | null {
  if (isAllowed(req)) return null
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}
