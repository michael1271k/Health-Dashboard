import { NextResponse } from 'next/server'

/**
 * GET /api/version — the deploy heartbeat.
 *
 * Returns the build id inlined into THIS server bundle. A running client
 * compares it against its own inlined NEXT_PUBLIC_BUILD_ID: a mismatch means a
 * new deploy landed while the PWA was holding a stale bundle → reload before
 * the stale module graph can throw (the root cause of the old #130 flash).
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? 'unknown' },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } },
  )
}
