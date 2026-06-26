import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Charts — VITAL',
}

export default function ChartsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
