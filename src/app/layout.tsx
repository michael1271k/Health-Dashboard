import type { Metadata, Viewport } from 'next'
import { Outfit, Inter, JetBrains_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { Navbar } from '@/components/nav/Navbar'
import { BottomNav } from '@/components/nav/BottomNav'
import { QueryProvider } from '@/components/providers/QueryProvider'
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

export const metadata: Metadata = {
  title: {
    default: 'Dashboard — APEX',
    template: '%s — APEX',
  },
  description: 'Engineer Your Ascent — Precision Human Performance OS',
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
  themeColor: '#0A0E1A',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="ltr" suppressHydrationWarning>
      <head />
      <body
        className={`${outfit.variable} ${inter.variable} ${jetbrainsMono.variable} bg-bg text-text font-sans antialiased`}
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
            <Navbar />
            <main
              id="main-content"
              className="min-h-screen bg-bg pt-4 pb-24 md:pt-24 md:pb-8 px-4"
            >
              <div className="max-w-7xl mx-auto">
                {children}
              </div>
            </main>
            <BottomNav />
          </QueryProvider>
        </ThemeProvider>
        <SerwistRegister />
      </body>
    </html>
  )
}
