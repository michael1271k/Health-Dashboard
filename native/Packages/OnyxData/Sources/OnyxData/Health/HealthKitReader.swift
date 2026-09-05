#if canImport(HealthKit)
import Foundation
import HealthKit

/// `HealthReading` over a real `HKHealthStore`.
///
/// ── WHAT THE CAPACITOR PLUGIN DID THAT THIS DOES NOT ────────────────────────
/// The bridge marshalled every query through JSON, so `lib/native/healthkit.ts`
/// carried an `inBatches(…, 6, …)` throttle — firing twenty-eight queries at
/// once the instant authorization resolved hammered the store during app launch
/// and stalled the WebView. There is no bridge here and no main thread involved:
/// the queries run on HealthKit's own queue and the results are `Double`s. The
/// batching is gone with the bridge that needed it.
///
/// Units are named explicitly at every call. HealthKit will happily convert, and
/// a wrong-but-plausible unit (grams for a macro that is stored in grams,
/// kilocalories for one stored in kilojoules) is the failure that looks like a
/// data problem for months.
public struct HealthKitReader: HealthReading {

    private let store = HKHealthStore()

    public init() {}

    public var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    public func requestAuthorization(read: [String]) async throws -> Bool {
        guard isAvailable else { return false }
        let types = Set(read.compactMap(Self.objectType))
        guard !types.isEmpty else { return false }
        try await store.requestAuthorization(toShare: [], read: types)
        return true
    }

    public func quantity(
        _ identifier: String, reduce: HealthReduce, start: Date, end: Date
    ) async throws -> Double? {
        guard isAvailable,
              let type = HKObjectType.quantityType(forIdentifier: .init(rawValue: identifier))
        else { return nil }

        let options: HKStatisticsOptions
        switch reduce {
        case .sum: options = .cumulativeSum
        case .average: options = .discreteAverage
        case .latest: options = .discreteMostRecent
        }
        // Half-open, so a sample at exactly midnight belongs to one day and not
        // to both. `.strictStartDate` is what makes the bound exclusive rather
        // than "overlaps the interval".
        let predicate = HKQuery.predicateForSamples(
            withStart: start, end: end, options: [.strictStartDate]
        )
        let unit = Self.unit(for: identifier)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(
                quantityType: type, quantitySamplePredicate: predicate, options: options
            ) { _, statistics, error in
                // A type with no samples returns `nil` statistics AND an error
                // whose code is `noData`. That is absence, not failure — and
                // treating it as failure would fail the whole day's sync on the
                // first metric this device does not record.
                if let error, (error as? HKError)?.code != .errorNoData {
                    continuation.resume(throwing: error)
                    return
                }
                let value: HKQuantity?
                switch reduce {
                case .sum: value = statistics?.sumQuantity()
                case .average: value = statistics?.averageQuantity()
                case .latest: value = statistics?.mostRecentQuantity()
                }
                continuation.resume(returning: value?.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }

    public func sleepSamples(start: Date, end: Date) async throws -> [SleepSample] {
        guard isAvailable,
              let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
        else { return [] }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: type, predicate: predicate,
                limit: HKObjectQueryNoLimit, sortDescriptors: nil
            ) { _, samples, error in
                if let error, (error as? HKError)?.code != .errorNoData {
                    continuation.resume(throwing: error)
                    return
                }
                let out = (samples as? [HKCategorySample] ?? []).map {
                    SleepSample(value: $0.value, start: $0.startDate, end: $0.endDate)
                }
                continuation.resume(returning: out)
            }
            store.execute(query)
        }
    }

