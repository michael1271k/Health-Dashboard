import type { NextConfig } from 'next'
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
})

// Build identity — inlined into BOTH the client and server bundles of the SAME
// build, so a stale client comparing against /api/version detects a new deploy.
// Netlify exposes the commit sha as COMMIT_REF; local builds fall back to a
// per-build timestamp.
const BUILD_ID = process.env.COMMIT_REF ?? `dev-${Date.now()}`

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  images: {
    remotePatterns: [],
  },
  experimental: {
    // serverActions are stable in Next.js 15
    // Tree-shake heavy barrel imports → smaller bundles + faster compile
    optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion'],
  },
  // Lint is skipped on Netlify on purpose: it is style, it is already green
  // locally, and a failed deploy over an unused import costs build minutes that
  // are genuinely scarce here.
  eslint: { ignoreDuringBuilds: true },

  // TYPES ARE NOT IN THAT CATEGORY. This was `ignoreBuildErrors: true`, with a
  // comment promising that `npm run check` covers it locally — a promise, not a
  // gate. Nothing enforced it, so the deployable artifact was allowed to be one
  // a typecheck would reject, and the only way to find out was in the browser.
  //
  // A type error is never noise. Turning this off means a broken deploy fails
  // at build instead of at runtime, which is the cheaper of the two places.
  typescript: { ignoreBuildErrors: false },
}

export default withSerwist(nextConfig)
