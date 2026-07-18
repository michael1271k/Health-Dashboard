import {
  LayoutDashboard,
  Salad,
  Dumbbell,
  BarChart3,
  CalendarCheck,
  Activity,
  Settings,
} from 'lucide-react'

// Logging is unified into /session (opened from Workout/Nexus), so there is
// no separate Log item. Vitals + Weekly Summary are merged into Insights.
export const navItems = [
  { href: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/nutrition', icon: Salad,           label: 'Nutrition' },
  { href: '/workout',   icon: Dumbbell,        label: 'Workout'   },
  { href: '/weekly',    icon: CalendarCheck,   label: 'Journey'   },
  { href: '/insights',  icon: Activity,        label: 'Insights'  },
  { href: '/charts',    icon: BarChart3,       label: 'Charts'    },
  { href: '/settings',  icon: Settings,        label: 'Settings'  },
] as const

// Desktop sidebar shows the full flat list. Mobile splits into four thumb-first
// core tabs + a "More" drawer holding the lower-frequency destinations.
export const coreNavItems = [
  { href: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/nutrition', icon: Salad,           label: 'Nutrition' },
  { href: '/workout',   icon: Dumbbell,        label: 'Workout'   },
  { href: '/weekly',    icon: CalendarCheck,   label: 'Journey'   },
] as const

export const moreNavItems = [
  { href: '/insights', icon: Activity,   label: 'Weekly Insights' },
  { href: '/charts',   icon: BarChart3,  label: 'Charts'          },
  { href: '/settings', icon: Settings,   label: 'Settings'        },
] as const
