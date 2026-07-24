'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { m } from 'framer-motion'
import { type LucideIcon } from 'lucide-react'
import { coreNavItems } from '@/lib/nav-items'

export function BottomNav() {
  const pathname = usePathname()

  // The session deck is a fullscreen takeover — its own CommitBar owns the
  // bottom edge (and the safe area) there. The /session/[id] analysis page also
  // starts with /session, so it's a clean fullscreen deep-dive with a back button.
  if (pathname.startsWith('/session')) return null

  // Pathfinder owns the daily Nexus (/day/*) and the workout analysis deep-dive,
  // both reached from within it.
  const isActive = (href: string) =>
    pathname === href ||
    (href === '/pathfinder' && (pathname.startsWith('/day') || pathname.startsWith('/session')))

  const pillStyle = {
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(24px) saturate(160%)',
    WebkitBackdropFilter: 'blur(24px) saturate(160%)',
    border: '1px solid rgba(255,255,255,0.10)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 12px 32px rgba(0,0,0,0.55)',
  }

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1"
    >
      <ul className="flex items-center justify-around rounded-2xl px-1.5 py-1.5" role="list" style={pillStyle}>
        {coreNavItems.map(({ href, icon: Icon, label }) => (
          <NavCell key={href} href={href} Icon={Icon} label={label} active={isActive(href)} />
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
        className={`relative flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-xl
                    transition-colors duration-200 min-h-[44px] ${active ? '' : 'text-muted'}`}
        style={active ? { color: '#8AA0B8' } : {}}
      >
        {active && (
          <m.span layoutId="bottomnav-active" className="absolute inset-0 rounded-xl"
            style={{ background: 'rgba(56,189,248,0.12)' }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }} aria-hidden="true" />
        )}
        <Icon className="relative z-10 w-5 h-5" aria-hidden="true" />
        <span className="relative z-10 text-[10px] font-medium leading-none">{label}</span>
      </Link>
    </li>
  )
}
