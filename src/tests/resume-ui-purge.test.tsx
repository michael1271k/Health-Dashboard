import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ScheduleShortcut } from '@/components/day/ScheduleShortcut'
import { DRAFT_STORAGE_KEY } from '@/lib/sessions/draft'
import { notifyDraftChanged } from '@/lib/sessions/draftStore'

/**
 * ── ONE ANNOUNCEMENT PER RUNNING WORKOUT ────────────────────────────────────
 *
 * `LiveSessionPill` sits above the tab bar on every screen and says, with the
 * live volume and set count, that a session is running and where it is. Three
 * other surfaces used to say a version of the same thing, and two of them said
 * it WRONG: the Workout tab's "Resume session draft" card read a mount-time
 * photo of localStorage and went on offering a draft that had been committed
 * minutes earlier, and "Today's schedule — Upper B — log it" links to
 * `?template=`, which SEEDS a deck — i.e. offers to start the day again over
 * the top of the one you are in.
 *
 * These pin the absence. A regression here is not cosmetic: the shortcut is one
 * tap from replacing a live draft.
 *
 * A CLIENT render, deliberately. `getDraftServerSnapshot` returns null so that
 * SSR and the first client paint agree — localStorage does not exist on a
 * server — which means `renderToStaticMarkup` can never see a draft and would
 * pass this suite against a component that ignored one entirely.
 */
function html(node: React.ReactElement): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>).container.innerHTML
}

vi.mock('@/lib/hooks/useDayVault', () => ({ useDayVault: () => ({ data: { sessions: [] } }) }))
vi.mock('@/lib/programs', async (orig) => {
  const real = await orig<typeof import('@/lib/programs')>()
  return { ...real, scheduleDayFor: () => ({ dayKey: 'cb_a', label: 'Upper A', sub: 'Push focus' }) }
})

describe('the schedule shortcut stands down for a live session', () => {
  beforeEach(() => { localStorage.clear(); notifyDraftChanged() })

  it('offers the day when nothing is running', () => {
    expect(html(<ScheduleShortcut />)).toContain('log it')
  })

  it('renders nothing at all once a draft exists', () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      splitDay: 'upper_a', date: '2026-08-25', notes: '',
      startedAt: '2026-08-25T09:00:00.000Z', exercises: [],
    }))
    notifyDraftChanged()
    // Not "dimmed", not "changed to Resume" — absent. A second control for a
    // running workout is the thing being removed, not relabelled.
    expect(html(<ScheduleShortcut />)).toBe('')
  })
})
