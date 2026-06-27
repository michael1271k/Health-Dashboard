'use client'

import type { ReactNode } from 'react'

export interface TableColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
}

interface DataTableProps<T> {
  columns: TableColumn<T>[]
  rows: T[]
  keyExtractor: (row: T) => string
  emptyMessage?: string
  isLoading?: boolean
}

export function DataTable<T>({
  columns,
  rows,
  keyExtractor,
  emptyMessage = 'No data yet.',
  isLoading = false,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 rounded-xl animate-pulse"
            style={{ background: 'color-mix(in srgb, #1A2236 80%, transparent)' }} />
        ))}
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="glass-card p-8 text-center text-muted-vital text-sm">
        {emptyMessage}
      </div>
    )
  }

  return (
    <>
      {/* Desktop: standard table */}
      <div className="glass-card overflow-hidden hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-xs font-semibold text-muted-vital uppercase tracking-wider
                                ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                                ${col.className ?? ''}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={keyExtractor(row)}
                  className={`border-b border-white/[0.04] transition-colors duration-150 hover:bg-white/[0.025]
                              ${i === rows.length - 1 ? 'border-0' : ''}`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-text vital-number
                                  ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                                  ${col.className ?? ''}`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: stacked cards */}
      <div className="space-y-2 sm:hidden">
        {rows.map((row) => (
          <div key={keyExtractor(row)} className="glass-card p-4 space-y-2">
            {columns.map((col) => (
              <div key={col.key} className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-vital shrink-0">{col.header}</span>
                <span className="text-sm text-text vital-number text-right">
                  {col.render(row)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}
