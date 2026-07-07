'use client'

import { Check } from 'lucide-react'
import { SUPPLEMENT_PROTOCOL } from '@/lib/supplements'
import { useSupplements, useToggleSupplement } from '@/lib/hooks/useSupplements'

/** Sleek daily supplement timeline — tap to check off; saves to the DB (logical day). */
export function SupplementChecklist() {
  const { data: taken } = useSupplements()
  const toggle = useToggleSupplement()

  return (
    <div className="space-y-4">
      {SUPPLEMENT_PROTOCOL.map((slot, si) => (
        <div key={slot.key} className="relative pl-6">
          {si < SUPPLEMENT_PROTOCOL.length - 1 && <span className="absolute left-[6px] top-5 -bottom-4 w-px bg-white/10" aria-hidden="true" />}
          <span className="absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2" style={{ borderColor: slot.accent, background: `${slot.accent}22` }} aria-hidden="true" />
          <div className="flex items-baseline gap-2 mb-2">
            <span className="helix-num text-fluid-sm font-bold" style={{ color: slot.accent }}>{slot.time}</span>
            <span className="text-fluid-xs text-muted-vital uppercase tracking-wide">{slot.label}</span>
          </div>
          <div className="space-y-1.5">
            {slot.items.map((item) => {
              const on = taken?.has(item.key) ?? false
              return (
                <button
                  key={item.key}
                  onClick={() => toggle.mutate({ itemKey: item.key, taken: !on })}
                  aria-pressed={on}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 border text-left transition-colors min-h-[48px]"
                  style={{ borderColor: on ? `${slot.accent}55` : 'rgba(255,255,255,0.06)', background: on ? `${slot.accent}14` : 'rgba(255,255,255,0.02)' }}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-md border-2 shrink-0" style={{ borderColor: on ? slot.accent : 'rgba(255,255,255,0.25)', background: on ? slot.accent : 'transparent' }}>
                    {on && <Check className="h-3 w-3 text-bg" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 text-fluid-sm font-medium text-text">{item.name}</span>
                  <span className="helix-num text-fluid-xs text-muted-vital shrink-0">{item.dose}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
