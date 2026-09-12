import Foundation

/// One week's weighted sets per landmark, and the targets they are read against.
///
/// ── WHY THIS LIVES IN OnyxCore AND THE BUILDER DOES NOT ─────────────────────
/// `TodayFeedBuilder.muscleFocus(...)` is still the one accumulator, and it is
/// still in OnyxData, because building this needs a store: the week's set rows
/// and the athlete's `plan_phase_volume` targets. The SHAPE needs neither. It
/// was declared beside the builder until `WeeklyWrap.Summary` — an OnyxCore
/// type — had to carry one, and OnyxCore cannot see OnyxData by construction
/// (`OnyxCore/Package.swift` declares no dependencies at all).
///
/// The alternative was to hang the muscle figures off the wrap's snapshot as a
/// second object beside the summary. `Summary`'s own header rejects exactly
/// that for bodyweight: the summary is one object the view cannot assemble half
/// of. A week's distribution is the same kind of fact and gets the same answer.
///
/// Nothing about the numbers moved. This is the declaration and only the
/// declaration.

/// One muscle's week: what landed on it, and what the plan asked for.
public struct MuscleFocusRow: Sendable, Equatable, Identifiable {
    public let muscle: LandmarkMuscle
    /// WEIGHTED sets — a primary mover earns 1.0 and a secondary 0.5
    /// (`MuscleCredit.secondarySetCredit`), which is the same currency the
    /// targets are denominated in. Fractional on purpose; rounding it here
    /// would make five half-credits disappear.
    public let sets: Double
    /// The athlete's override for this (plan, phase), else the program's own
    /// number. Zero is a real answer — Adductors is 0 on a cut — and a muscle
    /// with a zero target is not behind, it is unasked-for.
    public let target: Int
    public var id: String { muscle.rawValue }
    /// Never negative: work past the target is done, not "minus three left".
    public var remaining: Double { max(0, Double(target) - sets) }

    public init(muscle: LandmarkMuscle, sets: Double, target: Int) {
        self.muscle = muscle
        self.sets = sets
        self.target = target
    }
}

public struct MuscleFocusSummary: Sendable, Equatable {
    public var weekStart: String
    /// Every one of the sixteen landmarks, in the canonical order, present
    /// whether or not the week touched it. A muscle that vanishes from the
    /// list when it is untrained is the one you most need to see.
    public var rows: [MuscleFocusRow]

    public init(weekStart: String = "", rows: [MuscleFocusRow] = []) {
        self.weekStart = weekStart
        self.rows = rows
    }

    public var doneSets: Double { rows.reduce(0) { $0 + $1.sets } }
    public var targetSets: Int { rows.reduce(0) { $0 + $1.target } }
    public var remainingSets: Double { rows.reduce(0) { $0 + $1.remaining } }
    /// Intensity per landmark for the atlas, 0…1 against its OWN target.
    ///
    /// Against the target and not against the busiest muscle, which is what
    /// the tile does: this sheet's question is "is the week done", so a quad
    /// at 10 of 10 and a bicep at 8 of 8 must both read full even though one
    /// is a bigger number. An untargeted muscle grades against the biggest
    /// target in the plan instead — it still HAPPENED, and fading it out
    /// would report trained work as untrained.
    public var worked: [LandmarkMuscle: Double] {
        MuscleCredit.worked(
            sets: Dictionary(rows.map { ($0.muscle, $0.sets) }, uniquingKeysWith: { a, _ in a }),
            targets: Dictionary(rows.map { ($0.muscle, $0.target) }, uniquingKeysWith: { a, _ in a })
        )
    }
}


/// One week's families as a ring: degrees per slice, with black between them.
///
/// ── WHY THE ARITHMETIC IS HERE AND NOT ON THE VIEW THAT DRAWS IT ────────────
/// It lived on `WeeklyMuscleRing` first, and two things were wrong with that.
///
/// The smaller one: conforming to `View` infers `@MainActor` onto everything a
/// type declares, its `static let`s included, so reading one from a nonisolated
/// closure — a plain `map` — trapped in `_swift_task_checkIsolatedSwift` rather
/// than failing. That is fixable with `nonisolated`, and was.
///
/// The larger one is that nothing ran the test. `npm run swift:core` and
/// `swift:data` are the command-line gates; `check-swift.sh` only BUILDS OnyxUI
/// and says outright that the app target needs `xcodebuild`. A check for the
/// one piece of this feature that can be wrong without looking wrong belongs
/// where the gate can reach it, which is the same argument `OnyxData`'s own
/// manifest makes for itself.
public enum MuscleRingArcs {

    /// 2° of base colour between arcs — and it is not decoration.
    ///
    /// All sixteen hues sit at one lightness by construction, so an arc
    /// boundary is a pure chroma judgement with no lightness cue at all. Three
    /// of the eight ring adjacencies are among the closest pairs in the whole
    /// palette, and under red-green colour vision deficiency Biceps and Triceps
    /// are near metamers. A gap in the base colour turns each boundary into two
    /// high-contrast luminance edges instead.
    public static let gap = 2.0

    /// No arc thinner than three gap-widths.
    public static let minSweep = 6.0

    /// Degrees per family: proportional, floored, and still closing the circle.
    ///
    /// ── WHY A HALF-SET IS FLOORED AND NOT DROPPED ───────────────────────────
    /// Half a set of a week of eighty sweeps 2.25°, which is about 3 pt of arc
    /// — narrower than the separator beside it, so it reads as a rendering
    /// fault rather than as data. Dropping it instead is a 100 % error on the
    /// signal that matters most: the eight families exist precisely so one can
    /// be behind on its own, and a family at half a set is the most actionable
    /// thing on the card. Flooring overstates it to at most 1.7 % where the
    /// truth was 0.6 % — bounded, and in the direction of "present but tiny",
    /// which is the correct reading. The legend carries the true number.
    ///
    /// ── AND WHY A TRUE ZERO IS STILL DROPPED ────────────────────────────────
    /// The widget's `FamilySplit` floors its bars at 2 pt including the zeros,
    /// and is right to: a bar has a baseline, so a stub on it reads as zero. An
    /// arc has no baseline, so any arc at all reads as a positive quantity. The
    /// divergence is geometric, not editorial — the caller names those families
    /// in words instead.
    ///
    /// Closes to 360° for every input the eight families can produce. It stops
    /// closing above roughly 45 slices, where the floors alone exceed the
    /// circle; `MuscleFamily` has eight, so that is stated rather than guarded.
    public static func sweeps(_ sets: [Double], gaps: Int) -> [Double] {
        let total = sets.reduce(0, +)
        let budget = 360 - Double(gaps) * gap
        guard total > 0, budget > 0 else { return sets.map { _ in 0 } }
        var out = sets.map { $0 > 0 ? Swift.max(minSweep, budget * $0 / total) : 0 }
        let excess = out.reduce(0, +) - budget
        guard excess > 0 else { return out }
        // Taken back only from the arcs that have room above the floor, in
        // proportion to the room they have. Taking it from a floored arc would
        // undo the floor that was the point.
        let slack = out.reduce(0) { $0 + Swift.max(0, $1 - minSweep) }
        guard slack > 0 else { return out }
        for index in out.indices where out[index] > minSweep {
            out[index] -= (out[index] - minSweep) * (excess / slack)
        }
        return out
    }
}
