import {
  LayoutDashboard,
  Salad,
  Dumbbell,
  BarChart3,
  CalendarCheck,
  ClipboardList,
  Settings,
} from 'lucide-react'

export const navItems = [
  { href: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/nutrition', icon: Salad,           label: 'Nutrition'  },
  { href: '/workout',   icon: Dumbbell,        label: 'Workout'    },
  { href: '/charts',    icon: BarChart3,       label: 'Charts'     },
  { href: '/weekly',    icon: CalendarCheck,   label: 'Weekly'     },
  { href: '/log',       icon: ClipboardList,   label: 'Log'        },
  { href: '/settings',  icon: Settings,        label: 'Settings'   },
] as const

// Mobile bottom nav — top 5 most-used items (sidebar shows all 7)
export const bottomNavItems = navItems.slice(0, 5)
