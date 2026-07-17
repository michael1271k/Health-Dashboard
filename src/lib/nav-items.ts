import {
  LayoutDashboard,
  Salad,
  Dumbbell,
  BarChart3,
  CalendarCheck,
  HeartPulse,
  Settings,
} from 'lucide-react'

// Logging is unified into /session (opened from Workout/Nexus), so there is
// no separate Log item.
export const navItems = [
  { href: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/nutrition', icon: Salad,           label: 'Nutrition'  },
  { href: '/workout',   icon: Dumbbell,        label: 'Workout'    },
  { href: '/weekly',    icon: CalendarCheck,   label: 'Journey'    },
  { href: '/vitals',    icon: HeartPulse,      label: 'Vitals'     },
  { href: '/charts',    icon: BarChart3,       label: 'Charts'     },
  { href: '/settings',  icon: Settings,        label: 'Settings'   },
] as const

// Mobile bottom nav — every destination, Settings included (icon-first, 7-up)
export const bottomNavItems = navItems
