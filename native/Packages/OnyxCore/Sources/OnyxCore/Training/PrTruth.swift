import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// The asserted record book — a port of `src/lib/training/prTruth.ts`.
//
// `workout_sets` is not a complete history (four months of Notion-era sessions
// carry no sets), so a baseline built from the logged rows alone calls "the
// heaviest thing Onyx has seen" the all-time best and flags a return to an old
// load as a record. The book supplies the missing floor.
//
// THE BOOK IS NOT THE FLOOR. It is dated 2026-08-10 and already contains
// everything set inside the window Onyx can see, so fed straight to
// `buildBaselines` it erases the very sessions that set those records (the
// first dry run withdrew 13 flags; only one was a false positive). `floor(for:)`
// therefore asserts only the EXCESS of the book over `logged`, what Onyx's own
// complete set history produces. The TypeScript header explains at length; the
// golden vectors `pr-truth-book.json` and `pr-floor.json` pin both the data and
// the netting.
// ─────────────────────────────────────────────────────────────────────────────

public struct TruthSetVolume: Codable, Equatable, Sendable {
    public var kg: Double
    public var reps: Double
    public init(kg: Double, reps: Double) { self.kg = kg; self.reps = reps }
}

/// Everything asserted about one exercise. Every field is optional.
public struct TruthRecord: Codable, Equatable, Sendable {
    /// Heaviest single working set, kg. Floors the `weight` axis.
    public var weight: Double?
    /// Best estimated 1RM, kg, as Hevy reports it. Floors the `e1rm` axis.
    public var e1rm: Double?
    /// Heaviest single set as `kg × reps`. Floors the `volume` axis at their product.
    public var setVolume: TruthSetVolume?
    /// Best session tonnage AS HEVY COUNTS IT — warm-ups included. Reference only; never floors anything.
    public var sessionVolume: Double?
    /// Best reps in one set — unloaded movements only. Floors the `reps` axis at load 0.
    public var reps: Double?
    /// Best hold, seconds. Timed movements only.
    public var seconds: Double?
    /// Most reps across one session. Reference only.
    public var sessionReps: Double?

    public init(
        weight: Double? = nil, e1rm: Double? = nil, setVolume: TruthSetVolume? = nil,
        sessionVolume: Double? = nil, reps: Double? = nil, seconds: Double? = nil, sessionReps: Double? = nil
    ) {
        self.weight = weight; self.e1rm = e1rm; self.setVolume = setVolume
        self.sessionVolume = sessionVolume; self.reps = reps; self.seconds = seconds; self.sessionReps = sessionReps
    }
}

/// The best `buildBaselines` produces from Onyx's own sets, per axis.
public struct LoggedBest: Codable, Equatable, Sendable {
    public var weight: Double?
    public var e1rm: Double?
    /// Per-set tonnage, under the unilateral collapse.
    public var volume: Double?
    public var sessionVolume: Double?
    public var reps: Double?
    public var seconds: Double?

    public init(
        weight: Double? = nil, e1rm: Double? = nil, volume: Double? = nil,
        sessionVolume: Double? = nil, reps: Double? = nil, seconds: Double? = nil
    ) {
        self.weight = weight; self.e1rm = e1rm; self.volume = volume
        self.sessionVolume = sessionVolume; self.reps = reps; self.seconds = seconds
    }
}

/// A bar to raise on one axis. Only axes the logged history cannot already reach appear.
public struct PrFloor: Codable, Equatable, Sendable {
    public var weight: Double?
    public var e1rm: Double?
    /// Per-set tonnage.
    public var volume: Double?
    /// Always nil — the book counts warm-ups into its session totals and the axis does not.
    public var sessionVolume: Double?
    /// Reps at zero load.
    public var reps: Double?
    /// Hold duration in seconds.
    public var seconds: Double?

    public init(
        weight: Double? = nil, e1rm: Double? = nil, volume: Double? = nil,
        sessionVolume: Double? = nil, reps: Double? = nil, seconds: Double? = nil
    ) {
        self.weight = weight; self.e1rm = e1rm; self.volume = volume
        self.sessionVolume = sessionVolume; self.reps = reps; self.seconds = seconds
    }
}

