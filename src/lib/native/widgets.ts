'use client'

import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Tell WidgetKit to rebuild its timelines.
 *
 * ── WHY THE APP HAS TO ASK ───────────────────────────────────────────────────
 * A widget cannot be pushed to. There is no App Group on a free Apple team, so
 * the app cannot hand the extension a payload, and there is no APNs
 * `content-available` either. The extension's only channel is its own network
 * call to `/api/widget/snapshot`, and the only thing that decides WHEN it makes
 * that call is its timeline.
 *
 * `WidgetCenter.shared.reloadAllTimelines()` is the one lever the app has: it
 * discards the schedule and asks for a new one immediately. The right moments to
 * pull it are the moments after which the server's answer has definitely
 * changed — a session commit, a HealthKit sync, a score recompute — because
 * otherwise the widget waits out its half-hour holding numbers that are already
 * stale on the server it just read from.
 *
 * Silently inert on the web and on a build without the plugin. A widget that
 * refreshes half an hour later is a small loss; an exception thrown out of a
 * commit handler is not.
 */
interface HelixWidgetsPlugin {
  reload(options?: { kinds?: string[] }): Promise<void>
}

const plugin = registerPlugin<HelixWidgetsPlugin>('HelixWidgets')

/**
 * Reload widget timelines. No argument means all of them.
 *
 * ── WHY NAMING KINDS IS WORTH THE TROUBLE ────────────────────────────────────
 * WidgetKit budgets reloads PER KIND — roughly 40–70 a day each. A blanket
 * reload therefore spends the Training widget's whole allowance on water logs
 * and macro edits, and then has nothing left at the moment a session commits,
 * which is the one moment Training had to be fresh. Naming the kinds a write
 * actually changes leaves each family's budget for the events that move it.
 *
 * The default stays "all" deliberately: a caller that has not thought about
 * which kinds it touches gets the old, safe behaviour rather than a silently
 * narrower one. See `widgetKinds.ts` for how the list is kept honest against
 * Swift.
 *
 * Silently inert on the web and on a build without the plugin. A widget that
 * refreshes half an hour late is a small loss; an exception thrown out of a
 * commit handler is not.
 */
export async function reloadWidgets(kinds?: readonly string[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    // An empty array would be indistinguishable from "none" on the Swift side,
    // so it is normalised away here rather than guarded for there.
    await plugin.reload(kinds && kinds.length ? { kinds: [...kinds] } : undefined)
  } catch {
    /* plugin missing (older build) — the timeline still refreshes on its own */
  }
}
