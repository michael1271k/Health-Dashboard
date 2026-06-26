import type { SaveWorkoutPayload } from '@/lib/types/workout'
import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints'

export interface NotionSessionProperties {
  Date: { date: { start: string } }
  Split: { select: { name: string } }
  Volume: { number: number }
  Sets: { number: number }
  Notes: { rich_text: Array<{ text: { content: string } }> }
}

export function formatSessionForNotion(
  payload: SaveWorkoutPayload,
  totalVolumeKg: number,
): NotionSessionProperties {
  const dateStr = payload.startedAt.slice(0, 10)
  const splitLabel = payload.splitDay.charAt(0).toUpperCase() + payload.splitDay.slice(1)

  return {
    Date: { date: { start: dateStr } },
    Split: { select: { name: splitLabel } },
    Volume: { number: Math.round(totalVolumeKg) },
    Sets: { number: payload.sets.length },
    Notes: {
      rich_text: payload.notes
        ? [{ text: { content: payload.notes } }]
        : [],
    },
  }
}

export function formatSetsAsBlocks(payload: SaveWorkoutPayload): BlockObjectRequest[] {
  // Group sets by exercise
  const byExercise = new Map<string, typeof payload.sets>()
  for (const set of payload.sets) {
    const existing = byExercise.get(set.exerciseName) ?? []
    existing.push(set)
    byExercise.set(set.exerciseName, existing)
  }

  const blocks: BlockObjectRequest[] = []
  for (const [exerciseName, sets] of byExercise) {
    // Exercise heading
    blocks.push({
      type: 'heading_3',
      heading_3: {
        rich_text: [{ type: 'text', text: { content: exerciseName } }],
        color: 'default',
      },
    })
    // Sets as bulleted list
    for (const s of sets) {
      const rpeStr = s.rpe != null ? ` @ RPE ${s.rpe}` : ''
      const content = `Set ${s.setNumber}: ${s.weightKg}kg × ${s.reps}${rpeStr}`
      blocks.push({
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content } }],
          color: 'default',
        },
      })
    }
  }
  return blocks
}
