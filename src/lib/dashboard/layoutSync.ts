'use client'

/**
 * The dashboard arrangement's cloud copy.
 *
 * ── WHAT THIS IS FOR, AND WHAT IT IS NOT FOR ─────────────────────────────────
 * It is a BACKUP, not a live channel. The arrangement is still read out of
 * localStorage synchronously during render — that is what stops the grid
 * flashing its defaults for a network round-trip on every cold start — and this
 * module's whole job is that reinstalling the app does not lose it.
 *
 * ── LAST WRITE WINS, AND HERE THAT IS THE RIGHT RULE ─────────────────────────
 * Merging two layouts is not possible in any way a person would recognise as
 * their dashboard: there is no field-level identity to reconcile (slot ids are
 * generated, positions are an array index), so any "merge" is really a guess
 * that produces a third arrangement nobody chose. Last-write-wins is honest
 * about that, and it is the correct rule for this datum specifically because
 * there is only ever ONE editor — the same person, on a device that is either
 * more or less current. The loser of the comparison is never someone else's
 * work, it is an older copy of yourself.
 *
 * `updatedAt` is therefore stamped by `touchLayout` on every mutation and
 * carried in both copies. A fresh install's defaults carry 0, so any stored
 * remote beats them.
 *
 * ── AND WHY EVERY FAILURE HERE IS SILENT ─────────────────────────────────────
 * Signed out, offline, RLS refusing, the table not created yet: none of those
 * are conditions under which the user should be told their dashboard is broken,
 * because it is not — it is in localStorage, which is where it is read from.
 * Every path returns `null` or resolves, and the grid never learns the
 * difference. The one thing that must not happen is a rejected promise reaching
 * React and taking the page down with it.
 */

import { supabase } from '@/lib/supabase/client'
import {
  fromStored, serializeLayout, storedPayload,
  type DashboardLayout, type DashboardSurface,
} from './layout'

/** How long the grid waits after the last edit before pushing. */
export const PUSH_DEBOUNCE_MS = 1200

interface LayoutRow { layout: unknown }

/**
 * The stored arrangement for the signed-in user, or null.
 *
 * Null covers everything: no session, no row, no table, no network. The caller
 * has a perfectly good local layout in hand and null means "keep it".
 */
export async function fetchRemoteLayout(surface: DashboardSurface = 'phone'): Promise<DashboardLayout | null> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return null
    const { data, error } = await supabase
      .from('dashboard_layouts')
      .select('layout')
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (error || !data) return null
    const row = (data as unknown as LayoutRow).layout
    if (!row || typeof row !== 'object') return null
    // Through the same upgrade-and-reconcile path localStorage takes. A row
    // written by an older build is a v2 payload and has to be migrated, and a
    // row naming a widget this build deleted has to be cleaned — doing that in
    // one place is the only way the two sources cannot drift.
    // The row carries BOTH arrangements — see `serializeLayout`. Only the one
    // for this screen is returned; the other rides along untouched and is
    // written back on the next push.
    return fromStored(row as Parameters<typeof fromStored>[0], surface)
  } catch {
    return null
  }
}

/** Write the arrangement up. Resolves either way; the caller has nothing to do. */
export async function pushRemoteLayout(
  layout: DashboardLayout,
  surface: DashboardSurface = 'phone',
): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    await supabase
      .from('dashboard_layouts')
      .upsert(
        {
          user_id: auth.user.id,
          // The other surface's side comes from the LOCAL payload, which is the
          // only copy this device has of a screen it is not currently rendering.
          // Pushing without it would let a desktop edit delete the phone's
          // arrangement from the backup — the row is one jsonb blob.
          layout: serializeLayout(layout, surface, storedPayload()),
          updated_at: new Date(layout.updatedAt || Date.now()).toISOString(),
        } as never,
        { onConflict: 'user_id' },
      )
  } catch { /* see the module note: a failed backup is not a broken dashboard */ }
}

/**
 * Which of the two copies to render.
 *
 * Split out from the hook because it is the only part with a rule to get wrong,
 * and because "a fresh install adopts the cloud copy" is exactly the behaviour
 * the whole feature exists for and deserves an assertion rather than a
 * hand-test that needs an App Store round trip.
 *
 * Ties go to LOCAL. Two writes in the same millisecond is a clock artefact, and
 * on a tie the local copy is the one already on screen — adopting the remote
 * would repaint the grid to say the same thing.
 */
export function pickLayout(local: DashboardLayout, remote: DashboardLayout | null): DashboardLayout {
  if (!remote) return local
  return remote.updatedAt > local.updatedAt ? remote : local
}
