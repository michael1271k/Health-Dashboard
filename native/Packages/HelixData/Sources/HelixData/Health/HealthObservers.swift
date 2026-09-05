#if HELIX_ADP && canImport(HealthKit)
import Foundation
import HealthKit

/// Background delivery for the three readings that change while the app is
/// closed: the night's sleep, the morning's HRV, the day's steps.
///
/// ── GATED ON `HELIX_ADP` ────────────────────────────────────────────────────
/// `enableBackgroundDelivery` needs the `com.apple.developer.healthkit.
/// background-delivery` entitlement, which a personal team cannot sign — Gate 0.
/// Until then the flag is off, this file is not compiled, and every read
/// happens on foreground. Turn it on with `HELIX_ADP=1` in the environment of
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
            // Sleep lands once a morning; the other two accrue all day and an
            // hourly wake is plenty for a score that is read a few times a day.
            let frequency: HKUpdateFrequency = identifier.contains("Sleep") ? .immediate : .hourly
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
