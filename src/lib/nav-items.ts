import {
  LayoutDashboard,
  Salad,
  Dumbbell,
  Compass,
  Settings,
} from 'lucide-react'

// Logging is unified into /session (opened from Workout/Nexus). The old Journey
// (daily) and Progression (weekly + analytics + vitals) tabs are merged into the
// single Pathfinder tab. Settings is promoted to a top-level nav item (the "More"
// drawer is gone).
//
// `/reports` and `/report/[id]` are deliberately NOT tabs: a report is a document
// you open from the week it belongs to, and a sixth tab would crowd a bottom nav
// sized for thumbs. Reached from Momentum's header and from each week capsule.
export const navItems = [
  { href: '/',           icon: LayoutDashboard, label: 'Dashboard'  },
  { href: '/nutrition',  icon: Salad,           label: 'Nutrition'  },
  { href: '/workout',    icon: Dumbbell,        label: 'Workout'    },
  { href: '/pathfinder', icon: Compass,         label: 'Progress'   },
  { href: '/settings',   icon: Settings,        label: 'Settings'   },
] as const

// Both the desktop sidebar and the mobile bottom nav now share the same five
// thumb-first tabs (Settings included) — no "More" drawer.
export const coreNavItems = navItems

/** Sub-trees a tab owns that do not live under its own href. */
const ADOPTED: Record<string, readonly string[]> = {
  // Pathfinder owns the daily Nexus and the workout analysis deep-dive, both
  // reached from within it.
  '/pathfinder': ['/day', '/session'],
}

/**
 * Is `href` the tab the current route belongs to?
 *
 * ── WHY THIS IS A PREFIX MATCH ───────────────────────────────────────────────
 * It was `pathname === href`, plus one hand-written special case for Pathfinder.
 * Exact equality means a tab goes dark the moment you step INTO it: opening an
 * exercise put you on `/workout/exercises/<id>`, which equals nothing in the
 * list, so the whole bar unlit and the app stopped answering "where am I" — the
 * first question a navigation bar exists to answer.
 *
 * `/` is exact-only, because every path starts with it. Every other tab owns its
 * sub-tree, matched on a SEGMENT boundary so a future `/workout-log` could never
 * light up `/workout`.
 *
 * One definition, because the bottom nav and the desktop sidebar had a
 * copy each and only one of them would ever have been fixed.
 */
export function isNavActive(href: string, pathname: string): boolean {
  const owns = (root: string) => pathname === root || pathname.startsWith(`${root}/`)
  if (href === '/') return pathname === '/'
  return owns(href) || (ADOPTED[href] ?? []).some(owns)
}

/**
 * The routes a signed-OUT visitor may reach.
 *
 * ── WHY THIS IS NOT JUST `/auth` ANY MORE ────────────────────────────────────
 * App Review opens the privacy-policy URL of every app carrying the HealthKit
 * entitlement, from a browser with no session, before they ever install the
 * binary. `AuthGate` used to redirect anything that was not `/auth` straight to
 * the sign-in page, so a policy page behind it is a 5.1.1 rejection wearing a
 * login form. The support URL is opened the same way, and `/delete-account`
 * (guideline 5.1.1(v)) is the one page a person whose phone is gone has to be
 * able to reach — its own code already renders a "sign in first" card, which
 * the redirect never let anyone see.
 *
 * It is also what the app CHROME keys off. A public page that still drew the
 * bottom nav would hand a reviewer five taps that each bounce to sign-in.
 *
 * One list, because the gate and the two navs each had their own idea of
 * "public" and only one of them would ever have been updated.
 */
export const PUBLIC_ROUTES = ['/auth', '/privacy', '/support', '/delete-account'] as const

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))
}
