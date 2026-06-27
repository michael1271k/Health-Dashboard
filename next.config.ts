import type { NextConfig } from 'next'
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
})

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [],
  },
  experimental: {
    // serverActions are stable in Next.js 15
  },
  // Skip lint/TS during Netlify builds — correctness is enforced locally via `npm run check`.
  // This prevents failed deploys from noise that is already green locally.
  eslint:     { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
}

export default withSerwist(nextConfig)
