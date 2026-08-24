import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LazyMotion, domMax } from 'framer-motion'
import { DRAFT_STORAGE_KEY, type SessionDraft } from '@/lib/sessions/draft'
import {
  getDraftSnapshot, getDraftServerSnapshot, notifyDraftChanged, subscribeDraft,
} from '@/lib/sessions/draftStore'

/**
 * ── THE MINIMISED WORKOUT ────────────────────────────────────────────────────
 *
 * The pill's job is to make a truth visible that was already true: the draft
 * autosaves, so leaving `/session` has never discarded anything. What it adds is
 * evidence and a way back.
 *
 * Two things about it are load-bearing and both fail silently, which is why they
 * are pinned here rather than left to a screenshot:
 *
 *   1. It reads the draft through `draftStore`, NOT through `useSessionDraft`.
 *      A second call to that hook would be a second copy of the state, and the
 *      deck's edits would never reach the shell. The store's `getSnapshot` must
 *      therefore be referentially stable, or `useSyncExternalStore` re-renders
 *      forever — a hang, not a wrong pixel.
 *   2. It must not render on `/session`, where it would sit on top of the deck
 *      it is offering to return you to.
 */

const pathname = vi.hoisted(() => ({ current: '/' }))
const pushed = vi.hoisted(() => ({ calls: [] as string[] }))

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: (href: string) => { pushed.calls.push(href) } }),
}))
// jsdom has no Wake Lock API; the hook feature-detects and no-ops, but the mock
// keeps this file about the pill rather than about navigator shims.
vi.mock('@/lib/hooks/useWakeLock', () => ({ useWakeLock: () => {} }))
vi.mock('@/lib/native/haptics', () => ({ tapLight: () => Promise.resolve() }))
// The pill counts records through the deck's own query + engine. jsdom has no
// network; an empty baseline set is the honest "nothing to beat yet" answer and
// keeps this file about the pill rather than about Supabase.
vi.mock('@/lib/hooks/useExerciseBaselines', () => ({
  useExerciseBaselines: () => ({ data: undefined }),
}))

const { LiveSessionPill } = await import('@/components/command-center/LiveSessionPill')

const DRAFT = {
  date: '2026-08-23',
  dayKey: 'cb_a',
  splitDay: 'Upper A',
  notes: '',
  startedAt: '2026-08-23T09:00:00.000Z',
  exercises: [{
    localId: 'e1',
    name: 'Incline DB Press',
    kind: 'lift',
    sets: [
      { weightKg: 40, reps: 11, done: true },
      { weightKg: 40, reps: 9, done: true },
    ],
  }],
} as unknown as SessionDraft

function put(d: SessionDraft | null) {
  if (d) localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(d))
  else localStorage.removeItem(DRAFT_STORAGE_KEY)
  notifyDraftChanged()
}

const ui = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <LazyMotion features={domMax}><LiveSessionPill /></LazyMotion>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  pathname.current = '/'
  pushed.calls = []
  put(null)
})
afterEach(cleanup)

describe('draftStore — the subscription the shell reads instead of a second hook', () => {
  it('returns the SAME object until the draft actually changes', () => {
    // The infinite-render guard. `peekSessionDraft` parses JSON and hands back a
    // fresh object every call; handing that straight to `useSyncExternalStore`
    // would tell React the value changed on every render, forever.
    put(DRAFT)
    const a = getDraftSnapshot()
    const b = getDraftSnapshot()
    expect(a).not.toBeNull()
    expect(a).toBe(b)
  })

  it('returns a NEW object once the stored draft moves', () => {
    put(DRAFT)
    const before = getDraftSnapshot()
    put({ ...DRAFT, splitDay: 'Upper B' } as unknown as SessionDraft)
    const after = getDraftSnapshot()
    expect(after).not.toBe(before)
    expect(after?.splitDay).toBe('Upper B')
  })

  it('is null on the server, so the first client render matches', () => {
    put(DRAFT)
    expect(getDraftServerSnapshot()).toBeNull()
  })

  it('notifies every subscriber, which is how the deck reaches the shell', () => {
    let hits = 0
    const off = subscribeDraft(() => { hits += 1 })
    put(DRAFT)
    put(null)
    expect(hits).toBe(2)
    off()
    put(DRAFT)
    expect(hits).toBe(2)
  })
})

describe('LiveSessionPill', () => {
  it('renders nothing when there is no draft', () => {
    ui()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('names the workout and reports its live totals', () => {
    put(DRAFT)
    ui()
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-label')).toContain('Upper A')
    expect(btn.textContent).toContain('Upper A')
    // Two completed sets, 40 kg x (11 + 9) = 800 kg.
    // Each Stat prints its unit in its own span (no literal space), the same
    // shape the collapsed bar uses.
    expect(btn.textContent).toContain('2sets')
    expect(btn.textContent).toContain('800')
    // Records are the third column, and read em-dash until one is claimed.
    expect(btn.textContent).toContain('PRs')
  })

  /**
   * Elapsed time was removed with its interval. The assertion is on the TIMER,
   * not on the glyph: a 20 s `setInterval` on a fixed element mounted on every
   * screen is the actual regression, and it is invisible in a screenshot.
   */
  it('runs no clock — the pill re-renders only when the draft moves', () => {
    const spy = vi.spyOn(globalThis, 'setInterval')
    put(DRAFT)
    ui()
    expect(spy).not.toHaveBeenCalled()
    expect(screen.getByRole('button').textContent).not.toMatch(/\d+\s*min/)
    spy.mockRestore()
  })

  it('takes you back to the deck', () => {
    put(DRAFT)
    ui()
    screen.getByRole('button').click()
    expect(pushed.calls).toEqual(['/session'])
  })

  /**
   * The gate. `/session` is the deck itself and `/session/[id]` is the report
   * for a session that was just committed — on neither does a "return to your
   * workout" bar mean anything, and on the deck it would cover the deck.
   */
  it('never renders on a /session route', () => {
    put(DRAFT)
    for (const p of ['/session', '/session?template=cb_a', '/session/abc-123']) {
      pathname.current = p
      const { unmount } = ui()
      expect(screen.queryByRole('button'), p).toBeNull()
      unmount()
    }
  })

  it('renders on the routes you actually visit mid-workout', () => {
    put(DRAFT)
    for (const p of ['/', '/workout', '/day/2026-08-16', '/report/abc', '/nutrition']) {
      pathname.current = p
      const { unmount } = ui()
      expect(screen.queryByRole('button'), p).not.toBeNull()
      unmount()
    }
  })

  /**
   * The pill floats above the tab bar, so the shell has to reserve room for it
   * the same way it does for `BottomNav`. Without the flag the last element on
   * every page scrolls to a stop underneath it.
   */
  it('declares itself to the chrome budget, and withdraws on unmount', () => {
    put(DRAFT)
    const { unmount } = ui()
    expect(document.documentElement.dataset.livePill).toBe('true')
    unmount()
    expect(document.documentElement.dataset.livePill).toBe('false')
  })

  it('claims no chrome when there is no draft', () => {
    ui()
    expect(document.documentElement.dataset.livePill).toBe('false')
  })
})
