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
    /// And never narrower than half the median either way. A night after
    /// alcohol, a fever or a hard block can sit 30–40 % under the athlete's
    /// median, and a tight fortnight (MAD 2–3 ms) would call that a strap
    /// fault. The band is for readings no BODY produces, not for bad nights.
    public static let hrvRelativeFloor: Double = 0.5
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
        let band = Swift.max(hrvOutlierZ * sigma, hrvRelativeFloor * median)
        guard abs(value - median) > band else { return nil }
        return "beyond ±\(jsRound(band)) ms of the \(prior.count)-night median \(jsRound(median)) ms"
    }

    // MARK: Body percentages

    public static let bodyFatRange: ClosedRange<Double> = 2...70
    public static let musclePercentRange: ClosedRange<Double> = 10...70
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