    public func workouts(start: Date, end: Date) async throws -> [WorkoutSample] {
        guard isAvailable else { return [] }
        // No `.strictStartDate`: a workout that STARTED before the session and
        // ran into it still overlaps it, and that is the one the watch made.
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: HKObjectType.workoutType(), predicate: predicate,
                limit: HKObjectQueryNoLimit, sortDescriptors: nil
            ) { _, samples, error in
                if let error, (error as? HKError)?.code != .errorNoData {
                    continuation.resume(throwing: error)
                    return
                }
                let out = (samples as? [HKWorkout] ?? []).map {
                    WorkoutSample(
                        start: $0.startDate, end: $0.endDate,
                        isLifting: Self.liftingTypes.contains($0.workoutActivityType)
                    )
                }
                continuation.resume(returning: out)
            }
            store.execute(query)
        }
    }

    /// What counts as a lifting session on the watch. Strength training, both
    /// flavours; not core training, not HIIT, which are logged as cardio here.
    static let liftingTypes: Set<HKWorkoutActivityType> = [
        .traditionalStrengthTraining, .functionalStrengthTraining,
    ]

    // MARK: - Types and units

    static func objectType(_ identifier: String) -> HKObjectType? {
        if identifier == HealthCatalogue.workoutTypeIdentifier {
            return HKObjectType.workoutType()
        }
        if identifier.hasPrefix("HKQuantityTypeIdentifier") {
            return HKObjectType.quantityType(forIdentifier: .init(rawValue: identifier))
        }
        if identifier.hasPrefix("HKCategoryTypeIdentifier") {
            return HKObjectType.categoryType(forIdentifier: .init(rawValue: identifier))
        }
        return nil
    }

    /// The unit each metric is STORED in, which is the unit the rest of the app
    /// already assumes. Anything not named here is a count.
    static func unit(for identifier: String) -> HKUnit {
        switch identifier {
        case "HKQuantityTypeIdentifierDistanceWalkingRunning":
            return .meter()                                   // `distance_m`
        case "HKQuantityTypeIdentifierActiveEnergyBurned",
             "HKQuantityTypeIdentifierDietaryEnergyConsumed":
            return .kilocalorie()
        case "HKQuantityTypeIdentifierAppleExerciseTime",
             "HKQuantityTypeIdentifierAppleStandTime",
             "HKQuantityTypeIdentifierTimeInDaylight":
            return .minute()
        case "HKQuantityTypeIdentifierHeartRateVariabilitySDNN":
            return .secondUnit(with: .milli)
        case "HKQuantityTypeIdentifierRestingHeartRate",
             "HKQuantityTypeIdentifierHeartRate":
            return HKUnit.count().unitDivided(by: .minute())
        case "HKQuantityTypeIdentifierRespiratoryRate":
            return HKUnit.count().unitDivided(by: .minute())
        case "HKQuantityTypeIdentifierVO2Max":
            // ml/(kg·min) — VO₂max's only sensible unit, and HealthKit will not
            // convert it to anything else.
            return HKUnit.literUnit(with: .milli)
                .unitDivided(by: HKUnit.gramUnit(with: .kilo).unitMultiplied(by: .minute()))
        case "HKQuantityTypeIdentifierOxygenSaturation",
             "HKQuantityTypeIdentifierBodyFatPercentage":
            // A 0–1 fraction. `HealthCatalogue` scales it ×100 — the unit fix and
            // the scale factor are the same decision, made once each side.
            return .percent()
        case "HKQuantityTypeIdentifierBodyMass",
             "HKQuantityTypeIdentifierLeanBodyMass":
            return HKUnit.gramUnit(with: .kilo)
        case "HKQuantityTypeIdentifierBodyMassIndex":
            return .count()
        case "HKQuantityTypeIdentifierAppleSleepingWristTemperature":
            return .degreeCelsius()
        case "HKQuantityTypeIdentifierDietaryWater":
            return HKUnit.literUnit(with: .milli)             // `water_ml`
        case "HKQuantityTypeIdentifierDietarySodium",
             "HKQuantityTypeIdentifierDietaryPotassium",
             "HKQuantityTypeIdentifierDietaryCalcium",
             "HKQuantityTypeIdentifierDietaryIron",
             "HKQuantityTypeIdentifierDietaryMagnesium",
             "HKQuantityTypeIdentifierDietaryVitaminC":
            return HKUnit.gramUnit(with: .milli)
        case "HKQuantityTypeIdentifierDietaryVitaminD":
            // Micrograms. `HealthUnits.vitaminDToIU` converts on the way into
            // the micros bundle, because every target in the app is in IU.
            return HKUnit.gramUnit(with: .micro)
        default:
            // Every remaining dietary macro is grams; steps and flights are
            // counts, and `.gram()` is not a legal unit for them — so the two
            // families are split by prefix rather than listed.
            return identifier.hasPrefix("HKQuantityTypeIdentifierDietary") ? .gram() : .count()
        }
    }
}
#endif
