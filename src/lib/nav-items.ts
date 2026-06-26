import { Activity, BarChart3, Dumbbell, Settings } from 'lucide-react'

export const navItems = [
  { href: '/', icon: Activity, label: 'Dashboard' },
  { href: '/charts', icon: BarChart3, label: 'Charts' },
  { href: '/log', icon: Dumbbell, label: 'Log' },
  { href: '/settings', icon: Settings, label: 'Settings' },
] as const
