import Foundation

/// The device's Health database, as the ingest needs it.
///
/// A protocol for the same reason `SyncRemote` is one: every interesting case —
/// a metric this device does not record, a night split across two sources, a
/// permission that was never granted — is a case about the store's behaviour,
/// and none of them are reproducible against a real `HKHealthStore` in a test.
public protocol HealthReading: Sendable {
    /// True when Health data exists on this device at all (false on a Mac and
    /// in every test).
    var isAvailable: Bool { get }

    /// Ask once, for `HealthCatalogue.readTypes`.
    ///
    /// HealthKit never reports WHICH types were granted — by design, so an app
    /// cannot infer a diagnosis from a refusal. So this answers only whether the
    /// sheet completed, and a denied type is indistinguishable from a metric the
    /// device does not record: both read as absent.
    func requestAuthorization(read: [String]) async throws -> Bool

    /// One already-reduced value for a quantity type over `[start, end)`.
    ///
    /// Reduced by HealthKit rather than in Swift, deliberately: a statistics
    /// query deduplicates overlapping iPhone and Watch samples the way Apple's
    /// own Health app does. Summing the raw samples here would double-count
    /// every minute both devices recorded.
    func quantity(
        _ identifier: String, reduce: HealthReduce, start: Date, end: Date
    ) async throws -> Double?

    /// Raw sleep-category samples in a window. Not reduced: the stage union in
    /// `Sleep.aggregate` needs the individual intervals.
    func sleepSamples(start: Date, end: Date) async throws -> [SleepSample]
}
