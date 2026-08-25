'use client'

import { useSyncExternalStore } from 'react'
import { getDraftServerSnapshot, getDraftSnapshot, subscribeDraft } from '@/lib/sessions/draftStore'
import type { SessionDraft } from '@/lib/sessions/draft'

/**
 * The live session draft, from anywhere outside the deck.
 *
 * ── WHY THIS EXISTS AS A HOOK ────────────────────────────────────────────────
 * `LiveSessionPill` already read the draft this way and every other screen read
 * it with `useState(peekSessionDraft())` in a mount effect — a one-shot photo
 * of localStorage that never updated again. So the Workout tab kept offering
 * "Resume session draft" after the session had been committed and the draft
 * deleted, and kept offering "Log Upper A" while one was running, because
 * neither had any way to learn otherwise.
 *
 * `useSyncExternalStore` over `draftStore` is the subscription React can see.
 * See `sync-external-stores` for the class of bug the photo version is.
 */
export function useLiveDraft(): SessionDraft | null {
  return useSyncExternalStore(subscribeDraft, getDraftSnapshot, getDraftServerSnapshot)
}

/** Is a workout running right now? The question most callers actually have. */
export function useHasLiveDraft(): boolean {
  return useLiveDraft() !== null
}
