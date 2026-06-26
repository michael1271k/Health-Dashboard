import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Workout Log — VITAL',
}

export default function LogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