public enum PrTruth {
    /// The date this book was asserted. Written to `personal_records.achieved_on`.
    public static let asOf = "2026-08-10"

    private static func sv(_ kg: Double, _ reps: Double) -> TruthSetVolume { TruthSetVolume(kg: kg, reps: reps) }

    /// All-time bests as of `asOf`, keyed by canonical exercise name.
    public static let book: [String: TruthRecord] = [
        // Push
        "Incline DB Press":                    TruthRecord(weight: 40,    e1rm: 53.33,  setVolume: sv(36, 12),    sessionVolume: 1260),
        "Chest Press (Machine)":               TruthRecord(weight: 40,    e1rm: 53.33,  setVolume: sv(37.5, 12),  sessionVolume: 1417.5),
        "Pec Deck":                            TruthRecord(weight: 55,    e1rm: 75.34,  setVolume: sv(50, 15),    sessionVolume: 2150),
        "Single Arm Cable Crossover":          TruthRecord(weight: 8.75,  e1rm: 12.32,  setVolume: sv(7.5, 15),   sessionVolume: 217.5),
        "DB Shoulder Press":                   TruthRecord(weight: 31,    e1rm: 42.25,  setVolume: sv(30, 12),    sessionVolume: 990),
        "Single Arm Lateral Raise (Cable)":    TruthRecord(weight: 5,     e1rm: 7.81,   setVolume: sv(5, 17),     sessionVolume: 272.5),
        "Cable Overhead Extension":            TruthRecord(weight: 12.5,  e1rm: 16.79,  setVolume: sv(11.25, 15), sessionVolume: 446.25),
        "Rope Triceps Pushdown":               TruthRecord(weight: 15,    e1rm: 22.39,  setVolume: sv(15, 15),    sessionVolume: 795),
        "Single Arm Triceps Pushdown (Cable)": TruthRecord(weight: 6.25,  e1rm: 9.33,   setVolume: sv(6.25, 15),  sessionVolume: 175),
        // Pull
        "Lat Pulldown":                        TruthRecord(weight: 49.5,  e1rm: 67.81,  setVolume: sv(45, 13),    sessionVolume: 1764),
        "Neutral-Grip Lat Pulldown":           TruthRecord(weight: 47,    e1rm: 64.38,  setVolume: sv(45, 12),    sessionVolume: 1080),
        "Seated Cable Row (V-Grip)":           TruthRecord(weight: 50,    e1rm: 62.5,   setVolume: sv(42.5, 14),  sessionVolume: 1572.5),
        "Seated Cable Row (Wide Grip)":        TruthRecord(weight: 42.5,  e1rm: 58.22,  setVolume: sv(42.5, 11),  sessionVolume: 887.5),
        "Straight-Arm Pulldown":               TruthRecord(weight: 17.5,  e1rm: 24.65,  setVolume: sv(16.25, 15), sessionVolume: 682.5),
        "Face Pull":                           TruthRecord(weight: 16.25, e1rm: 24.25,  setVolume: sv(16.25, 15), sessionVolume: 840),
        "Seated Incline DB Curl":              TruthRecord(weight: 16,    e1rm: 22.54,  setVolume: sv(16, 12),    sessionVolume: 512),
        "DB Hammer Curl":                      TruthRecord(weight: 20,    e1rm: 28.17,  setVolume: sv(20, 12),    sessionVolume: 720),
        "Reverse EZ-Bar Curl":                 TruthRecord(weight: 15,    e1rm: 21.43,  setVolume: sv(15, 13),    sessionVolume: 390),
        "Preacher Curl (Machine)":             TruthRecord(weight: 17.5,  e1rm: 24.65,  setVolume: sv(17.5, 12),  sessionVolume: 600),
        // Legs
        "Leg Press":                           TruthRecord(weight: 80,    e1rm: 109.59, setVolume: sv(70, 14),    sessionVolume: 3655),
        "Hack Squat":                          TruthRecord(weight: 60,    e1rm: 77.46,  setVolume: sv(55, 12),    sessionVolume: 1320),
        "Leg Extension":                       TruthRecord(weight: 42.5,  e1rm: 59.86,  setVolume: sv(37.5, 16),  sessionVolume: 1800),
        "Seated Leg Curl":                     TruthRecord(weight: 50,    e1rm: 73.53,  setVolume: sv(47.5, 15),  sessionVolume: 2137.5),
        "Romanian Deadlift (DB)":              TruthRecord(weight: 40,    e1rm: 53.33,  setVolume: sv(35, 12),    sessionVolume: 1260),
        "Hip Thrust (Machine)":                TruthRecord(weight: 27.5,  e1rm: 40.44,  setVolume: sv(27.5, 14),  sessionVolume: 1117.5),
        "Calf Press":                          TruthRecord(weight: 72.5,  e1rm: 100.75, setVolume: sv(67.5, 15),  sessionVolume: 3240),
        // Core
        "Crunch Machine":                      TruthRecord(weight: 57.5,  e1rm: 80.99,  setVolume: sv(57.5, 12),  sessionVolume: 2070),
        // Unloaded: reps ARE the record, and no loaded axis can ever fire at 0 kg.
        "Reverse Crunch":                      TruthRecord(reps: 18, sessionReps: 51),
        "Hanging Knee Raise":                  TruthRecord(reps: 16, sessionReps: 45),
        // Timed: the hold's duration rides in `reps`. "1 min" as logged.
        "Side Plank":                          TruthRecord(seconds: 60),
    ]

