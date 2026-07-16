'use client'

import { useEraFilter, ERA_FILTER_META, ERA_FILTER_ORDER } from '@/lib/era/eraFilter'

/**
 * The global era pill row — one shared component so every surface (Nutrition,
 * Charts, Journey) presents the identical filter in the identical order.
 */
export function EraFilterPills({ label = 'Era:' }: { label?: string }) {
  const { era, setEra } = useEraFilter()
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {label && <span className="text-fluid-xs text-muted mr-1">{label}</span>}
      {ERA_FILTER_ORDER.map((k) => {
        const { label: text, color } = ERA_FILTER_META[k]
        const active = era === k
        return (
          <button key={k} onClick={() => setEra(k)} aria-pressed={active}
            className="px-3 py-1.5 rounded-xl text-fluid-xs font-semibold border transition-colors min-h-[36px]"
            style={active ? { color, borderColor: `${color}55`, background: `${color}1f`, boxShadow: `0 0 10px ${color}33` } : { color: '#8B97B2', borderColor: 'transparent' }}>
            {text}
          </button>
        )
      })}
    </div>
  )
}
