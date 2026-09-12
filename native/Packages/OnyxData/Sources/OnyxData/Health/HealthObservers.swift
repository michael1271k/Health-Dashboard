#if ONYX_ADP && canImport(HealthKit)
import Foundation
import HealthKit

/// Background delivery for the four things that change while the app is
/// closed: the night's sleep, the morning's HRV, the day's steps, and any
/// workout the watch finished without the phone open.
///
/// ── GATED ON `ONYX_ADP` ────────────────────────────────────────────────────
/// `enableBackgroundDelivery` needs the `com.apple.developer.healthkit.
/// background-delivery` entitlement, which a personal team cannot sign — Gate 0.
/// Until then the flag is off, this file is not compiled, and every read
/// happens on foreground. Turn it on with `ONYX_ADP=1` in the environment of
/// the build (`Package.swift` reads it) plus the entitlement in `project.yml`.
///
/// An observer query fires with no payload: it says "something changed", and
/// the coordinator's ordinary `.healthKit` sync is what reads it. The
/// completion handler MUST be called, or HealthKit stops delivering after
/// three unanswered notifications.
@MainActor
public final class HealthObservers {

    public static let identifiers = [
        "HKCategoryTypeIdentifierSleepAnalysis",
        "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
        "HKQuantityTypeIdentifierStepCount",
        // The cardio ingest's own wake-up. Without it a walk finished at 18:00
        // reaches the ledger whenever the app is next opened, which is the
        // "automatic" the feature is allowed to be until the entitlement lands
        // — see the gate above. With it, the walk is filed as it ends.
        HealthCatalogue.workoutTypeIdentifier,
    ]

    private let store = HKHealthStore()
    private let onChange: @Sendable (String) -> Void
    private var queries: [HKObserverQuery] = []

    public init(onChange: @escaping @Sendable (String) -> Void) {
        self.onChange = onChange
    }

    /// Register once. A second call is a no-op.
    public func start() {
        guard HKHealthStore.isHealthDataAvailable(), queries.isEmpty else { return }
        for identifier in Self.identifiers {
            guard let type = HealthKitReader.objectType(identifier) as? HKSampleType else { continue }
            let query = HKObserverQuery(sampleType: type, predicate: nil) { [onChange] _, completion, error in
                if error == nil { onChange(identifier) }
                completion()
            }
            store.execute(query)
            queries.append(query)
            // Sleep lands once a morning and a workout ends at a moment worth
            // reacting to; steps and HRV accrue all day and an hourly wake is
            // plenty for a score that is read a few times a day.
            let immediate = identifier.contains("Sleep") || identifier == HealthCatalogue.workoutTypeIdentifier
            let frequency: HKUpdateFrequency = immediate ? .immediate : .hourly
            store.enableBackgroundDelivery(for: type, frequency: frequency) { _, _ in }
        }
    }

    public func stop() {
        for query in queries { store.stop(query) }
        queries.removeAll()
        store.disableAllBackgroundDelivery { _, _ in }
    }
}
#endif
