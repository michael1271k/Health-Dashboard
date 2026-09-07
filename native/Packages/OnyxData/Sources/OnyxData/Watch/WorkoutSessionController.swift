#if os(watchOS)
import Foundation
import HealthKit
import Observation

/// The `HKWorkoutSession` the whole watch app sits inside.
///
/// ── IT IS NOT A HEART-RATE FEATURE. IT IS THE RUNTIME ───────────────────────
/// Without a running workout session, watchOS suspends this app within seconds
/// of the wrist dropping. The rest countdown stops, the haptic at zero never
/// fires, and raising your wrist gets a cold launch instead of the set you were
/// on. Every screen in `OnyxWatch` assumes it is still running while you are
/// under a bar, and this is the only thing that makes that true.
///
/// It needs `WKBackgroundModes: [workout-processing]` in the target's
/// `Info.plist`. The entitlement is `com.apple.developer.healthkit` and the two
/// usage strings; all four are in `project.yml`.
///
/// Heart rate and active energy are the second-order benefit — `SessionMetrics`
/// already has somewhere to put them, and `closeSession` already carries
/// `avgBpm`/`calories` to the server.
///
/// ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
/// No route, no segments, no interval events. A strength session is one
/// continuous block as far as HealthKit is concerned; the set structure lives in
/// `set_events` where it can be folded, and duplicating it as workout events
/// would be a second history nobody reads.
///
/// `NSObject` because `HKWorkoutSessionDelegate` and
/// `HKLiveWorkoutBuilderDelegate` both inherit `NSObjectProtocol`, which Swift
/// cannot satisfy without the base class.
@MainActor
@Observable
public final class WorkoutSessionController: NSObject {

    /// Live heart rate in beats per minute, or nil before the first sample.
    ///
    /// The first sample takes several seconds to arrive — the sensor has to
    /// settle — and a view that draws `0` in the meantime is claiming a reading
    /// it does not have. Nil renders as a dash.
    public private(set) var heartRate: Int?
    /// Active energy for the session so far, kilocalories.
    public private(set) var activeCalories: Int?
    /// Average heart rate across the whole session, which is what
    /// `workout_sessions.avg_bpm` stores — not the last sample.
    public private(set) var averageHeartRate: Int?
    public private(set) var isRunning = false
    /// The last thing that went wrong, for a diagnostics row. Not shown mid-set:
    /// a person under a bar cannot act on it.
    public private(set) var lastError: String?

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    public override init() { super.init() }

