'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { coreNavItems, moreNavItems } from '@/lib/nav-items'
import { Sheet } from '@/components/ui/Sheet'

export function BottomNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  // The session deck is a fullscreen takeover — its own CommitBar owns the
  // bottom edge (and the safe area) there.
  if (pathname.startsWith('/session')) return null

  const isActive = (href: string) =>
    pathname === href || (href === '/weekly' && pathname.startsWith('/day'))
  const moreActive = moreNavItems.some((i) => pathname === i.href)

  const pillStyle = {
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(24px) saturate(160%)',
    WebkitBackdropFilter: 'blur(24px) saturate(160%)',
    border: '1px solid rgba(255,255,255,0.10)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 12px 32px rgba(0,0,0,0.55)',
  }

  return (
    <>
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1"
      >
        <ul className="flex items-center justify-around rounded-2xl px-1.5 py-1.5" role="list" style={pillStyle}>
          {coreNavItems.map(({ href, icon: Icon, label }) => (
            <NavCell key={href} href={href} Icon={Icon} label={label} active={isActive(href)} />
          ))}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-label="More"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={`w-full flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-xl
                          transition-[color,background] duration-200 min-h-[44px]
                          ${moreActive ? 'text-primary' : 'text-muted'}`}
              style={moreActive ? { background: 'rgba(111,233,255,0.12)', color: '#6FE9FF' } : {}}
            >
              <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
              <span className="text-[10px] font-medium leading-none">More</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <ul className="space-y-1.5" role="list">
          {moreNavItems.map(({ href, icon: Icon, label }) => {
            const active = pathname === href
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className="flex items-center gap-3 rounded-xl px-4 py-3.5 min-h-[56px] transition-colors
                             bg-white/[0.03] border border-white/[0.06] active:scale-[0.99]"
                  style={active ? { background: 'rgba(111,233,255,0.10)', borderColor: 'rgba(111,233,255,0.30)' } : {}}
                >
                  <Icon className={`w-5 h-5 ${active ? 'text-primary' : 'text-muted'}`} aria-hidden="true" />
                  <span className={`text-fluid-sm font-semibold ${active ? 'text-primary' : 'text-text'}`}>{label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </Sheet>
    </>
  )
}

function NavCell({ href, Icon, label, active }: { href: string; Icon: LucideIcon; label: string; active: boolean }) {
  return (
    <li className="flex-1">
      <Link
        href={href}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={`flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-xl
                    transition-[color,background] duration-200 min-h-[44px]
                    ${active ? 'text-primary' : 'text-muted'}`}
        style={active ? { background: 'rgba(111,233,255,0.12)', color: '#6FE9FF' } : {}}
      >
        <Icon className="w-5 h-5" aria-hidden="true" />
        <span className="text-[10px] font-medium leading-none">{label}</span>
      </Link>
    </li>
  )
}
