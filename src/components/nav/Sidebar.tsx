'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ApexMark } from '@/components/ApexMark'
import { navItems } from '@/lib/nav-items'

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-50 hidden md:flex flex-col w-64
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
        <ApexMark className="w-7 h-7 shrink-0" />
        <div className="leading-none">
          <span className="font-heading font-bold text-xl tracking-widest text-text">APEX</span>
          <p className="text-[10px] text-muted-vital tracking-wider mt-0.5 uppercase">
            Performance OS
          </p>
        </div>
      </div>

      {/* ── Navigation items */}
      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1" role="list">
          {navItems.map(({ href, icon: Icon, label }) => {
            const active = pathname === href
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-label={label}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium
                              transition-[color,background,box-shadow,border-color] duration-200 cursor-pointer
                              ${active
                                ? 'glass-card--accent text-primary'
                                : 'text-muted-vital hover:text-text hover:bg-white/[0.04]'
                              }`}
                  style={active ? {
                    background: 'color-mix(in srgb, #3D7DFF 12%, transparent)',
                    borderColor: 'color-mix(in srgb, #3D7DFF 35%, transparent)',
                    boxShadow: '0 0 16px rgba(61,125,255,0.12)',
                  } : {}}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* ── Footer hint */}
      <div className="px-5 py-4 border-t border-white/[0.06]">
        <p className="text-[11px] text-muted-vital leading-relaxed">
          Engineer Your Ascent.
        </p>
      </div>
    </aside>
  )
}
