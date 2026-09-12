import SwiftUI
import OnyxUI
import OnyxCore

/// Where the week's work went, as one closed shape.
///
/// ── WHY A RING WHEN `FamilySplit` IS ALREADY A BAR PER FAMILY ───────────────
/// It is not better at comparison and this file does not claim it is — a bar on
/// a common baseline beats an angle for "which family got most, and by how
/// much", which is why the widget's register stays a bar row. The ring answers
/// the other question: what FRACTION of the week was this. `FamilySplit` scales
/// each bar against the week's busiest family, so it is ordinal; the ring scales
/// against the week's total, so it is part-to-whole. A wrap-up is a part-to-
/// whole register, and the closed shape is the point of it.
///
/// The two must therefore never disagree about anything else: same currency
/// (weighted SETS, never kilograms — `OnyxPerformance.FamilySplit` states why),
/// same accumulator, same `MuscleFamily.allCases` order, the family's own colour
/// in every state and no verdict tint on top of it, and the same sentence when
/// a week is empty.
///
/// ── WHY THE ARCS ARE SEPARATED BY BLACK, AND WHY `.butt` ────────────────────
/// All sixteen hues sit at one lightness by construction (OKLCH L 0.70), so an
/// arc boundary is a pure chroma judgement with no lightness cue at all. Three
/// of the eight ring adjacencies are among the closest pairs in the palette
/// (Forearms|Legs, Core|Chest, Biceps|Triceps), and at a 22 pt stroke — about
/// half a degree of visual angle — Core|Chest separates on almost pure yellow-
/// blue, which is the axis small fields lose first. Under red-green colour
/// vision deficiency Biceps|Triceps are close to metamers. A 2° gap in the base
/// colour turns each boundary into two 7:1 luminance edges and removes the
/// simultaneous contrast that pushes near neighbours together.
///
/// `.butt` and not `.round`: a round cap extends tangentially by half the
/// stroke, which at this radius is about 8.5° per end — so a 2° trim with round
/// caps produces arcs that OVERLAP by 15° rather than a gap. `OnyxMark` already
/// documents the same trap on its own cut.
///
/// The order is `MuscleFamily.allCases` and is not negotiable here: it is
/// anatomical, it is what the widget's bar row draws, and a ring-local
/// reordering would put the same family in two places across two surfaces.
struct WeeklyMuscleRing: View {
    let summary: MuscleFocusSummary
    /// The sixteen-landmark legend. Only at the `.large` detent — but never
    /// ONLY behind a drag; see `expandButton`.
    let showLegend: Bool
    /// Opens the legend without a drag gesture.
    var onExpand: (() -> Void)?

    @Environment(\.dynamicTypeSize) private var typeSize
    /// The swatch is the only link between a legend row and an arc. Left at a
    /// fixed 10 pt while the text triples, that mapping stops being visible.
    @ScaledMetric(relativeTo: .body) private var swatch: CGFloat = 10

    private static let stroke: CGFloat = 22
    private static let diameter: CGFloat = 170

    /// The same sentence `FamilySplit` prints, deliberately word for word. Two
    /// surfaces describing one empty week in two ways is two different claims.
    private static let empty = "no sets logged this week"

