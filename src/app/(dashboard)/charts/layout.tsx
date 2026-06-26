import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Charts — MERIDIAN',
}

export default function ChartsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
