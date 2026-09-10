import { NextResponse } from 'next/server'

/**
 * GET /api/version — the deploy heartbeat.
 *
 * Returns the marketing version and the build id inlined into THIS server
 * bundle. The version is what a bug report quotes; the build id is what the
 * reload check compares.
 *
 * The build id is what drives the reload. A running client compares it
 * against its own inlined NEXT_PUBLIC_BUILD_ID: a mismatch means a
 * new deploy landed while the PWA was holding a stale bundle → reload before
 * the stale module graph can throw (the root cause of the old #130 flash).
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    {
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown',
      buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? 'unknown',
    },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } },
  )
}
