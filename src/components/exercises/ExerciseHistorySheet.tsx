'use client'

import { Sheet } from '@/components/ui/Sheet'
import { ExerciseHistoryBody } from './ExerciseHistoryBody'

/**
 * The per-exercise deep-dive as a drawer — opened from the session report,
 * where you are looking at one lift and want its history without leaving.
 *
 * The body moved to ExerciseHistoryBody so the Exercise Library can render the
 * same thing as a full page. This is deliberately a thin wrapper: the two
 * contexts differ in how you got there and how you leave, not in what they show.
 */
export function ExerciseHistorySheet({ exerciseId, exerciseName, open, onClose }: {
  exerciseId: string | null
  exerciseName: string
  open: boolean
  onClose: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={exerciseName}>
      {/* `open ? id : null` keeps the query from firing for a closed sheet. */}
      <ExerciseHistoryBody exerciseId={open ? exerciseId : null} exerciseName={exerciseName} />
    </Sheet>
  )
}