    /// Ask for the types this app reads and writes.
    ///
    /// ── THE WRITE HALF IS WHAT MAKES THE SESSION LEGAL ──────────────────────
    /// `HKWorkoutSession` needs share access to `HKObjectType.workoutType()`;
    /// without it `beginCollection` fails and the app has no runtime. Heart rate
    /// and active energy are read so the hero can show them, and are written by
    /// `finishWorkout` as samples attached to the workout.
    ///
    /// Called once, from the watch app's first launch. A denial is not fatal to
    /// LOGGING — the log is a local database and does not care — but it costs
    /// the background runtime, so the caller shows it plainly.
    public func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let share: Set<HKSampleType> = [HKObjectType.workoutType()]
        let read: Set<HKObjectType> = [
            HKObjectType.workoutType(),
            HKQuantityType(.heartRate),
            HKQuantityType(.activeEnergyBurned),
        ]
        try await store.requestAuthorization(toShare: share, read: read)
    }

    /// Start the session. Idempotent — a second call while one is running is a
    /// no-op rather than a second session, which HealthKit would refuse and
    /// which would leave the app with a builder it no longer owns.
    public func start(startDate: Date = Date()) {
        guard !isRunning, HKHealthStore.isHealthDataAvailable() else { return }

        let configuration = HKWorkoutConfiguration()
        // The category the rings and the Fitness app file it under. Indoor
        // because a gym is, and because it tells HealthKit not to expect GPS.
        configuration.activityType = .traditionalStrengthTraining
        configuration.locationType = .indoor

        do {
            let session = try HKWorkoutSession(healthStore: store, configuration: configuration)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: configuration)
            session.delegate = self
            builder.delegate = self

            self.session = session
            self.builder = builder

            session.startActivity(with: startDate)
            builder.beginCollection(withStart: startDate) { [weak self] _, error in
                guard let error else { return }
                Task { @MainActor in self?.lastError = error.localizedDescription }
            }
            isRunning = true
        } catch {
            lastError = error.localizedDescription
            // Deliberately not rethrown. A watch that cannot start a workout
            // session can still log every set into its own store and hand them
            // to the phone; it simply loses the background runtime. Refusing to
            // open the logger over it would be the worse failure.
        }
    }

    /// End the session and write the `HKWorkout`.
    ///
    /// Awaited rather than fire-and-forget: the caller closes the local session
    /// row straight afterwards and wants `averageHeartRate` and
    /// `activeCalories` to have settled, because those are what reach
    /// `workout_sessions.avg_bpm` and `.calories_burned`.
    ///
    /// Errors are swallowed into `lastError` for the same reason `start` does:
    /// a workout that will not save to Health must not stop the training log
    /// from closing. The sets are the record; the `HKWorkout` is a courtesy to
    /// the rings.
    @discardableResult
    public func end(endDate: Date = Date()) async -> SessionMetricsSample {
        guard let session, let builder else { return sample() }
        isRunning = false
        session.end()
        await withCheckedContinuation { continuation in
            builder.endCollection(withEnd: endDate) { _, error in
                if let error {
                    Task { @MainActor in self.lastError = error.localizedDescription }
                }
                continuation.resume()
            }
        }
        await withCheckedContinuation { continuation in
            builder.finishWorkout { _, error in
                if let error {
                    Task { @MainActor in self.lastError = error.localizedDescription }
                }
                continuation.resume()
            }
        }
        self.session = nil
        self.builder = nil
        return sample()
    }

    /// Stop without writing anything to Health — the discard path.
    public func cancel() {
        guard let session else { return }
        isRunning = false
        session.end()
        builder?.discardWorkout()
        self.session = nil
        self.builder = nil
        heartRate = nil
        activeCalories = nil
        averageHeartRate = nil
    }

    private func sample() -> SessionMetricsSample {
        SessionMetricsSample(avgBpm: averageHeartRate, calories: activeCalories)
    }

    fileprivate func absorb(_ types: Set<HKSampleType>, from builder: HKLiveWorkoutBuilder) {
        for type in types {
            guard let quantityType = type as? HKQuantityType,
                  let statistics = builder.statistics(for: quantityType)
            else { continue }

            switch quantityType {
            case HKQuantityType(.heartRate):
                let unit = HKUnit.count().unitDivided(by: .minute())
                // `mostRecentQuantity` for the live number and
                // `averageQuantity` for the one that is stored: the hero shows
                // what your heart is doing now, and `avg_bpm` is a fact about
                // the whole session. Storing the last sample as the average is
                // how a workout ends up recorded at whatever your heart rate
                // happened to be while you were putting the plates away.
                if let now = statistics.mostRecentQuantity()?.doubleValue(for: unit) {
                    heartRate = Int(now.rounded())
                }
                if let mean = statistics.averageQuantity()?.doubleValue(for: unit) {
                    averageHeartRate = Int(mean.rounded())
                }
            case HKQuantityType(.activeEnergyBurned):
                if let total = statistics.sumQuantity()?.doubleValue(for: .kilocalorie()) {
                    activeCalories = Int(total.rounded())
                }
            default:
                continue
            }
        }
    }
}

/// What a finished workout session knows that the training log does not.
public struct SessionMetricsSample: Sendable, Equatable {
    public var avgBpm: Int?
    public var calories: Int?

    public init(avgBpm: Int? = nil, calories: Int? = nil) {
        self.avgBpm = avgBpm
        self.calories = calories
    }
}

// MARK: - Delegates

/// ── `@unchecked Sendable` AND WHY IT IS HONEST HERE ─────────────────────────
/// HealthKit calls both delegates on its own queue and neither protocol is
/// annotated for the main actor, so the conformance cannot be `@MainActor`. Both
/// methods below do exactly one thing: hop to the main actor and touch the
/// controller's state there. Nothing is read or written off it.
extension WorkoutSessionController: HKWorkoutSessionDelegate {

    public nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor in
            self.isRunning = toState == .running
        }
    }

    public nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession, didFailWithError error: any Error
    ) {
        Task { @MainActor in
            self.isRunning = false
            self.lastError = error.localizedDescription
        }
    }
}

extension WorkoutSessionController: HKLiveWorkoutBuilderDelegate {

    public nonisolated func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        Task { @MainActor in
            self.absorb(collectedTypes, from: workoutBuilder)
        }
    }

    /// Pause and resume markers. The training log keeps its own pause ledger in
    /// `set_events` — which survives a relaunch and merges across devices — so
    /// there is nothing to mirror here.
    public nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
#endif
