import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// What a sensor can honestly report — the gates every write path runs before a
// vital lands. Sibling of `HealthUnits.minValidWeightKg`, and for the same
// reason: a strap that slipped, a scale that mis-read, a Shortcut that sent a
// field in the wrong unit all produce a NUMBER, and a number nobody questions
// moves a baseline for six weeks. Declined, reported, never stored.
//
// `nil` means accept; a string is the reason, worded for `IngestReport.declined`.
// ─────────────────────────────────────────────────────────────────────────────

public enum VitalsGate {

    // MARK: HRV

    /// SDNN outside this is not a night's mean any wearable measures.
    public static let hrvValidRangeMs: ClosedRange<Double> = 5...300
    /// Below this many prior readings the athlete's band is unknown and only
    /// the physiologic bounds apply.
    public static let hrvMinHistory = 7
    /// Iglewicz–Hoaglin: a modified z past 3.5 is an outlier. Median and MAD
    /// rather than mean and SD so the artifacts already in the history cannot
    /// widen the band that is meant to catch them.
    public static let hrvOutlierZ: Double = 3.5
    /// A flat history has MAD 0 and would flag a 1 ms move; the band is never
    /// narrower than this.
    public static let hrvMadFloorMs: Double = 2
    /// And never narrower than a fraction of the median, ASYMMETRIC because
    /// SDNN is right-skewed: a night after alcohol, a fever or a hard block
    /// sits 30–40 % under the median, and a rebound after a deload can sit
    /// 60–90 % over it. A tight fortnight (MAD 2–3 ms) would call either a
    /// strap fault. The band is for readings no BODY produces, not for
    /// unusual nights — so it reaches half the median down and a whole
    /// median up.
    public static let hrvRelativeFloorBelow: Double = 0.5
    public static let hrvRelativeFloorAbove: Double = 1.0
    private static let madToSigma: Double = 1.4826

    /// `history` is the athlete's prior readings — `Readiness.constants.baselineDays`
    /// of them at most, the caller's job to fetch — the day itself excluded.
    public static func hrvArtifact(_ value: Double, history: [Double]) -> String? {
        guard value.isFinite, hrvValidRangeMs.contains(value) else {
            return "outside \(Int(hrvValidRangeMs.lowerBound))–\(Int(hrvValidRangeMs.upperBound)) ms"
        }
        let prior = history.filter { $0.isFinite && hrvValidRangeMs.contains($0) }
        guard prior.count >= hrvMinHistory else { return nil }
        let median = Effort.median(prior)
        let sigma = Swift.max(Effort.median(prior.map { abs($0 - median) }) * madToSigma, hrvMadFloorMs)
        let floor = (value < median ? hrvRelativeFloorBelow : hrvRelativeFloorAbove) * median
        let band = Swift.max(hrvOutlierZ * sigma, floor)
        guard abs(value - median) > band else { return nil }
        return "beyond \(value < median ? "−" : "+")\(jsRound(band)) ms of the \(prior.count)-night median \(jsRound(median)) ms"
    }

    // MARK: Body percentages

    public static let bodyFatRange: ClosedRange<Double> = 2...70

    /// ── WHY 85 AND NOT 70 ───────────────────────────────────────────────────
    /// `muscle_percent` is the scale's MUSCLE MASS percentage — lean SOFT
    /// TISSUE over bodyweight — and NOT skeletal muscle, which is its own
    /// entered column (`skeletal_muscle_mass_kg`) precisely because the two are
    /// ~20 kg apart and neither derives the other (`Composition.swift`).
    ///
    /// 70 was the skeletal figure's ceiling applied to the soft-tissue one, and
    /// it refused readings a real InBody prints: fat-free mass is 100 − body
    /// fat before bone and water are taken out of it, so at 15 % body fat an
    /// athlete reads high-70s to low-80s here every time. This app's OWN
    /// preview fixtures use 77.6 % — a number the gate would not have stored.
    ///
    /// 85 still catches what this gate exists for: a mass typed into a percent
    /// field, a percent sent in the wrong unit, a scale that mis-read.
    public static let musclePercentRange: ClosedRange<Double> = 10...85

    public static let visceralFatRange: ClosedRange<Double> = 1...30

    public static func bodyFatArtifact(_ pct: Double) -> String? { outside(pct, bodyFatRange, "%") }
    public static func musclePercentArtifact(_ pct: Double) -> String? { outside(pct, musclePercentRange, "%") }
    public static func visceralFatArtifact(_ index: Double) -> String? { outside(index, visceralFatRange, "") }

    private static func outside(_ v: Double, _ range: ClosedRange<Double>, _ unit: String) -> String? {
        guard v.isFinite, range.contains(v) else {
            return "outside \(jsRound(range.lowerBound))–\(jsRound(range.upperBound))\(unit)"
        }
        return nil
    }
}
