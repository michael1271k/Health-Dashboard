import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Workout Log — MERIDIAN',
}

export default function LogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
