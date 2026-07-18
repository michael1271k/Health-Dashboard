'use client'

import { useState } from 'react'
import { m, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import {
  useEraFilter, ERA_FILTER_META, ERA_FILTER_ORDER,
  SUB_PHASE_META, SUB_PHASE_ORDER, currentAutoPhase,
  type SubPhase, type SubPhaseSel,
} from '@/lib/era/eraFilter'

const GOLD = '#F5C15A'

/**
 * The global era pill row (Nutrition / Charts / Journey). Under the Helix 5.1
 * era a nested Phase selector shows ONLY the active phase ("Auto · Cut") as a
 * chip; tapping expands a horizontal liquid-glass slider of the other phases.
 */
export function EraFilterPills({ label = 'Era:' }: { label?: string }) {
  const { era, setEra, subPhase, setSubPhase } = useEraFilter()
  const auto = currentAutoPhase()
  const [open, setOpen] = useState(false)

  const resolved: SubPhase = subPhase === 'auto' ? auto : subPhase
  const resolvedColor = SUB_PHASE_META[resolved].color
  const options: SubPhaseSel[] = ['auto', ...SUB_PHASE_ORDER]

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
              style={active ? { color, borderColor: `${color}55`, background: `${color}1f`, boxShadow: `0 0 10px ${color}33` } : { color: '#9AA3C4', borderColor: 'transparent' }}>
              {text}
            </button>
          )
        })}
      </div>

      {/* Nested phase selector — collapsed to the active phase, expands on tap */}
      {era === 'axis' && (
        <div className="flex items-center gap-2 pl-3 ml-1 border-l border-white/[0.08] min-h-[34px]">
          <span className="text-fluid-xs text-muted">Phase:</span>
          <AnimatePresence mode="wait" initial={false}>
            {!open ? (
              <m.button
                key="collapsed"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors min-h-[32px]"
                style={{ color: resolvedColor, borderColor: `${resolvedColor}55`, background: `${resolvedColor}1f`, boxShadow: `0 0 10px ${resolvedColor}33` }}
                aria-label="Change phase"
              >
                {subPhase === 'auto' ? 'Auto · ' : ''}{SUB_PHASE_META[resolved].label}
                <ChevronDown className="w-3 h-3 opacity-70" aria-hidden="true" />
              </m.button>
            ) : (
              <m.div
                key="expanded"
                initial={{ opacity: 0, scaleX: 0.7 }} animate={{ opacity: 1, scaleX: 1 }} exit={{ opacity: 0, scaleX: 0.7 }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="flex items-center gap-1 rounded-full p-1 origin-left"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  backdropFilter: 'blur(16px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(160%)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 24px rgba(0,0,0,0.5)',
                }}
              >
                {options.map((opt) => {
                  const isAuto = opt === 'auto'
                  const meta = isAuto ? SUB_PHASE_META[auto] : SUB_PHASE_META[opt as SubPhase]
                  const active = subPhase === opt
                  const color = isAuto ? GOLD : meta.color
                  return (
                    <button key={opt}
                      onClick={() => { setSubPhase(opt); setOpen(false) }}
                      className="px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors min-h-[30px]"
                      style={active ? { color, background: `${color}26`, boxShadow: `0 0 8px ${color}44` } : { color: '#9AA3C4' }}>
                      {isAuto ? 'Auto' : meta.label}
                    </button>
                  )
                })}
              </m.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
