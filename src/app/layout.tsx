import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Inter, IBM_Plex_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { Sidebar } from '@/components/nav/Sidebar'
import { BottomNav } from '@/components/nav/BottomNav'
import { AuroraBackground } from '@/components/fx/AuroraBackground'
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

// HELIX type system: Space Grotesk (headings/display) · Inter (body) ·
// IBM Plex Mono (data). Space Grotesk is a mechanical grotesque — squarer
// counters and tighter spacing than Sora's soft geometry, which is what makes
// the UI read as engineered rather than friendly. It fills the legacy
// --font-outfit slot; IBM Plex Mono fills --font-jetbrains.
const sora = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains',
  display: 'swap',
})

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
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0A0B0D',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="ltr" suppressHydrationWarning>
      <head>
        {/* One-time apex_* → helix_* pref migration + reduce-motion before paint +
            a data-hidden flag that pauses all ambient animations while backgrounded. */}
        <script dangerouslySetInnerHTML={{ __html: "try{['units','reduce_motion','active_program'].forEach(function(k){var o=localStorage.getItem('apex_'+k);if(o!==null&&localStorage.getItem('helix_'+k)===null)localStorage.setItem('helix_'+k,o)});document.documentElement.dataset.reduceMotion=localStorage.getItem('helix_reduce_motion')==='1'?'true':'false';var syncHidden=function(){document.documentElement.dataset.hidden=document.hidden?'true':'false'};document.addEventListener('visibilitychange',syncHidden);syncHidden()}catch(e){}" }} />
      </head>
      <body
        className={`${sora.variable} ${inter.variable} ${plexMono.variable} bg-bg text-text font-sans antialiased`}
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
                <AuroraBackground />
                <Sidebar />
                <main
                  id="main-content"
                  className="min-h-dvh pt-4 safe-pt pb-28 md:pl-64 xl:pl-72 md:pt-8 md:pb-8 safe-px"
                >
                  {/* Global pull-to-refresh — active on every tab (native HealthKit
                      sync + query revalidation), non-blocking of top-of-screen taps. */}
                  <PullToRefresh>
                    <div className="max-w-7xl mx-auto">
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
