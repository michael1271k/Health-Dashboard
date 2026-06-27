'use client'

import { DataTable, type TableColumn } from '@/components/data/DataTable'
import { useDailyLogs, type DailyLog } from '@/lib/hooks/useNutrition'

// Cut goals for coloring (from CUT_PRESET)
const CALORIE_GOAL  = 1935
const PROTEIN_GOAL  = 180
const SCORE_GOOD    = 80

function fmtNum(v: number | null, decimals = 0, unit = '') {
  if (v === null) return <span className="text-muted-vital">—</span>
  return (
    <span>
      {v.toFixed(decimals)}
      {unit && <span className="text-xs text-muted-vital ml-0.5">{unit}</span>}
    </span>
  )
}

function coloredVal(v: number | null, goal: number, unit: string, higherIsBetter = true) {
  if (v === null) return <span className="text-muted-vital">—</span>
  const ratio = v / goal
  const color = higherIsBetter
    ? ratio >= 0.95 ? '#2DD4A7' : ratio >= 0.75 ? '#FFB020' : '#FF4D6D'
    : ratio <= 1.05 ? '#2DD4A7' : ratio <= 1.20 ? '#FFB020' : '#FF4D6D'
  return (
    <span className="font-semibold" style={{ color }}>
      {Math.round(v)}
      <span className="text-xs font-normal text-muted-vital ml-0.5">{unit}</span>
    </span>
  )
}

const COLUMNS: TableColumn<DailyLog>[] = [
  {
    key: 'date',
    header: 'Date',
    render: (r) => (
      <span className="text-text font-medium">
        {new Date(r.date + 'T00:00:00').toLocaleDateString('en-IL', {
          weekday: 'short', month: 'short', day: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'calories',
    header: 'Calories',
    align: 'right',
    render: (r) => coloredVal(r.calories, CALORIE_GOAL, 'kcal', false),
  },
  {
    key: 'protein',
    header: 'Protein',
    align: 'right',
    render: (r) => coloredVal(r.proteinG, PROTEIN_GOAL, 'g', true),
  },
  {
    key: 'carbs',
    header: 'Carbs',
    align: 'right',
    render: (r) => fmtNum(r.carbsG, 0, 'g'),
  },
  {
    key: 'fat',
    header: 'Fat',
    align: 'right',
    render: (r) => fmtNum(r.fatG, 0, 'g'),
  },
  {
    key: 'steps',
    header: 'Steps',
    align: 'right',
    render: (r) => fmtNum(r.steps, 0, ''),
  },
  {
    key: 'score',
    header: 'Score',
    align: 'right',
    render: (r) => {
      if (r.score === null) return <span className="text-muted-vital">—</span>
      const color = r.score >= SCORE_GOOD ? '#2DD4A7' : r.score >= 60 ? '#FFB020' : '#FF4D6D'
      return <span className="font-bold tabular-nums" style={{ color }}>{r.score}</span>
    },
  },
  {
    key: 'battery',
    header: 'Battery',
    align: 'right',
    render: (r) => {
      if (r.batteryPct === null) return <span className="text-muted-vital">—</span>
      const color = r.batteryPct >= 50 ? '#2DD4A7' : r.batteryPct >= 30 ? '#FFB020' : '#FF4D6D'
      return <span className="tabular-nums" style={{ color }}>{r.batteryPct}%</span>
    },
  },
]

export default function NutritionPage() {
  const { data: logs, isLoading } = useDailyLogs(30)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-text">Nutrition</h1>
        <p className="text-muted-vital text-sm mt-0.5">Daily logs — last 30 days from Apple Health</p>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={logs ?? []}
        keyExtractor={(r) => r.date}
        isLoading={isLoading}
        emptyMessage="No nutrition data yet. Sync Apple Health via Health Auto Export."
      />
    </div>
  )
}
