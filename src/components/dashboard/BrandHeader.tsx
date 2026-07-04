'use client'

import { ApexMark } from '@/components/ApexMark'

/**
 * Premium scientific header: the glowing "APEX" wordmark paired with the
 * "Human Performance Systems" descriptor and a kinesiology subsystem tagline.
 */
export function BrandHeader() {
  const today = new Intl.DateTimeFormat('en-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  return (
    <header className="space-y-1.5">
      <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
        <h1 className="flex items-center gap-2.5 text-fluid-3xl leading-none">
          <ApexMark className="h-[0.95em] w-[0.95em] shrink-0" />
          <span className="apex-wordmark font-heading font-extrabold tracking-tight">APEX</span>
        </h1>
        <span className="font-heading text-fluid-sm font-semibold text-muted-vital uppercase tracking-[0.18em]">Human Performance Systems</span>
      </div>
      <p className="text-fluid-xs text-muted-vital tracking-wide">Sleep · Load · Nutrition · Adaptation <span className="text-text/60">· {today}</span></p>
    </header>
  )
}
