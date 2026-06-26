import { LayoutDashboard, BarChart3, CalendarCheck, Dumbbell, Settings } from 'lucide-react'

export const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/weekly', icon: CalendarCheck, label: 'Weekly' },
  { href: '/charts', icon: BarChart3, label: 'Charts' },
  { href: '/log', icon: Dumbbell, label: 'Log' },
  { href: '/settings', icon: Settings, label: 'Settings' },
] as const
