'use client'

const PRESETS: Array<[string, number]> = [
  ['1W', 7], ['2W', 14], ['3W', 21], ['1M', 30], ['2M', 60], ['3M', 90],
]

interface RangeSelectorProps {
  value: number
  onChange: (days: number) => void
}

/** Glass segmented range presets controlling the charts' x-axis domain. */
export function RangeSelector({ value, onChange }: RangeSelectorProps) {
  return (
    <div className="flex gap-1 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.06] w-full sm:w-fit overflow-x-auto no-scrollbar">
      {PRESETS.map(([label, days]) => {
        const active = value === days
        return (
          <button
            key={label}
            onClick={() => onChange(days)}
            aria-pressed={active}
            className={`flex-1 sm:flex-none min-w-fit px-3.5 py-1.5 rounded-xl text-fluid-xs font-semibold min-h-[40px] transition-colors
              ${active ? 'bg-primary/15 text-primary border border-primary/30' : 'text-muted-vital hover:text-text border border-transparent'}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
