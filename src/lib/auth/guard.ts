/**
 * Shared API auth guard for this single-user app.
 *
 * Accepted callers:
 *  1. Same-origin browser requests — the request's Origin/Referer host matches
 *     the server's own Host header. This is robust and does NOT depend on
 *     NEXT_PUBLIC_APP_URL being set correctly (the prior cause of false
 *     "unauthorized" errors on the admin migrate-history button).
 *  2. External automations presenting the webhook secret (x-webhook-secret).
 *
 * Development is always allowed.
 */

function sameOrigin(req: Request): boolean {
  const host = req.headers.get('host')
  if (!host) return false
  const candidate = req.headers.get('origin') ?? req.headers.get('referer')
  if (!candidate) return false
  try {
    return new URL(candidate).host === host
  } catch {
    return false
  }
}

export function isAllowed(req: Request): boolean {
  if (process.env.NODE_ENV === 'development') return true

  // Webhook secret (external callers)
  const secret = process.env.INGEST_WEBHOOK_SECRET
  const provided = req.headers.get('x-webhook-secret')
  if (secret && provided === secret) return true

  // Same-origin UI calls
  if (sameOrigin(req)) return true

  // Fallback: explicit app URL match (Referer prefix), if configured
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const referer = req.headers.get('referer') ?? ''
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
