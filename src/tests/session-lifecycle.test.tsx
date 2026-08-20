import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReloadHome } from '@/components/providers/ReloadHome'
import { useSessionDraft } from '@/lib/hooks/useSessionDraft'
import { DRAFT_STORAGE_KEY, type SessionDraft } from '@/lib/sessions/draft'

/**
 * ── THE IDLE BLACK SCREEN, IN THE TWO PLACES IT IS TESTABLE ──────────────────
 *
 * The failure is native: iOS jetsams a backgrounded WKWebView's content process
 * and Capacitor answers with `webView.reload()` against a remote url. Most of
 * the defence lives where jsdom cannot reach it (the bundled `offline.html`,
 * the wake lock, `server.errorPath`). Two pieces do NOT, and both of them are
 * behaviours a well-meaning refactor would quietly undo:
 *
 *   · a recovery reload must not navigate the user off their live session;
 *   · the draft must be on disk before the process can be taken away.
 */

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

function asNavigationType(type: 'reload' | 'navigate') {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue(
    [{ type } as unknown as PerformanceEntry],
  )
}

// `splitDay` is not decoration — `sanitizeDraft` rejects a draft without it,
// and a rejected draft reads as "no session in progress".
const DRAFT = {
  date: '2026-08-20', splitDay: 'Upper A', dayKey: 'upper_a', notes: '', startedAt: '2026-08-20T18:00:00',
  exercises: [{ localId: 'ex0', name: 'Barbell Bench Press', kind: 'lift', sets: [{ weightKg: 60, reps: 8 }] }],
} as unknown as SessionDraft

beforeEach(() => {
  replace.mockClear()
  localStorage.clear()
  window.history.replaceState({}, '', '/session')
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('a recovery reload does not take the deck away', () => {
  it('stays put when a live draft exists', () => {
    // This is the real-world case: the phone was locked mid-set, iOS killed the
    // webview, Capacitor reloaded — arriving here as navigation type 'reload',
    // indistinguishable from a Cmd-R the user never pressed.
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(DRAFT))
    asNavigationType('reload')
    act(() => { render(<ReloadHome />) })
    expect(replace, 'a mid-session recovery reload bounced the user to the dashboard').not.toHaveBeenCalled()
  })

  it('still bounces home on a deliberate reload with no session open', () => {
    // The guard the file was written for has to survive the exception added to
    // it — otherwise a hard reload re-instantiates a deeply nested surface.
    asNavigationType('reload')
    act(() => { render(<ReloadHome />) })
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('leaves a fresh navigation alone', () => {
    asNavigationType('navigate')
    act(() => { render(<ReloadHome />) })
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('the draft is on disk before the process can be taken away', () => {
  function mountStore() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return renderHook(() => useSessionDraft(), {
      wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    })
  }

  it('writes through on pagehide instead of waiting out the debounce', () => {
    const { result } = mountStore()
    act(() => { result.current.start(DRAFT) })
    // An edit lands in state and schedules a 500 ms write. On iOS the phone can
    // be locked and the webview's content process killed inside that window —
    // which is exactly how a set you had already typed came back missing.
    act(() => { result.current.updateSet('ex0', 0, { reps: 9 }) })
    expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!).exercises[0].sets[0].reps,
      'the debounce has not fired yet — that is the premise of this test').toBe(8)

    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!).exercises[0].sets[0].reps,
      'the last edit was lost when the page went away').toBe(9)
  })

  it('writes through when the app is backgrounded', () => {
    const { result } = mountStore()
    act(() => { result.current.start(DRAFT) })
    act(() => { result.current.updateSet('ex0', 0, { reps: 7 }) })

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!).exercises[0].sets[0].reps).toBe(7)
  })
})
