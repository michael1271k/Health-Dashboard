'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { bottomNavItems as navItems } from '@/lib/nav-items'

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden
                 bg-surface/90 backdrop-blur-md border-t border-border"
    >
      <ul className="flex items-center justify-around px-2 py-2 safe-area-inset-bottom" role="list">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl
                            cursor-pointer transition-[color,opacity] duration-200 min-h-[44px] min-w-[44px]
                            ${active ? 'text-primary' : 'text-muted-vital'}`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
