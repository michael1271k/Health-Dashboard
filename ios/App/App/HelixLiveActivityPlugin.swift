import Foundation
import Capacitor
import ActivityKit

/// `HelixLiveActivity.start / update / end / isSupported` — the deck's handle on
/// the Lock Screen and the Dynamic Island.
///
/// ── WHY THE APP DRIVES THIS AND THE OTHER WIDGETS DRIVE THEMSELVES ───────────
/// `HelixWidgetBridge` can do exactly two things for a home-screen widget: make
/// the server's answer fresher, and ask WidgetKit to re-fetch it. It cannot hand
/// the extension any data, because App Groups are a paid capability and this is
/// a free personal team (the argument is written out in `HelixSnapshot.swift`).
///
/// A Live Activity is the exception, and it is worth being precise about why:
/// its content state travels through ActivityKit's own IPC, from `Activity.update`
/// here to the extension's view body, with no shared container anywhere on the
/// path. So the running workout — the one thing in this app that changes by the
/// second and cannot survive a half-hour timeline — is the one thing the app is
/// allowed to push directly.
///
/// ── WHAT THIS DOES NOT DO ────────────────────────────────────────────────────
/// No push tokens, no remote updates. Updating a Live Activity over APNs needs a
/// paid program and a push-notification entitlement; every update here is local,
/// which is all a workout in your hand requires. `pushType: nil` on `request` is
/// that decision, stated once.
///
/// Registration is explicit in `HelixViewController.capacitorDidLoad()` —
/// Capacitor ≥6 does not auto-discover app-local plugins, and a plugin that
/// compiles but is never attached to the bridge rejects every call silently.
///
/// ── EVERY ActivityKit CALL IS HOPPED TO THE MAIN QUEUE ───────────────────────
/// Capacitor dispatches plugin methods onto a BACKGROUND queue by default, and
/// ActivityKit is a UI-lifecycle framework: `Activity.request`, `.update` and
/// `.end` all drive a system-hosted view. Called off the main thread they do not
/// throw and they do not log — `request` returns an `Activity` handle, the
/// promise resolves `{ started: true }`, and no card is ever presented. That is
/// the exact failure this fixes, and it is invisible from the web layer, which
/// is why `startWorkoutActivity` now also leaves a breadcrumb.
///
/// The hop is at the top of each `@objc` method rather than around the
/// `Activity` line, so the availability check, the authorization read and the
/// request all happen on the same thread and cannot disagree about whether
/// activities were enabled a microsecond ago.
@objc(HelixLiveActivityPlugin)
public class HelixLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
  // CAPBridgedPlugin conformance in Swift rather than through the ObjC
  // CAP_PLUGIN macro, for the reason documented in HelixHealth.swift: an
  // ObjC-category conformance in a .m file nothing references can be
  // dead-stripped by the linker.
  public let identifier = "HelixLiveActivityPlugin"
  public let jsName = "HelixLiveActivity"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
  ]

  /// The one activity this app ever runs. There is one of you and one workout.
  ///
  /// Held as `Any?` rather than as `Activity<HelixWorkoutAttributes>?` because a
  /// stored property cannot carry an `@available` annotation — the cast happens
  /// inside each gated method instead.
  private var current: Any?

  // MARK: - Support

  /// Three separate reasons this can be false, and the caller only needs the
  /// answer: the OS is older than 16.1, the device has no Live Activity support,
  /// or the user has switched them off for Helix in Settings. The web layer
  /// treats all three as "do not try", which is correct for all three.
  @objc func isSupported(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      if #available(iOS 16.1, *) {
        call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
      } else {
        call.resolve(["supported": false])
      }
    }
  }

  // MARK: - Lifecycle

  @objc func start(_ call: CAPPluginCall) {
    DispatchQueue.main.async { self.startOnMain(call) }
  }

  private func startOnMain(_ call: CAPPluginCall) {
    guard #available(iOS 16.1, *) else {
      // Not an error. An older phone has no Lock Screen surface for this, and a
      // rejected promise on every session start would be a red herring in every
      // console log the web layer ever produces.
      call.resolve(["started": false, "reason": "unsupported"])
      return
    }
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      call.resolve(["started": false, "reason": "disabled"])
      return
    }

    // Starting while one is already running is a RESTART, not a second
    // activity. The deck calls `start` on mount and mount happens again after
    // every jetsam-and-reload (see `black-screen-and-reloads`) — without this,
    // one workout would accumulate a stack of Lock Screen cards.
    endCurrent(dismissImmediately: true)

    let title = call.getString("title") ?? "Workout"
    // Milliseconds, because that is what `Date.now()` hands the bridge. An ISO
    // string would have to be parsed on both sides and would disagree about
    // fractional seconds.
    let startedMs = call.getDouble("startedAt") ?? (Date().timeIntervalSince1970 * 1000)
    let attributes = HelixWorkoutAttributes(
      title: title,
      startedAt: Date(timeIntervalSince1970: startedMs / 1000)
    )

    do {
      let activity = try Activity.request(
        attributes: attributes,
        contentState: contentState(from: call),
        // Local updates only — see the header. A push token would need a paid
        // program and an entitlement this project does not have.
        pushType: nil
      )
      current = activity
      call.resolve(["started": true, "id": activity.id])
    } catch {
      // `Activity.request` throws for reasons the user can fix (too many
      // activities running, authorization revoked between the check above and
      // this line), so the message is worth carrying back rather than
      // flattening to a boolean.
      call.resolve(["started": false, "reason": error.localizedDescription])
    }
  }

  @objc func update(_ call: CAPPluginCall) {
    DispatchQueue.main.async { self.updateOnMain(call) }
  }

  private func updateOnMain(_ call: CAPPluginCall) {
    guard #available(iOS 16.1, *), let activity = current as? Activity<HelixWorkoutAttributes> else {
      call.resolve(["updated": false])
      return
    }
    let state = contentState(from: call)
    Task {
      // `alertConfiguration: nil`. An alerting update lights the screen and
      // fires a haptic, and this updates every time you tick a set — thirty
      // interruptions a session for information you are already looking at.
      // The deck's own haptics are the feedback; this is a readout.
      if #available(iOS 16.2, *) {
        await activity.update(ActivityContent(state: state, staleDate: nil))
      } else {
        await activity.update(using: state)
      }
      call.resolve(["updated": true])
    }
  }

  @objc func end(_ call: CAPPluginCall) {
    DispatchQueue.main.async { self.endOnMain(call) }
  }

  private func endOnMain(_ call: CAPPluginCall) {
    guard #available(iOS 16.1, *) else {
      call.resolve(["ended": false])
      return
    }
    // A workout that has just been committed should leave the Lock Screen at
    // once. The default policy lingers for up to four hours, which would leave
    // a card offering the "next set" of a session that no longer exists.
    endCurrent(dismissImmediately: true)
    call.resolve(["ended": true])
  }

  // MARK: - Internals

  @available(iOS 16.1, *)
  private func endCurrent(dismissImmediately: Bool) {
    guard let activity = current as? Activity<HelixWorkoutAttributes> else { return }
    current = nil
    Task {
      if #available(iOS 16.2, *) {
        await activity.end(nil, dismissalPolicy: dismissImmediately ? .immediate : .default)
      } else {
        await activity.end(dismissalPolicy: dismissImmediately ? .immediate : .default)
      }
    }
  }

  /// One decoder for `start` and `update`, so the two can never disagree about
  /// what a missing field means.
  ///
  /// Every string defaults to empty rather than to a placeholder: the views
  /// treat "" as "draw nothing", which is the honest rendering of an absent
  /// fact on a surface this small. See `LastTimeRow`.
  @available(iOS 16.1, *)
  private func contentState(from call: CAPPluginCall) -> HelixWorkoutAttributes.ContentState {
    HelixWorkoutAttributes.ContentState(
      exercise: call.getString("exercise") ?? "",
      setLabel: call.getString("setLabel") ?? "",
      lastTime: call.getString("lastTime") ?? "",
      lastRpe: call.getString("lastRpe") ?? "",
      load: call.getString("load") ?? "",
      rpe: call.getString("rpe") ?? "",
      volume: call.getString("volume") ?? "0",
      sets: call.getString("sets") ?? "0",
      records: call.getInt("records") ?? 0,
      // An absent or malformed series draws no chart, rather than a flat line
      // at zero — which would claim the session has done no work.
      spark: (call.getArray("spark") as? [NSNumber])?.map(\.doubleValue) ?? [],
      // EMBER, the app's default accent, when the day has no colour of its own.
      accent: call.getInt("accent") ?? 0xE0703C
    )
  }
}