    var body: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.m) {
            if total <= 0 {
                Text(Self.empty)
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textSecondary)
            } else {
                // At an accessibility size the hole cannot hold the total: the
                // numeral alone is taller than the 126 pt gap. It moves out
                // rather than shrinking, because a scaled-down figure is
                // truncation wearing another name.
                if typeSize.isAccessibilitySize { totalLine }
                ring
                if !untrained.isEmpty {
                    // Zero draws no arc, so the absence has to be said. It is
                    // also the most actionable line on the sheet, and at the
                    // 560 detent the legend that would otherwise carry it is
                    // not on screen.
                    Text("Untrained: \(untrained.map(\.rawValue).joined(separator: ", "))")
                        .onyxType(.micro)
                        .foregroundStyle(Color.onyx.textTertiary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if showLegend {
                    legend
                } else {
                    expandButton
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - The ring

    private var ring: some View {
        ZStack {
            ForEach(arcs) { arc in
                Circle()
                    .trim(from: arc.start / 360, to: (arc.start + arc.sweep) / 360)
                    .stroke(
                        Color.onyx.muscleFamily(arc.family),
                        style: StrokeStyle(lineWidth: Self.stroke, lineCap: .butt)
                    )
                    // Trim starts at 3 o'clock; a week that reads clockwise
                    // from the top is the only arrangement anybody expects.
                    .rotationEffect(.degrees(-90))
            }
            if !typeSize.isAccessibilitySize { centre }
        }
        // The stroke is centred on the path, so half of it lies outside the
        // circle. Without this the ring draws 22 pt wider than its frame and
        // clips against the card's padding.
        .padding(Self.stroke / 2)
        .frame(width: Self.diameter, height: Self.diameter)
        .frame(maxWidth: .infinity)
        // One element. Eight sibling arcs is eight swipes to learn one shape,
        // and a 3 pt crescent has no useful focus frame.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Weekly muscle split")
        .accessibilityValue(speech)
    }

    /// The total, in the hole.
    ///
    /// Sets and not tonnage, not sessions, and not a delta: the reel around
    /// this card already carries week tonnage with its delta, a best e1RM with
    /// its delta, the heaviest set and the biggest session — so kilograms
    /// appear three times and total sets appears nowhere, and total sets is the
    /// denominator every arc is a share OF.
    ///
    /// The word "SETS" is load-bearing rather than decoration: in a reel that is
    /// otherwise all kilograms, a bare number in a circle does not say which
    /// currency the angles are in.
    private var centre: some View {
        VStack(spacing: 0) {
            Text(OnyxFormat.sets(total))
                .onyxType(.display).onyxNumeral()
                .foregroundStyle(Color.onyx.textPrimary)
                .lineLimit(1).minimumScaleFactor(0.6)
            Text("SETS").onyxMicro()
        }
        // Already spoken by the ring's own value; a second element says it
        // twice.
        .accessibilityHidden(true)
    }

    private var totalLine: some View {
        HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.xs) {
            Text(OnyxFormat.sets(total))
                .onyxType(.display).onyxNumeral()
                .foregroundStyle(Color.onyx.textPrimary)
            Text("SETS").onyxMicro()
        }
        .accessibilityHidden(true)
    }

    /// Reaching the legend must not require a drag.
    ///
    /// VoiceOver does not drag a sheet, Switch Control cannot, and WCAG 2.2
    /// SC 2.5.7 asks for a non-drag route to anything a drag reveals. One button
    /// covers all three, and it is more discoverable than the gesture for
    /// everyone else too.
    @ViewBuilder
    private var expandButton: some View {
        if let onExpand {
            Button("Show all 16 muscles", systemImage: "chevron.down") { onExpand() }
                .onyxType(.caption).fontWeight(.semibold)
                .foregroundStyle(OnyxDomain.train.accent)
                .frame(minHeight: 44)
                .onyxPress()
        }
    }

    // MARK: - The legend

    /// All sixteen, always, in `LandmarkMuscle` order.
    ///
    /// All sixteen so the layout does not jump week to week, and because
    /// "Calves 0" is the row most worth reading. In declaration order and never
    /// sorted by size, so a reader can walk an arc to its landmarks — the ring
    /// is drawn in family order and a magnitude-sorted legend would break that
    /// walk, along with the rule that a legend dot and a body region are the
    /// same colour in the same place.
    ///
    /// Two columns and not four: at 375 pt a quarter-width cell has to hold a
    /// swatch, "Hamstrings" and a number, which is the truncation `WeekVitalsRow`
    /// already refuses. One column at an accessibility size, the same collapse
    /// that row makes.
    private var legend: some View {
        LazyVGrid(
            columns: Array(
                repeating: GridItem(.flexible(), spacing: OnyxSpace.m, alignment: .leading),
                count: typeSize.isAccessibilitySize ? 1 : 2
            ),
            alignment: .leading,
            spacing: OnyxSpace.s
        ) {
            ForEach(summary.rows) { row in
                HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.s) {
                    Circle()
                        .fill(Color.onyx.muscle(row.muscle))
                        .frame(width: swatch, height: swatch)
                        .accessibilityHidden(true)
                    Text(row.muscle.displayName)
                        .onyxType(.micro)
                        .foregroundStyle(row.sets > 0 ? Color.onyx.textSecondary : Color.onyx.textTertiary)
                        .lineLimit(2)
                    Spacer(minLength: OnyxSpace.xs)
                    Text(OnyxFormat.sets(row.sets))
                        .onyxType(.micro).onyxNumeral()
                        .foregroundStyle(row.sets > 0 ? Color.onyx.textPrimary : Color.onyx.textTertiary)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(row.muscle.displayName)
                .accessibilityValue(setsSpeech(row.sets))
            }
        }
    }

    // MARK: - The arithmetic

    /// The UNROUNDED total. Rounding the eight families and adding them up is
    /// not the same number as adding them up and rounding — eight halves go
    /// missing — and the hole is checked against the legend by anyone who
    /// cares enough to read both.
    private var total: Double { summary.rows.reduce(0) { $0 + $1.sets } }

    private var familySets: [MuscleFamily: Double] {
        summary.rows.reduce(into: [:]) { out, row in
            out[MuscleFamily.of(row.muscle), default: 0] += row.sets
        }
    }

    private var untrained: [MuscleFamily] {
        MuscleFamily.allCases.filter { (familySets[$0] ?? 0) <= 0 }
    }

    /// One family's slice. A struct and not a tuple because `ForEach` wants an
    /// id, and Swift has no key path to a tuple element.
    struct Arc: Identifiable {
        let family: MuscleFamily
        let start: Double
        let sweep: Double
        var id: MuscleFamily { family }
    }

    private var arcs: [Arc] {
        let sets = familySets
        let present = MuscleFamily.allCases.filter { (sets[$0] ?? 0) > 0 }
        let sweeps = MuscleRingArcs.sweeps(present.map { sets[$0] ?? 0 }, gaps: present.count)
        var out: [Arc] = []
        var cursor = 0.0
        for (family, sweep) in zip(present, sweeps) {
            out.append(Arc(family: family, start: cursor, sweep: sweep))
            cursor += sweep + MuscleRingArcs.gap
        }
        return out
    }

    // MARK: - Speech

    /// Ranked by size, not by ring order.
    ///
    /// Speech is linear, so the first thing said should be the biggest. The
    /// visual order encodes anatomy and the spoken order encodes magnitude;
    /// the divergence is the point, not an oversight.
    private var speech: String {
        let sets = familySets
        let ranked = MuscleFamily.allCases
            .filter { (sets[$0] ?? 0) > 0 }
            .sorted { (sets[$0] ?? 0) > (sets[$1] ?? 0) }
            .map { "\($0.rawValue) \(OnyxFormat.sets(sets[$0] ?? 0))" }
        var parts = ["\(OnyxFormat.sets(total)) weighted sets", ranked.joined(separator: ", ")]
        if !untrained.isEmpty {
            // The WORD, never a zero buried in a list of numbers, which in
            // speech is the easiest thing in the sentence to miss.
            parts.append("\(untrained.map(\.rawValue).joined(separator: " and ")) untrained")
        }
        return parts.joined(separator: ". ")
    }

    private func setsSpeech(_ sets: Double) -> String {
        if sets <= 0 { return "untrained" }
        return "\(OnyxFormat.sets(sets)) weighted set\(sets == 1 ? "" : "s")"
    }
}
