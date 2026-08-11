import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { Sidebar } from '@/components/nav/Sidebar'
import { BottomNav } from '@/components/nav/BottomNav'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { RealtimeProvider } from '@/components/providers/RealtimeProvider'
import { MotionProvider } from '@/components/providers/MotionProvider'
import { ThemeProvider as ContextThemeProvider } from '@/components/providers/ThemeProvider'
import { EraFilterProvider } from '@/lib/era/eraFilter'
import { SerwistRegister } from '@/components/providers/SerwistRegister'
import { AuthGate } from '@/components/providers/AuthGate'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { CrashRecorder } from '@/components/providers/CrashRecorder'
import { NativeBoot } from '@/components/providers/NativeBoot'
import { ReloadHome } from '@/components/providers/ReloadHome'
import './globals.css'

/*
 * NO WEBFONTS. The type system is the platform's.
 *
 * Three `next/font/google` families and six weight files were being fetched
 * before first paint on a device where `-apple-system` already resolves to SF
 * Pro — the same superfamily, in every weight this app uses (bold 219 uses,
 * semibold 135, medium 30, black 5, extrabold 3, all present). On iOS, which is
 * what this app is, the bytes bought nothing and the render-blocking cost was
 * paid on every cold start.
 *
 * What it also buys: `font-optical-sizing: auto` in globals.css stops being a
 * no-op (neither loaded font had an `opsz` axis; SF crosses Text -> Display at
 * 20pt), real tracking tables, Dynamic Type, and no FOUT.
 *
 * What it costs: off-Apple — the Netlify PWA in desktop Chrome, or Android —
 * falls back to Roboto/Segoe, and Space Grotesk's display character is gone.
 * Accepted: this is an iOS-first app and the type SCALE carries the hierarchy.
 */

export const metadata: Metadata = {
  metadataBase: new URL('https://helix-health-fitness.netlify.app'),
  title: {
    default: 'Dashboard — HELIX',
    template: '%s — HELIX',
  },
  description: 'Human Performance Systems — Sleep · Load · Nutrition · Adaptation',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'HELIX',
  },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // No maximumScale / userScalable lock. It was there to stop iOS zooming when
  // a sub-16px input took focus; the `@media (pointer: coarse)` rule in
  // globals.css removes that trigger at the source, so pinch-zoom — which is
  // an accessibility feature, not a bug — comes back.
  viewportFit: 'cover',
  themeColor: '#0A0B0D',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        {/* One-time apex_* → helix_* pref migration + reduce-motion before paint +
            a data-hidden flag that pauses all ambient animations while backgrounded. */}
        <script dangerouslySetInnerHTML={{ __html: "try{['units','reduce_motion','active_program'].forEach(function(k){var o=localStorage.getItem('apex_'+k);if(o!==null&&localStorage.getItem('helix_'+k)===null)localStorage.setItem('helix_'+k,o)});document.documentElement.dataset.reduceMotion=localStorage.getItem('helix_reduce_motion')==='1'?'true':'false';var syncHidden=function(){document.documentElement.dataset.hidden=document.hidden?'true':'false'};document.addEventListener('visibilitychange',syncHidden);syncHidden()}catch(e){}" }} />
      </head>
      <body
        className="bg-bg text-text font-sans antialiased"
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4
                     focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-bg
                     focus:rounded-xl focus:font-semibold"
        >
          Skip to main content
        </a>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <QueryProvider>
            {/* Native boot needs the QueryClient (foreground sync → invalidation),
                so it lives INSIDE QueryProvider. */}
            <NativeBoot />
            <RealtimeProvider>
              <EraFilterProvider>
              <MotionProvider>
                <ContextThemeProvider />
                <Sidebar />
                {/* No padding utilities. Every gutter and every clearance now
                    lives in the unlayered `main#main-content` rule in
                    globals.css, driven by --chrome-top/--chrome-bottom, so
                    content scrolls UNDER the bars instead of being boxed
                    between them.

                    Nothing on this element or above it may ever carry
                    transform / filter / perspective / will-change /
                    contain:paint — the app bar inside it uses backdrop-filter,
                    and on iOS a transformed ancestor makes that sample the
                    wrong buffer and paint solid black. */}
                <main id="main-content" className="min-h-dvh">
                  {/* Global pull-to-refresh — active on every tab (native HealthKit
                      sync + query revalidation), non-blocking of top-of-screen taps. */}
                  <PullToRefresh>
                    {/* Carries no measure. A page that wants one declares it:
                        `data-boxed` for the bento, or a Zone/Surface `measure`
                        for a band. */}
                    <div className="app-shell-container">
                      <AuthGate>{children}</AuthGate>
                    </div>
                  </PullToRefresh>
                </main>
                <BottomNav />
              </MotionProvider>
              </EraFilterProvider>
            </RealtimeProvider>
          </QueryProvider>
        </ThemeProvider>
        <SerwistRegister />
        <CrashRecorder />
        <ReloadHome />
      </body>
    </html>
  )
}