    /// What Onyx's OWN complete set history produces — the subtrahend.
    public static let logged: [String: LoggedBest] = [
        "Cable Overhead Extension":            LoggedBest(weight: 11.25, e1rm: 16.9,  volume: 168.75, sessionVolume: 446.25),
        "Calf Press":                          LoggedBest(weight: 70,    e1rm: 101.3, volume: 1012.5, sessionVolume: 3037.5),
        "Chest Press (Machine)":               LoggedBest(weight: 40,    e1rm: 53.3,  volume: 450,    sessionVolume: 1350),
        "Crunch Machine":                      LoggedBest(weight: 57.5,  e1rm: 80.5,  volume: 690,    sessionVolume: 2040),
        "DB Hammer Curl":                      LoggedBest(weight: 20,    e1rm: 28,    volume: 240,    sessionVolume: 658),
        "DB Shoulder Press":                   LoggedBest(weight: 30,    e1rm: 42,    volume: 360,    sessionVolume: 990),
        "Face Pull":                           LoggedBest(weight: 16.25, e1rm: 24.4,  volume: 243.75, sessionVolume: 708.75),
        "Hack Squat":                          LoggedBest(weight: 60,    e1rm: 77,    volume: 660,    sessionVolume: 1320),
        "Hanging Knee Raise":                  LoggedBest(weight: 0, volume: 0, sessionVolume: 0, reps: 16),
        "Hip Thrust (Machine)":                LoggedBest(weight: 27.5,  e1rm: 40.3,  volume: 385,    sessionVolume: 1117.5),
        "Incline DB Press":                    LoggedBest(weight: 40,    e1rm: 53.3,  volume: 420,    sessionVolume: 1260),
        "Lat Pulldown":                        LoggedBest(weight: 47,    e1rm: 65.8,  volume: 564,    sessionVolume: 1598),
        "Leg Extension":                       LoggedBest(weight: 37.5,  e1rm: 53.8,  volume: 525,    sessionVolume: 1462.5),
        "Leg Press":                           LoggedBest(weight: 72.5,  e1rm: 103.9, volume: 942.5,  sessionVolume: 2755),
        "Neutral-Grip Lat Pulldown":           LoggedBest(weight: 47,    e1rm: 64.2,  volume: 540,    sessionVolume: 1080),
        "Pec Deck":                            LoggedBest(weight: 52.5,  e1rm: 75,    volume: 750,    sessionVolume: 1300),
        "Preacher Curl (Machine)":             LoggedBest(weight: 17.5,  e1rm: 24.5,  volume: 210,    sessionVolume: 600),
        "Reverse Crunch":                      LoggedBest(weight: 0, volume: 0, sessionVolume: 0, reps: 18),
        "Reverse EZ-Bar Curl":                 LoggedBest(weight: 15,    e1rm: 21.5,  volume: 195,    sessionVolume: 390),
        "Romanian Deadlift (DB)":              LoggedBest(weight: 40,    e1rm: 53.3,  volume: 420,    sessionVolume: 1260),
        "Rope Triceps Pushdown":               LoggedBest(weight: 15,    e1rm: 19.3,  volume: 165,    sessionVolume: 330),
        "Seated Cable Row (V-Grip)":           LoggedBest(weight: 50,    e1rm: 60.9,  volume: 552.5,  sessionVolume: 1062.5),
        "Seated Cable Row (Wide Grip)":        LoggedBest(weight: 42.5,  e1rm: 58.1,  volume: 467.5,  sessionVolume: 887.5),
        "Seated Incline DB Curl":              LoggedBest(weight: 16,    e1rm: 22.4,  volume: 192,    sessionVolume: 512),
        "Seated Leg Curl":                     LoggedBest(weight: 45,    e1rm: 67.5,  volume: 675,    sessionVolume: 1935),
        "Side Plank":                          LoggedBest(seconds: 60),
        "Single Arm Cable Crossover":          LoggedBest(weight: 8.75,  e1rm: 12.3,  volume: 112.5,  sessionVolume: 217.5),
        "Single Arm Lateral Raise (Cable)":    LoggedBest(weight: 5,     e1rm: 7.8,   volume: 85,     sessionVolume: 272.5),
        "Single Arm Triceps Pushdown (Cable)": LoggedBest(weight: 6.25,  e1rm: 9.4,   volume: 93.75,  sessionVolume: 175),
        "Straight-Arm Pulldown":               LoggedBest(weight: 16.25, e1rm: 24.4,  volume: 243.75, sessionVolume: 618.75),
    ]

