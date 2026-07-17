'use client'

import {
  useEraFilter, ERA_FILTER_META, ERA_FILTER_ORDER,
  SUB_PHASE_META, SUB_PHASE_ORDER, currentAutoPhase,
} from '@/lib/era/eraFilter'

/**
 * The global era pill row — one shared component so every surface (Nutrition,
 * Charts, Journey) presents the identical filter in the identical order. When
 * the Helix 5.1 era is active, a nested sub-phase row (Cut / Maint / Bulk +
 * Auto) appears; 'Auto' tracks the current program phase.
 */
export function EraFilterPills({ label = 'Era:' }: { label?: string }) {
  const { era, setEra, subPhase, setSubPhase } = useEraFilter()
  const auto = currentAutoPhase()

  return (
    <div className="space-y-2">
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

      {/* Nested sub-phase row — only under the Helix 5.1 era */}
      {era === 'axis' && (
        <div className="flex items-center gap-1.5 flex-wrap pl-3 ml-1 border-l border-white/[0.08]">
          <span className="text-fluid-xs text-muted mr-1">Phase:</span>
          <button
            onClick={() => setSubPhase('auto')}
            aria-pressed={subPhase === 'auto'}
            title={`Follows your current program phase (${SUB_PHASE_META[auto].label})`}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors min-h-[32px]"
            style={subPhase === 'auto'
              ? { color: '#E8C57A', borderColor: '#E8C57A55', background: '#E8C57A1f' }
              : { color: '#8B97B2', borderColor: 'transparent' }}
          >
            Auto{subPhase === 'auto' ? ` · ${SUB_PHASE_META[auto].label}` : ''}
          </button>
          {SUB_PHASE_ORDER.map((p) => {
            const { label: text, color } = SUB_PHASE_META[p]
            const active = subPhase === p
            const isAutoMatch = subPhase === 'auto' && auto === p
            return (
              <button key={p} onClick={() => setSubPhase(p)} aria-pressed={active}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors min-h-[32px]"
                style={active
                  ? { color, borderColor: `${color}55`, background: `${color}1f`, boxShadow: `0 0 8px ${color}33` }
                  : isAutoMatch
                    ? { color, borderColor: `${color}33`, background: 'transparent' }
                    : { color: '#8B97B2', borderColor: 'transparent' }}>
                {text}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
