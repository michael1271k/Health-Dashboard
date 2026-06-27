'use client'

import { LOGGER_SPLITS, type SplitDay } from '@/lib/types/workout'

interface SplitPickerProps {
  value: SplitDay | null
  onChange: (day: SplitDay) => void
}

export function SplitPicker({ value, onChange }: SplitPickerProps) {
  return (
    <div role="group" aria-label="Select workout split">
      {/* 4 English-only split buttons in a single non-wrapping row */}
      <div className="grid grid-cols-4 gap-2">
        {LOGGER_SPLITS.map(({ day, label, color }) => {
          const isActive = value === day
          return (
            <button
              key={day}
              type="button"
              onClick={() => onChange(day)}
              aria-pressed={isActive}
              className={`glass-card flex items-center justify-center py-3 px-2 cursor-pointer
                          transition-all duration-200 text-sm font-semibold tracking-wide select-none
                          ${isActive ? '' : 'hover:bg-white/[0.04] hover:text-text'}`}
              style={isActive ? {
                background: `color-mix(in srgb, ${color} 12%, transparent)`,
                borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
                color,
                boxShadow: `0 0 16px ${color}30, inset 0 1px 0 rgba(255,255,255,0.06)`,
              } : { color: 'var(--color-muted-vital)' }}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
