'use client'

import { DRAFT_STORAGE_KEY, peekSessionDraft, type SessionDraft } from '@/lib/sessions/draft'

/**
 * ── THE DRAFT, READ FROM OUTSIDE THE DECK ────────────────────────────────────
 *
 * `useSessionDraft` owns the live draft: it holds it in `useState`, mutates it
 * on every keystroke, and debounce-writes it to localStorage. That hook is
 * mounted exactly once, by `/session`.
 *
 * The minimised pill needs the same draft from the app shell, which is a
 * different tree that outlives `/session`. Calling `useSessionDraft()` there
 * would be the obvious move and the wrong one: the hook is stateful, so a
 * second call creates a SECOND independent copy. Two Reacts would each believe
 * they own the session, the deck's edits would never reach the pill, and the
 * pill's `hydrated` flag would race the deck's on every navigation.
 *
 * So the shell does not get a copy of the state. It gets a SUBSCRIPTION to the
 * storage the state is already written through — the one place both trees
 * agree on. `useSyncExternalStore` over this module is the whole mechanism.
 *
 * ── WHY A MANUAL NOTIFY AND NOT JUST `storage` EVENTS ────────────────────────
 * The `storage` event does not fire in the tab that performed the write — it
 * exists to tell OTHER tabs. Every write we care about happens in this tab, so
 * on its own that listener would deliver exactly nothing. It is kept anyway for
 * the desktop-PWA case of two windows open on the same account, but the load-
 * bearing path is `notifyDraftChanged()`, called by `useSessionDraft` at each
 * of its three write points.
 *
 * See `sync-external-stores`: a cache read during render that React cannot see
 * is how a component ends up showing a stale day forever. This is the same
 * class of bug, and this module is the fix rather than a repeat of it.
 */

type Listener = () => void

const listeners = new Set<Listener>()

/**
 * `getSnapshot` MUST return a referentially stable value when nothing changed,
 * or `useSyncExternalStore` re-renders forever. `peekSessionDraft()` parses
 * JSON and hands back a fresh object every call, so the parse is cached against
 * the raw string that produced it and only re-run when that string moves.
 */
let cachedRaw: string | null = null
let cachedDraft: SessionDraft | null = null
let primed = false

function readRaw(): string | null {
  try {
    return localStorage.getItem(DRAFT_STORAGE_KEY)
  } catch {
    return null
  }
}

export function getDraftSnapshot(): SessionDraft | null {
  if (typeof window === 'undefined') return null
  const raw = readRaw()
  if (primed && raw === cachedRaw) return cachedDraft
  cachedRaw = raw
  // Through `peekSessionDraft` rather than a bare JSON.parse, so a v1 draft is
  // migrated and a malformed one is rejected by the same rules the deck uses.
  cachedDraft = peekSessionDraft()
  primed = true
  return cachedDraft
}

/** Server render, and the first client render that must match it. */
export function getDraftServerSnapshot(): SessionDraft | null {
  return null
}

export function subscribeDraft(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Called by `useSessionDraft` after every write to `DRAFT_STORAGE_KEY`. The
 * cache is invalidated FIRST so a listener that reads during the notify sees
 * the new value rather than the one that triggered it.
 */
export function notifyDraftChanged(): void {
  primed = false
  for (const l of listeners) l()
}

if (typeof window !== 'undefined') {
  // Cross-tab only — see the note above on why this is not the main path.
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key !== DRAFT_STORAGE_KEY) return
    notifyDraftChanged()
  })
}
