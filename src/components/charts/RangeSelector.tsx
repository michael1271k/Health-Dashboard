'use client'

const PRESETS: Array<[string, number]> = [
  ['1W', 7], ['2W', 14], ['1M', 30], ['2M', 60], ['3M', 90], ['4M', 120], ['5M', 150], ['6M', 180],
]

interface RangeSelectorProps {
  value: number
  onChange: (days: number) => void
  orientation?: 'horizontal' | 'vertical'
}

/** Glass segmented range presets — horizontal pills or a vertical rail. */
export function RangeSelector({ value, onChange, orientation = 'horizontal' }: RangeSelectorProps) {
  const vertical = orientation === 'vertical'
  return (
    <div className={`flex gap-1 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.06] no-scrollbar
      ${vertical ? 'flex-col w-fit' : 'w-full sm:w-fit overflow-x-auto'}`}>
      {PRESETS.map(([label, days]) => {
        const active = value === days
        return (
          <button
            key={label}
            onClick={() => onChange(days)}
            aria-pressed={active}
            className={`min-w-fit px-3.5 py-1.5 rounded-xl text-fluid-xs font-semibold min-h-[40px] transition-colors
              ${vertical ? 'w-full' : 'flex-1 sm:flex-none'}
              ${active ? 'bg-primary/15 text-primary border border-primary/30' : 'text-muted-vital hover:text-text border border-transparent'}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
