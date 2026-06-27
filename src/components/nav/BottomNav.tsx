'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { bottomNavItems as navItems } from '@/lib/nav-items'

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1"
    >
      {/* Floating glass pill */}
      <ul
        className="flex items-center justify-around rounded-2xl px-1.5 py-1.5"
        role="list"
        style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 12px 32px rgba(0,0,0,0.55)',
        }}
      >
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-xl
                            transition-[color,background] duration-200 min-h-[44px]
                            ${active ? 'text-primary' : 'text-muted-vital'}`}
                style={active ? { background: 'rgba(61,125,255,0.10)' } : {}}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className="text-[10px] font-medium leading-none">{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
