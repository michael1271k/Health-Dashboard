import Foundation
import Capacitor
#if os(iOS)
import ActivityKit
#endif

/**
 * Live Activity control for a running session — lock screen and Dynamic Island.
 *
 * Registered explicitly in `HelixViewController.capacitorDidLoad()`, and
 * conforming to `CAPBridgedPlugin` in Swift rather than via the ObjC
 * `CAP_PLUGIN` macro, for the same reason `HealthkitPlugin` does: a category
 * conformance in a .m file nothing references can be dead-stripped, and the
 * registration then silently does nothing.
 *
 * ── EVERY METHOD IS SAFE TO CALL ON ANY DEVICE ───────────────────────────────
 * Live Activities need iOS 16.1+ and can be disabled per-app in Settings, so
 * `isSupported` reports both and every other method resolves rather than
 * rejects when unavailable. Logging a workout must never fail because a
 * decoration could not start.
 */
@objc public class HelixLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HelixLiveActivityPlugin"
    public let jsName = "HelixLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    /// At most one session runs at a time, so one handle is the whole registry.
    /// Held as `Any?` so the property compiles on SDKs without ActivityKit.
    private var current: Any?

    @objc func isSupported(_ call: CAPPluginCall) {
        #if os(iOS)
        if #available(iOS 16.1, *) {
            call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
            return
        }
        #endif
        call.resolve(["supported": false])
    }

    @objc func start(_ call: CAPPluginCall) {
        #if os(iOS)
        if #available(iOS 16.1, *) {
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                call.resolve(["started": false, "reason": "disabled"]); return
            }
            // Starting twice would leave the first orphaned on the lock screen
            // until its staleDate — resuming a draft after a force-quit does
            // exactly that, so an existing activity is updated, never doubled.
            if current != nil { update(call); return }

            let attributes = HelixSessionAttributes(
                dayLabel: call.getString("dayLabel") ?? "Session",
                startedAt: Date()
            )
            do {
                let activity = try Activity.request(
                    attributes: attributes,
                    content: .init(state: state(from: call), staleDate: staleDate()),
                    pushType: nil          // all updates are local; no APNs token
                )
                current = activity
                call.resolve(["started": true, "id": activity.id])
            } catch {
                // The most common failure is the per-app activity limit, which
                // is not worth failing a workout over.
                call.resolve(["started": false, "reason": error.localizedDescription])
            }
            return
        }
        #endif
        call.resolve(["started": false, "reason": "unsupported"])
    }

    @objc func update(_ call: CAPPluginCall) {
        #if os(iOS)
        if #available(iOS 16.1, *), let activity = current as? Activity<HelixSessionAttributes> {
            let content = ActivityContent(state: state(from: call), staleDate: staleDate())
            Task { await activity.update(content) }
            call.resolve(["updated": true])
            return
        }
        #endif
        call.resolve(["updated": false])
    }

    @objc func end(_ call: CAPPluginCall) {
        #if os(iOS)
        if #available(iOS 16.1, *), let activity = current as? Activity<HelixSessionAttributes> {
            let final = ActivityContent(state: state(from: call), staleDate: nil)
            Task { await activity.end(final, dismissalPolicy: .immediate) }
            current = nil
            call.resolve(["ended": true])
            return
        }
        #endif
        current = nil
        call.resolve(["ended": false])
    }

    #if os(iOS)
    @available(iOS 16.1, *)
    private func state(from call: CAPPluginCall) -> HelixSessionAttributes.ContentState {
        // `restEndsAt` arrives as epoch MILLISECONDS: it is produced by
        // Date.now() + restMs on the JS side, and sending a duration instead
        // would put clock-skew between the two runtimes into the countdown.
        let restMs = call.getDouble("restEndsAt")
        return .init(
            exercise: call.getString("exercise") ?? "",
            setsDone: call.getInt("setsDone") ?? 0,
            setsPlanned: call.getInt("setsPlanned") ?? 0,
            lastSet: call.getString("lastSet"),
            prCount: call.getInt("prCount") ?? 0,
            restEndsAt: restMs.map { Date(timeIntervalSince1970: $0 / 1000) }
        )
    }

    /// Go grey rather than lie. If the app is killed mid-session the Activity
    /// would otherwise sit there all night showing the set you were on.
    @available(iOS 16.1, *)
    private func staleDate() -> Date { Date().addingTimeInterval(2 * 60 * 60) }
    #endif
}
