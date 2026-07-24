'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { m } from 'framer-motion'
import { navItems } from '@/lib/nav-items'

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-50 hidden md:flex flex-col w-64 xl:w-72
                 border-r border-white/[0.06]"
      style={{
        background: 'rgba(255,255,255,0.025)',
        backdropFilter: 'blur(28px) saturate(160%)',
        WebkitBackdropFilter: 'blur(28px) saturate(160%)',
        boxShadow: '4px 0 40px rgba(0,0,0,0.35), inset -1px 0 0 rgba(255,255,255,0.05)',
      }}
    >
      {/* ── Logo + wordmark */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-white/[0.06]">
        <Image src="/icon-192.png" width={32} height={32} alt="" priority
          className="w-8 h-8 shrink-0 rounded-xl ring-1 ring-white/10" />
        <div className="leading-none">
          <span className="font-heading font-bold text-xl tracking-widest text-text">HELIX</span>
          <p className="text-[10px] text-muted tracking-wider mt-0.5 uppercase">
            HELIX-5
          </p>
        </div>
      </div>

      {/* ── Navigation items */}
      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1" role="list">
          {navItems.map(({ href, icon: Icon, label }) => {
            const active = (pathname === href || (href === '/pathfinder' && (pathname.startsWith('/day') || pathname.startsWith('/session'))))
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-label={label}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center gap-3 px-4 py-2.5 xl:py-3 rounded-xl text-sm xl:text-[15px] font-medium
                              transition-colors duration-200 cursor-pointer
                              ${active ? 'text-primary' : 'text-muted hover:text-text hover:bg-white/[0.04]'}`}
                >
                  {/* Sliding active indicator — glides between tabs */}
                  {active && (
                    <m.span
                      layoutId="sidebar-active"
                      className="absolute inset-0 rounded-xl"
                      style={{
                        background: 'color-mix(in srgb, #E2683A 12%, transparent)',
                        border: '1px solid color-mix(in srgb, #E2683A 35%, transparent)',
                        boxShadow: '0 0 16px rgba(139,92,246,0.14)',
                      }}
                      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                      aria-hidden="true"
                    />
                  )}
                  <Icon className="relative z-10 w-[18px] h-[18px] xl:w-5 xl:h-5 shrink-0" aria-hidden="true" />
                  <span className="relative z-10">{label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* ── Footer hint */}
      <div className="px-5 py-4 border-t border-white/[0.06]">
        <p className="text-[11px] text-muted leading-relaxed">
          Stimulus · Recovery · Adaptation
        </p>
      </div>
    </aside>
  )
}
