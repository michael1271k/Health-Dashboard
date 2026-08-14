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
  reload(): Promise<void>
}

const plugin = registerPlugin<HelixWidgetsPlugin>('HelixWidgets')

export async function reloadWidgets(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await plugin.reload()
  } catch {
    /* plugin missing (older build) — the timeline still refreshes on its own */
  }
}
