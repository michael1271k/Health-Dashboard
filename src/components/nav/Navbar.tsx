'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, BarChart3, Dumbbell, Settings } from 'lucide-react'

const navItems = [
  { href: '/', icon: Activity, label: 'Dashboard' },
  { href: '/charts', icon: BarChart3, label: 'Charts' },
  { href: '/log', icon: Dumbbell, label: 'Log' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export function Navbar() {
  const pathname = usePathname()

  return (
    <header className="fixed top-4 left-4 right-4 z-50 hidden md:flex items-center justify-between
                       bg-surface/80 backdrop-blur-md border border-border rounded-2xl px-5 py-3">
      <div className="flex items-center gap-2">
        <Activity className="w-5 h-5 text-primary" aria-hidden="true" />
        <span className="font-heading font-bold text-lg">VITAL</span>
      </div>

      <nav aria-label="Main navigation">
        <ul className="flex items-center gap-1" role="list">
          {navItems.map(({ href, icon: Icon, label }) => {
            const active = pathname === href
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-label={label}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium
                              cursor-pointer transition-[color,opacity,background-color] duration-200
                              ${active
                                ? 'bg-primary/15 text-primary'
                                : 'text-muted-vital hover:text-text hover:bg-surface-2'
                              }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  <span className="hidden lg:inline">{label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </header>
  )
}