    /// `asserted` only when it genuinely exceeds what Onyx has already logged.
    private static func excess(_ asserted: Double?, _ logged: Double?) -> Double? {
        guard let asserted, asserted > (logged ?? 0) else { return nil }
        return asserted
    }

    /// The effective floor for one exercise — the part of the book Onyx's own
    /// history cannot account for. `nil` when there is nothing to raise. This is
    /// what `PrEngine.buildBaselines` consumes; `book` itself must never be.
    ///
    /// The e1RM floor is built two ways and takes the larger: Epley on the
    /// asserted best SET (Onyx's own arithmetic, directly comparable to what
    /// detection produces) and Hevy's figure — but the latter only where the
    /// max weight also floors, i.e. where the set behind it is one Onyx never
    /// saw. Hevy's estimator is not Epley and its noise is the size of a real
    /// e1RM advance.
    public static func floor(for name: String?) -> PrFloor? {
        guard let name, !name.isEmpty, let t = book[name] else { return nil }
        let logged = self.logged[name] ?? LoggedBest()

        let weight = excess(t.weight, logged.weight)
        let e1rmFromSet = t.setVolume.flatMap { Epley.oneRepMax(weight: $0.kg, reps: $0.reps) }
        let e1rmCandidate = Swift.max(e1rmFromSet ?? 0, weight != nil ? (t.e1rm ?? 0) : 0)

        let floor = PrFloor(
            weight: weight,
            // `e1rmCandidate || undefined` — a 0 candidate is no candidate.
            e1rm: excess(e1rmCandidate == 0 ? nil : e1rmCandidate, logged.e1rm),
            volume: excess(t.setVolume.map { $0.kg * $0.reps }, logged.volume),
            sessionVolume: nil,
            reps: excess(t.reps, logged.reps),
            seconds: excess(t.seconds, logged.seconds)
        )
        return floor == PrFloor() ? nil : floor
    }

    /// Asserted record for one exercise, verbatim. For the ledger, NOT for baselines.
    public static func record(for name: String?) -> TruthRecord? {
        guard let name, !name.isEmpty else { return nil }
        return book[name]
    }

    /// The asserted value on one axis, or nil where the book says nothing.
    /// `volume` resolves the stored set to its product; `reps` covers both the
    /// unloaded rep record and a timed hold's duration, which share the axis.
    public static func axisValue(_ rec: TruthRecord?, _ axis: PrAxis) -> Double? {
        guard let rec else { return nil }
        switch axis {
        case .weight: return rec.weight
        case .e1rm: return rec.e1rm
        case .volume: return rec.setVolume.map { $0.kg * $0.reps }
        case .reps: return rec.seconds ?? rec.reps
        }
    }
}
