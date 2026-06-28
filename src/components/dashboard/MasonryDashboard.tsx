'use client'

import { useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import type { LucideIcon } from 'lucide-react'

export interface MasonryTile {
  id: string
  title: string
  icon: LucideIcon
  accent: string
  headline: React.ReactNode
  sub?: React.ReactNode
  detail: React.ReactNode
  footer?: React.ReactNode
}

/**
 * Fluid masonry hub for the mobile dashboard — variable-height glass tiles in a
 * CSS columns layout (Gym + Nutrition are their own distinct tiles). Each tile
 * shows a headline stat; tapping opens the full domain detail in a bottom sheet.
 */
export function MasonryDashboard({ tiles }: { tiles: MasonryTile[] }) {
  const [open, setOpen] = useState<MasonryTile | null>(null)
  return (
    <>
      <div className="columns-2 gap-3 [&>*]:mb-3">
        {tiles.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setOpen(t)}
              className="glass-card w-full text-left break-inside-avoid flex flex-col gap-1.5 p-3.5 active:scale-[0.98] transition-transform"
              style={{ borderColor: `${t.accent}33` }}
            >
              <div className="flex items-center gap-1.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: `${t.accent}22`, color: t.accent }}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="font-heading text-[11px] font-semibold text-text leading-none">{t.title}</span>
              </div>
              <div className="vital-number text-fluid-xl font-bold leading-tight" style={{ color: t.accent }}>{t.headline}</div>
              {t.sub && <div className="text-fluid-xs text-muted-vital leading-tight">{t.sub}</div>}
            </button>
          )
        })}
      </div>

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.title}>
        {open && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">{open.detail}</div>
            {open.footer && <p className="text-fluid-xs text-muted-vital">{open.footer}</p>}
          </div>
        )}
      </Sheet>
    </>
  )
}
