import { describe, it, expect } from 'vitest'
import { PROGRAMS } from '@/lib/programs'
import { buildCommitPayload, type SessionDraft } from '@/lib/sessions/draft'
import { payloadToTemplate, templateToDraft } from '@/lib/sessions/routineTemplate'

/**
 * ── A REORDER HAS TO SURVIVE THE SESSION IT HAPPENED IN ──────────────────────
 *
 * Dragging an exercise changes one array in a draft that lives in localStorage.
 * For that to mean anything it has to reach three places, through two hops that
 * nothing was asserting:
 *
 *   deck order → `exercise_order` on every row        → the session report
 *               → `routine_templates.payload`         → the next deck
 *                                                     → Settings' routine list
 *
 * Both hops are pure functions, so the whole chain is testable without a
 * database — and it needs to be, because the failure is silent. A reorder that
 * did not persist looks exactly like a reorder you did not make.
 */

const cbB = PROGRAMS.onyx5.days.find((d) => d.key === 'cb_b')!

/** Three exercises off the real program, in the order the deck seeds them. */
const NAMES = cbB.exercises.slice(0, 3).map((e) => e.name)

function draftIn(order: string[]): SessionDraft {
  return {
    date: '2026-08-21', dayKey: 'cb_b', splitDay: 'Chest & Back B',
    title: cbB.label, notes: '',
    // `buildCommitPayload` derives `endedAt` from this; without it the payload
    // throws on an invalid date rather than telling you what it needed.
    startedAt: '2026-08-21T18:00:00',
    exercises: order.map((name, i) => ({
      localId: `ex${i}`, name, kind: 'lift' as const,
      sets: [{ weightKg: 40, reps: 10, done: true }],
    })),
  } as unknown as SessionDraft
}

/** What `useSessionDraft.reorder` does to the array. */
function reorder(draft: SessionDraft, from: number, to: number): SessionDraft {
  const next = [...draft.exercises]
  next.splice(to, 0, ...next.splice(from, 1))
  return { ...draft, exercises: next } as SessionDraft
}

describe('a dragged exercise keeps its new position', () => {
  const moved = reorder(draftIn(NAMES), 2, 0)   // last exercise dragged to the top
  const wanted = [NAMES[2], NAMES[0], NAMES[1]]

  it('reaches the committed rows, which is what the report reads', () => {
    const payload = buildCommitPayload(moved)
    // `exerciseOrder` counts STRENGTH exercises only, densely from 0.
    const byOrder = [...payload.sets]
      .sort((a, b) => (a.exerciseOrder ?? 0) - (b.exerciseOrder ?? 0))
      .map((s) => s.exerciseName)
    expect([...new Set(byOrder)]).toEqual(wanted)
  })

  it('reaches the stored template, which is what Settings lists', () => {
    const payload = buildCommitPayload(moved)
    const template = payloadToTemplate(payload.sets, payload.cardio ?? [])!
    expect([...template.exercises].sort((a, b) => a.order - b.order).map((e) => e.name))
      .toEqual(wanted)
  })

  it('reaches the NEXT deck, which is what you see the following week', () => {
    const payload = buildCommitPayload(moved)
    const template = payloadToTemplate(payload.sets, payload.cardio ?? [])!
    const next = templateToDraft(template, cbB, '2026-08-28', 'cb_b')
    expect(next.exercises.filter((e) => e.kind !== 'cardio').map((e) => e.name)).toEqual(wanted)
  })

  it('does not persist an order nobody chose', () => {
    // The control: an untouched deck round-trips as itself. Without this, a
    // chain that always returned the program's own order would pass every
    // assertion above.
    const payload = buildCommitPayload(draftIn(NAMES))
    const template = payloadToTemplate(payload.sets, payload.cardio ?? [])!
    const next = templateToDraft(template, cbB, '2026-08-28', 'cb_b')
    expect(next.exercises.filter((e) => e.kind !== 'cardio').map((e) => e.name)).toEqual(NAMES)
  })
})
