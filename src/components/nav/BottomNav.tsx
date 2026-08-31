'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { m } from 'framer-motion'
import { type LucideIcon } from 'lucide-react'
import { coreNavItems, isNavActive } from '@/lib/nav-items'
import { SNAPPY } from '@/lib/motion'
import { tapLight } from '@/lib/native/haptics'

/**
 * The tab bar — an edge-to-edge translucent bar, not a floating pill.
 *
 * It used to be a rounded capsule inset 12px from every edge, sitting ON the
 * page with its own drop shadow. That is a widget hovering above the content.
 * A tab bar is structure: it spans the full width, it owns the bottom edge
 * including the home-indicator inset, and the content scrolls UNDERNEATH its
 * frosted layer rather than stopping short of it. The clearance that keeps the
 * last element reachable is `--chrome-bottom` on <main>, not a gap here.
 */
export function BottomNav() {
  const pathname = usePathname()

  // The session deck is a fullscreen takeover — its own CommitBar owns the
  // bottom edge (and the safe area) there. The /session/[id] analysis page also
  // starts with /session, so it's a clean fullscreen deep-dive with a back button.
  const hidden = pathname.startsWith('/session')

  // Tell the shell how much bottom chrome to clear. Without this the deck would
  // reserve ~90px for a bar that is not rendered. An attribute rather than
  // :has(), so it is deterministic and togglable in devtools.
  useEffect(() => {
    document.documentElement.dataset.bottomNav = hidden ? 'false' : 'true'
  }, [hidden])

  if (hidden) return null

  return (
    <nav
      aria-label="Mobile navigation"
      /* `max()` on the bottom inset, matching the `.safe-pb` convention in
         globals.css. The raw variable is 0 on a device with no home indicator —
         an iPhone SE, or the desktop PWA at a narrow width — which sat the tab
         row flush against the physical edge of the screen with nothing under
         the labels. The sides stay raw: a zero side inset genuinely wants zero
         padding, because the nav is already full-bleed by design. */
      className="app-chrome fixed bottom-0 left-0 right-0 z-50 md:hidden
                 border-t border-white/[0.08] pb-[max(0.375rem,var(--safe-bottom))]
                 pl-[var(--safe-left)] pr-[var(--safe-right)]"
    >
      <ul className="flex items-stretch justify-around h-[var(--nav-height)]" role="list">
        {coreNavItems.map(({ href, icon: Icon, label }) => (
          <NavCell key={href} href={href} Icon={Icon} label={label} active={isNavActive(href, pathname)} />
        ))}
      </ul>
    </nav>
  )
}

function NavCell({ href, Icon, label, active }: { href: string; Icon: LucideIcon; label: string; active: boolean }) {
  return (
    <li className="flex-1">
      <Link
        href={href}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        // Feedback on press, not on navigation: the route change is the slow
        // part, and waiting for it to acknowledge the tap is what makes a tab
        // bar feel dead.
        onPointerDown={() => { void tapLight() }}
        className={`relative flex h-full flex-col items-center justify-center gap-0.5 px-1
                    min-h-[44px] transition-colors duration-200
                    ${active ? 'text-primary' : 'text-muted'}`}
      >
        {active && (
          <m.span
            layoutId="bottomnav-active"
            className="absolute inset-x-1.5 inset-y-1 rounded-xl bg-primary/12"
            transition={SNAPPY}
            aria-hidden="true"
          />
        )}
        <Icon className="relative z-10 w-5 h-5" aria-hidden="true" />
        <span className="relative z-10 text-[10px] font-semibold leading-none">{label}</span>
      </Link>
    </li>
  )
}
