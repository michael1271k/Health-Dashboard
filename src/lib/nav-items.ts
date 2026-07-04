import {
  LayoutDashboard,
  Salad,
  Dumbbell,
  BarChart3,
  CalendarCheck,
  Settings,
} from 'lucide-react'

// Logging is unified into /workout (Phase 5), so there is no separate Log item.
export const navItems = [
  { href: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/nutrition', icon: Salad,           label: 'Nutrition'  },
  { href: '/workout',   icon: Dumbbell,        label: 'Workout'    },
  { href: '/weekly',    icon: CalendarCheck,   label: 'Journey'    },
  { href: '/charts',    icon: BarChart3,       label: 'Charts'     },
  { href: '/settings',  icon: Settings,        label: 'Settings'   },
] as const

// Mobile bottom nav — top 5 most-used items (sidebar shows all)
export const bottomNavItems = navItems.slice(0, 5)
