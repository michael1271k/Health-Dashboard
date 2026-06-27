'use client'

import Link from 'next/link'
import { DataTable, type TableColumn } from '@/components/data/DataTable'
import { useWorkoutHistory, type WorkoutSessionRow } from '@/lib/hooks/useWorkoutHistory'
import { Check, Dumbbell } from 'lucide-react'

const COLUMNS: TableColumn<WorkoutSessionRow>[] = [
  {
    key: 'date',
    header: 'Date',
    render: (r) => (
      <div>
        <span className="text-text font-medium">
          {new Date(r.startedAt).toLocaleDateString('en-IL', {
            weekday: 'short', month: 'short', day: 'numeric',
          })}
        </span>
        <div className="text-[11px] text-muted-vital mt-0.5">
          {r.isoWeek.replace('-', ' ')}
        </div>
      </div>
    ),
  },
  {
    key: 'split',
    header: 'Split',
    render: (r) => (
      <span className="text-sm font-bold" style={{ color: r.splitColor }}>
        {r.splitLabel}
      </span>
    ),
  },
  {
    key: 'volume',
    header: 'Volume',
    align: 'right',
    render: (r) =>
      r.totalVolumeKg !== null ? (
        <span className="vital-number font-semibold text-text">
          {Math.round(r.totalVolumeKg).toLocaleString()}
          <span className="text-xs font-normal text-muted-vital ml-0.5">kg</span>
        </span>
      ) : (
        <span className="text-muted-vital">—</span>
      ),
  },
  {
    key: 'notes',
    header: 'Notes',
    render: (r) =>
      r.notes ? (
        <span
          className="text-xs text-muted-vital line-clamp-1 max-w-[180px]"
          dir="auto"
          title={r.notes}
        >
          {r.notes}
        </span>
      ) : (
        <span className="text-muted-vital">—</span>
      ),
  },
  {
    key: 'notion',
    header: 'Notion',
    align: 'center',
    render: (r) =>
      r.notionSynced ? (
        <Check className="w-4 h-4 text-primary mx-auto" aria-label="Synced to Notion" />
      ) : (
        <span className="text-muted-vital text-xs">—</span>
      ),
  },
]

export default function WorkoutHistoryPage() {
  const { data: sessions, isLoading } = useWorkoutHistory()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text">Workout History</h1>
          <p className="text-muted-vital text-sm mt-0.5">Last 40 sessions — volume, splits, Notion sync</p>
        </div>
        <Link href="/log" className="btn-primary text-sm gap-2">
          <Dumbbell className="w-4 h-4" aria-hidden="true" />
          Log Workout
        </Link>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={sessions ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyMessage="No sessions yet. Log your first workout!"
      />
    </div>
  )
}
