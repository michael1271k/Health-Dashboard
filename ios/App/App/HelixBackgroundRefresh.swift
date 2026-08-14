import BackgroundTasks
import Foundation
import UIKit
import WidgetKit

/// Keeps the home screen moving while the app is closed.
///
/// ── THE PROBLEM, STATED PROPERLY ─────────────────────────────────────────────
/// "The widget goes stale unless I open the app" had two independent causes, and
/// fixing either alone would have left the symptom in place.
///
///   1. THE NUMBER WAS STALE AT THE SOURCE. `daily_scores.battery_pct` decays
///      with hours awake, so the stored row is wrong within an hour of being
///      written even if no new data arrives — and the only thing that ever
///      recomputed it was `POST /api/compute-score`, which only the app calls.
///      The widget was faithfully reporting an old row.
///      Fixed server-side: `/api/widget/snapshot` now recomputes today's score
///      before it answers (see `refreshTodayScore` in that route). A widget
///      refresh is a DATA refresh, with no app involvement whatsoever.
///
///   2. THE WIDGET ASKED RARELY, AND NOTHING COULD MAKE IT ASK SOONER. A
///      timeline is `.after(30 min)` and there is no way to push to a widget on
///      this account — App Groups and APNs `content-available` are both paid
///      capabilities. This file is the answer to that half: iOS wakes the app in
///      the background and the app asks WidgetKit to rebuild, which makes the
///      extension fetch, which makes the server recompute.
///
/// `Info.plist` has declared `BGTaskSchedulerPermittedIdentifiers` and the
/// `fetch` / `processing` background modes since the extension was added. It
/// promised this and nothing implemented it: no `BGTaskScheduler` call existed
/// anywhere in the project.
///
/// ── WHAT THIS HONESTLY CANNOT DO ─────────────────────────────────────────────
/// It cannot make HEALTHKIT data fresher. Steps, sleep, heart rate and body
/// composition reach the server through the JS ingest pipeline, and `/api/ingest`
/// is JWT-only by deliberate decision — the opaque-token path was removed. A
/// background wake has no JWT and no running webview, so it cannot ingest. The
/// chain it does close is everything the SERVER can answer on its own: battery
/// decay, the daily score, nutrition, water, logged sessions, weigh-ins synced
/// from another device, and the plan/schedule.
enum HelixBackgroundRefresh {
  /// Must match `BGTaskSchedulerPermittedIdentifiers` in Info.plist exactly. A
  /// mismatch is not a warning — `BGTaskScheduler.register` raises, and it does
  /// so at launch.
  static let taskIdentifier = "app.helix.health.refresh"

  /// The floor iOS is asked to respect. It is a REQUEST, not a schedule: the
  /// system decides when (or whether) to run it from usage patterns, battery and
  /// network. Asking for 15 minutes and being given two hours is normal and
  /// correct; asking for two hours and being given two hours is a widget that
  /// updates twice a day.
  static let earliestInterval: TimeInterval = 15 * 60

  /// Register the handler. MUST be called before `didFinishLaunching` returns —
  /// registering later raises, because iOS may deliver a pending task
  /// immediately after launch and needs the handler already in place.
  static func register() {
    BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
      handle(task)
    }
  }

  /// Ask for the next wake. Idempotent: submitting again simply replaces the
  /// pending request, which is what makes it safe to call on every background.
  static func schedule() {
    let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
    request.earliestBeginDate = Date(timeIntervalSinceNow: earliestInterval)
    do {
      try BGTaskScheduler.shared.submit(request)
    } catch {
      // Simulators refuse to schedule, and a device in Low Power Mode may too.
      // Neither is a failure worth surfacing — the widget's own timeline is
      // still running underneath all of this.
      NSLog("[HELIX] background refresh not scheduled: \(error.localizedDescription)")
    }
  }

  private static func handle(_ task: BGTask) {
    // Chain the NEXT request first. A background task that returns without
    // rescheduling is the last one that ever runs, and the failure is invisible
    // — the widget simply stops being fresh a few hours later and nothing says
    // why.
    schedule()

    task.expirationHandler = {
      task.setTaskCompleted(success: false)
    }

    // The whole job. The extension does the network call itself — it has the
    // token and its own container; the app has neither on its behalf.
    WidgetCenter.shared.reloadAllTimelines()
    task.setTaskCompleted(success: true)
  }

  /// Reload immediately. Called when the app goes to the background, because the
  /// foreground sync that just ran is the single biggest change to what the
  /// widget would show, and waiting out its timeline throws that away.
  static func reloadNow() {
    WidgetCenter.shared.reloadAllTimelines()
  }
}
