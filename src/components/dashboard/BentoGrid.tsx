import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface BentoGridProps {
  children: ReactNode
  className?: string
}

export function BentoGrid({ children, className }: BentoGridProps) {
  return (
    <div
      className={cn(
        'grid gap-4',
        // Mobile: single column
        // Tablet: 2 cols
        // Desktop: 4-column bento layout
        'grid-cols-1 md:grid-cols-2 xl:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface BentoCellProps {
  children: ReactNode
  className?: string
  span?: 1 | 2 | 3 | 4
  rowSpan?: 1 | 2
}

export function BentoCell({ children, className, span = 1, rowSpan = 1 }: BentoCellProps) {
  return (
    <div
      className={cn(
        {
          'md:col-span-1': span === 1,
          'md:col-span-2': span === 2,
          'col-span-1 md:col-span-3': span === 3,
          'col-span-1 md:col-span-full xl:col-span-4': span === 4,
        },
        {
          'row-span-1': rowSpan === 1,
          'row-span-2': rowSpan === 2,
        },
        className,
      )}
    >
      {children}
    </div>
  )
}
