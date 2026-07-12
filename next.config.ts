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
  // Skip lint/TS during Netlify builds — correctness is enforced locally via `npm run check`.
  // This prevents failed deploys from noise that is already green locally.
  eslint:     { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
}

export default withSerwist(nextConfig)
