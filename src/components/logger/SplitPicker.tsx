'use client'

import { PPL_SPLITS, type SplitDay } from '@/lib/types/workout'

interface SplitPickerProps {
  value: SplitDay | null
  onChange: (day: SplitDay) => void
}

export function SplitPicker({ value, onChange }: SplitPickerProps) {
  return (
    <div role="group" aria-label="Select PPL split">
      <div className="grid grid-cols-3 gap-3">
        {(Object.entries(PPL_SPLITS) as [SplitDay, typeof PPL_SPLITS[SplitDay]][]).map(
          ([day, config]) => {
            const isActive = value === day
            return (
              <button
                key={day}
                type="button"
                onClick={() => onChange(day)}
                aria-pressed={isActive}
                className={`vital-card flex flex-col items-center gap-1 py-5 cursor-pointer
                            transition-[color,opacity,box-shadow,border-color] duration-200
                            ${isActive
                              ? 'border-[1.5px] shadow-[0_0_12px_rgba(0,229,160,0.25)]'
                              : 'hover:border-border/60 hover:bg-surface-2'
                            }`}
                style={isActive ? { borderColor: config.color, color: config.color } : {}}
              >
                <span className="text-xl font-heading font-bold">
                  {config.label}
                </span>
                <span
                  className="text-sm font-medium"
                  dir="rtl"
                  lang="he"
                  style={{ color: config.color }}
                >
                  {config.labelHe}
                </span>
              </button>
            )
          },
        )}
      </div>
    </div>
  )
}
