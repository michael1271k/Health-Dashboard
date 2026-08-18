'use client'

import { useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Segmented } from '@/components/ui/Segmented'
import { exerciseColor } from '@/lib/theme/muscleHue'
import { ExerciseHistoryBody } from './ExerciseHistoryBody'
import { ExerciseLedger } from './ExerciseLedger'

const TABS = [
  { value: 'summary' as const, label: 'Summary' },
  { value: 'history' as const, label: 'History' },
]
type Tab = (typeof TABS)[number]['value']

/**
 * The per-exercise deep-dive as a drawer — opened from the session report,
 * where you are looking at one lift and want its history without leaving.
 *
 * The body moved to ExerciseHistoryBody so the Exercise Library can render the
 * same thing as a full page. This is deliberately a thin wrapper: the two
 * contexts differ in how you got there and how you leave, not in what they show
 * — which is why the Summary/History split lives in both rather than only on
 * the route. Tapping an exercise means the same thing wherever you tap it.
 */
export function ExerciseHistorySheet({ exerciseId, exerciseName, open, onClose }: {
  exerciseId: string | null
  exerciseName: string
  open: boolean
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('summary')
  const accent = exerciseColor(exerciseName)

  return (
    <Sheet open={open} onClose={onClose} title={exerciseName} accent={accent}>
      <div className="space-y-3">
        <Segmented options={TABS} value={tab} onChange={setTab} accent={accent} size="sm" label="Exercise view" />
        {/* `open ? id : null` keeps the query from firing for a closed sheet. */}
        {tab === 'summary'
          ? <ExerciseHistoryBody exerciseId={open ? exerciseId : null} exerciseName={exerciseName} accent={accent} />
          : <ExerciseLedger exerciseId={open ? exerciseId : null} exerciseName={exerciseName} accent={accent} />}
      </div>
    </Sheet>
  )
}
