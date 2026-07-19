import {
  LayoutDashboard,
  Salad,
  Dumbbell,
  CalendarCheck,
  TrendingUp,
  Settings,
} from 'lucide-react'

// Logging is unified into /session (opened from Workout/Nexus). Insights, Reports
// and Charts are merged into the single Progression tab (Timeline + Analytics);
// Vitals folds in too. /charts, /insights, /reports redirect to /progression.
export const navItems = [
  { href: '/',            icon: LayoutDashboard, label: 'Dashboard'   },
  { href: '/nutrition',   icon: Salad,           label: 'Nutrition'   },
  { href: '/workout',     icon: Dumbbell,        label: 'Workout'     },
  { href: '/weekly',      icon: CalendarCheck,   label: 'Journey'     },
  { href: '/progression', icon: TrendingUp,      label: 'Progression' },
  { href: '/settings',    icon: Settings,        label: 'Settings'    },
] as const

// Desktop sidebar shows the full flat list. Mobile shows five thumb-first core
// tabs + a "More" drawer holding Settings.
export const coreNavItems = [
  { href: '/',            icon: LayoutDashboard, label: 'Dashboard'   },
  { href: '/nutrition',   icon: Salad,           label: 'Nutrition'   },
  { href: '/workout',     icon: Dumbbell,        label: 'Workout'     },
  { href: '/weekly',      icon: CalendarCheck,   label: 'Journey'     },
  { href: '/progression', icon: TrendingUp,      label: 'Progress'    },
] as const

export const moreNavItems = [
  { href: '/settings', icon: Settings, label: 'Settings' },
] as const
