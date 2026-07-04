import type { Metadata, Viewport } from 'next'
import { Outfit, Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { Sidebar } from '@/components/nav/Sidebar'
import { BottomNav } from '@/components/nav/BottomNav'
import { AuroraBackground } from '@/components/fx/AuroraBackground'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { RealtimeProvider } from '@/components/providers/RealtimeProvider'
import { MotionProvider } from '@/components/providers/MotionProvider'
import { ThemeProvider as ContextThemeProvider } from '@/components/providers/ThemeProvider'
import { SerwistRegister } from '@/components/providers/SerwistRegister'
import './globals.css'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Dashboard — APEX',
    template: '%s — APEX',
  },
  description: 'Human Performance Systems — Sleep · Load · Nutrition · Adaptation',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'APEX',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#050711',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="ltr" suppressHydrationWarning>
      <head>
        {/* Apply the reduce-motion pref before paint (no flash of animation). */}
        <script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.reduceMotion=localStorage.getItem('apex_reduce_motion')==='1'?'true':'false'}catch(e){}" }} />
      </head>
      <body
        className={`${outfit.variable} ${inter.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable} bg-bg text-text font-sans antialiased`}
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
            <RealtimeProvider>
              <MotionProvider>
                <ContextThemeProvider />
                <AuroraBackground />
                <Sidebar />
                <main
                  id="main-content"
                  className="min-h-dvh pt-4 safe-pt pb-28 md:pl-64 md:pt-8 md:pb-8 safe-px"
                >
                  <div className="max-w-7xl mx-auto">
                    {children}
                  </div>
                </main>
                <BottomNav />
              </MotionProvider>
            </RealtimeProvider>
          </QueryProvider>
        </ThemeProvider>
        <SerwistRegister />
      </body>
    </html>
  )
}
