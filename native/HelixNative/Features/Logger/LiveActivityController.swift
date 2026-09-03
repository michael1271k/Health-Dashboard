import Foundation
// ── WHY `@preconcurrency` ───────────────────────────────────────────────────
// `Activity` is imported as a plain non-Sendable class whose `update` and `end`
// are `nonisolated async`. Calling either from this main-actor-isolated type is
// therefore "sending a main-actor-isolated value to a nonisolated method",
// which Swift 6 rejects — and there is no arrangement of actors that fixes it,
// because the object cannot legally leave the main actor and the method cannot
// legally be called on it anywhere else.
//
// The alternative was `nonisolated(unsafe)` storage, which asserts the same
// thing while ALSO switching off checking on our own property. This scopes the
// downgrade to the SDK that has not been audited, which is what the attribute
// is for. Every call below is made from the main actor, and ActivityKit is
// documented as safe to call from it.
@preconcurrency import ActivityKit
import HelixCore

/// Starts, feeds and ends the workout Live Activity.
///
/// ── WHY IT IS A PLAIN CLASS AND NOT PART OF THE MODEL ───────────────────────
/// `LoggerModel` is the state of the session and it has to keep working when
/// there is no Live Activity — activities are off by default for a fresh
/// install, unavailable on a Mac, and refused when the system is under pressure.
/// Every method here is best-effort by construction, and a screen whose state
/// machine sits behind an API that can decline is a screen that stops logging
/// when the Lock Screen is busy.
@MainActor
final class LiveActivityController {

    private var activity: Activity<HelixWorkoutAttributes>?

    /// Cheap enough to ask every time and it can change while the app runs —
    /// the user can revoke Live Activities in Settings mid-session.
    private var isEnabled: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    func start(model: LoggerModel) {
        guard isEnabled, activity == nil else { return }
        let attributes = HelixWorkoutAttributes(
            title: model.day.label,
            startedAt: model.startedAt
        )
        do {
            activity = try Activity.request(
                attributes: attributes,
                content: .init(state: Self.state(from: model), staleDate: nil)
            )
        } catch {
            // Declined, unsupported, or over the system's activity budget. The
            // workout is unaffected; there is nothing here worth surfacing to
            // someone standing at a machine.
            activity = nil
        }
    }

    func update(model: LoggerModel) {
        guard let activity else {
            // The session may have started before the user enabled activities.
            start(model: model)
            return
        }
        Task {
            await activity.update(.init(state: Self.state(from: model), staleDate: nil))
        }
    }

    func end() {
        guard let activity else { return }
        self.activity = nil
        Task {
            // `.immediate`: the card is about a session that is over, and a
            // Lock Screen still counting a finished workout up is worse than no
            // card at all.
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    /// Compose the card. Every formatting decision the deck already made is
    /// carried across as text rather than re-derived on the far side.
    private static func state(from model: LoggerModel) -> HelixWorkoutAttributes.ContentState {
        let current = model.currentSet

        var load = ""
        if let row = current?.row {
            if let kg = row.weightKg, let reps = row.reps {
                load = "\(HelixFormat.kg(kg)) kg × \(reps)"
            } else if let kg = row.weightKg {
                // Weight-only while the reps are still being typed — which is
                // the state the card is in during every single set.
                load = "\(HelixFormat.kg(kg)) kg"
            }
        }

        return .init(
            exercise: current?.exercise.name ?? "Session complete",
            setLabel: current.map { "Set \($0.ordinal) of \($0.total)" } ?? "",
            load: load,
            rpe: current?.row.rpe.map { "RPE \(HelixFormat.rpe($0))" } ?? "",
            lastTime: current?.row.previous ?? "",
            volume: "\(HelixFormat.volume(model.totalVolumeKg)) kg",
            sets: "\(model.completedSets)",
            records: model.recordCount,
            restEndsAt: model.restEndsAt,
            spark: model.volumeCurve,
            accent: model.day.accent
        )
    }
}
