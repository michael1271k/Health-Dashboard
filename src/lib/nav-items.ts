import {
  LayoutDashboard,
  Salad,
  Dumbbell,
  Compass,
  Settings,
} from 'lucide-react'

// Logging is unified into /session (opened from Workout/Nexus). The old Journey
// (daily) and Progression (weekly + analytics + vitals) tabs are merged into the
// single Pathfinder tab. Legacy routes redirect: /weekly, /progression, /charts,
// /insights, /reports, /vitals → /pathfinder. Settings is promoted to a top-level
// nav item (the "More" drawer is gone).
export const navItems = [
  { href: '/',           icon: LayoutDashboard, label: 'Dashboard'  },
  { href: '/nutrition',  icon: Salad,           label: 'Nutrition'  },
  { href: '/workout',    icon: Dumbbell,        label: 'Workout'    },
  { href: '/pathfinder', icon: Compass,         label: 'Pathfinder' },
  { href: '/settings',   icon: Settings,        label: 'Settings'   },
] as const

// Both the desktop sidebar and the mobile bottom nav now share the same five
// thumb-first tabs (Settings included) — no "More" drawer.
export const coreNavItems = navItems
