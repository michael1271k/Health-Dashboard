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

    /// Workouts OVERLAPPING `[start, end]` — the watch's own record of a
    /// session, whose interval is where a measured heart rate and energy come
    /// from. Overlap, not containment: the watch is started a minute after the
    /// first set and stopped a minute before the last.
    func workouts(start: Date, end: Date) async throws -> [WorkoutSample]
}

public extension HealthReading {
    /// A store that records no workouts — every test double, and any device
    /// without a watch.
    func workouts(start: Date, end: Date) async throws -> [WorkoutSample] { [] }
}

/// One `HKWorkout`, reduced to what `SessionMetrics` and the cardio import need.
///
/// ── WHY THIS GREW RATHER THAN THE PROTOCOL ──────────────────────────────────
/// The cardio import wants a bout's distance, energy, heart rate and ascent.
/// A second protocol method would have been the obvious place and would have
/// had to be written five times — `HealthKitReader`, `NoHealth`, and three test
/// doubles that care about none of it. Widening the VALUE the one existing
/// method already returns costs those five nothing: every field is optional,
/// the initialiser defaults them, and a double that constructs a sample the old
/// way still compiles and still means what it meant.
public struct WorkoutSample: Sendable, Equatable {
    public var start: Date
    public var end: Date
    /// Traditional or functional strength training. Decided by the reader,
    /// which is the only place that can name an `HKWorkoutActivityType`.
    public var isLifting: Bool
    /// The `cardio_logs.kind` this bout would be filed under, or nil when it is
    /// an activity the app does not offer. Also decided by the reader, for the
    /// same reason `isLifting` is: `HKWorkoutActivityType` cannot be named
    /// anywhere else.
    public var cardioKind: String?
    public var distanceM: Double?
    public var activeKcal: Double?
    public var avgHr: Double?
    /// Metres climbed, from the workout's metadata
    /// (`HKMetadataKeyElevationAscended`) rather than a sample type.
    ///
    /// It used to say here that this was display-only because `cardio_logs` had
    /// no column. W2 added `elevation_m` and W5 writes it: an ascent is most of
    /// what separates a hard walk from an easy one, and throwing it away meant
    /// the ledger could not tell them apart a month later.
    public var elevationM: Double?

    public init(
        start: Date,
        end: Date,
        isLifting: Bool,
        cardioKind: String? = nil,
        distanceM: Double? = nil,
        activeKcal: Double? = nil,
        avgHr: Double? = nil,
        elevationM: Double? = nil
    ) {
        self.start = start
        self.end = end
        self.isLifting = isLifting
        self.cardioKind = cardioKind
        self.distanceM = distanceM
        self.activeKcal = activeKcal
        self.avgHr = avgHr
        self.elevationM = elevationM
    }

    /// Wall-clock minutes. The bout's own duration, not its active time — the
    /// figure a person recognises when they compare it to what their watch said.
    public var durationMin: Double { end.timeIntervalSince(start) / 60 }
}

/// The four body figures Apple Health can offer a weigh-in form, as of now.
///
/// One value rather than four calls because the sheet wants them together: a
/// prefill that filled weight and left body fat blank reads as "Health has no
/// body fat" when it means "that half of the read failed". Each field is
/// independently optional INSIDE the answer, which is the honest shape.
public struct HealthBodyReading: Sendable, Equatable {
    public var weightKg: Double?
    public var bmi: Double?
    /// Whole percent, already scaled — HealthKit's own unit is a 0–1 fraction.
    public var bodyFatPct: Double?
    /// FAT-FREE mass, which is what HealthKit's `leanBodyMass` actually is.
    /// It is NOT skeletal muscle mass and must never be written as it.
    public var fatFreeMassKg: Double?

    public init(
        weightKg: Double? = nil, bmi: Double? = nil,
        bodyFatPct: Double? = nil, fatFreeMassKg: Double? = nil
    ) {
        self.weightKg = weightKg; self.bmi = bmi
        self.bodyFatPct = bodyFatPct; self.fatFreeMassKg = fatFreeMassKg
    }

    /// Nothing to offer. The sheet hides its Health row rather than showing a
    /// button that fills four dashes.
    public var isEmpty: Bool { self == HealthBodyReading() }
}
