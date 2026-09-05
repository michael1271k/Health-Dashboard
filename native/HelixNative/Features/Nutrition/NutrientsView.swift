import SwiftUI
import HelixUI
import HelixCore

/// The day's micronutrients, against the targets this athlete actually holds.
///
/// ── WHY A `List` AND NOT MORE TILES ─────────────────────────────────────────
/// Twenty rows of "name, figure, bar" is a table, and iOS has one. A grid of
/// glass tiles here would be twenty boxes that each repeat the box above with a
/// different word in it — the §3.6 failure — and it would lose the section
/// headers that are doing the actual organising.
///
/// ── FLOOR AND CEILING ARE NOT THE SAME BAR ──────────────────────────────────
/// A floor (fibre, potassium) is met by going UP and full is good; a ceiling
/// (sodium, added sugar) is met by staying DOWN and full is the warning. Same
/// geometry, opposite verdict, so the colour is the only thing that can carry
/// it — good while a ceiling has room, danger once it is past.
struct NutrientsView: View {
    let model: NutritionModel

    /// The stack's nutrients are shown apart from the food's because nothing
    /// measures them: HealthKit has no creatine, and a bar drawn at zero for a
    /// dose that was taken would be a lie told in a chart. The target is worth
    /// stating; the reading is the Stack row on Pulse.
    private var groups: [(String, [NutrientTarget])] {
        let food = NutrientTargets.all.filter { !$0.fromStack }
        var seen: [String] = []
        for target in food where !seen.contains(target.group) { seen.append(target.group) }
        return seen.map { group in (group, food.filter { $0.group == group }) }
    }

    private var stack: [NutrientTarget] { NutrientTargets.all.filter(\.fromStack) }

    /// `NutrientTargets` hardcodes protein at 170 g, which is the rung's
    /// figure and not necessarily the DAY's — an override or a lever moves it,
    /// and this screen sat one tap from a tab reading "175 / 150 g" while it
    /// said "175 / 170 g" about the same nutrient on the same day.
    private func resolved(_ target: NutrientTarget) -> NutrientTarget {
        guard target.key == "protein", let protein = model.target.protein, protein > 0 else { return target }
        var resolved = target
        resolved.target = protein
        return resolved
    }

    var body: some View {
        // Hoisted: `nutrients` walks the day's rows and runs a `JSONDecoder`
        // over the micros bundle on every access, and reading it inside the
        // `ForEach` did that a dozen times per body pass, on every scroll.
        let day = model.nutrients
        List {
            ForEach(groups, id: \.0) { group, targets in
                Section {
                    ForEach(targets, id: \.key) { target in
                        NutrientRow(target: resolved(target), amount: day[target.key])
                    }
                } header: {
                    HelixSectionHeader(group, .fuel)
                }
            }

            Section {
                ForEach(stack, id: \.key) { target in
                    NutrientRow(target: target, amount: nil)
                }
            } header: {
                HelixSectionHeader("From the stack", .fuel)
            } footer: {
                Text("Apple Health does not measure these, so there is no reading to draw. The targets are what the stack is dosed to deliver; whether a dose was taken is on the Pulse tab.")
            }
        }
        .helixFormBackground(.fuel)
        .navigationTitle("Nutrients")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// One nutrient: name, figure, and a bar whose colour says which way it should
/// be going.
private struct NutrientRow: View {
    let target: NutrientTarget
    /// `nil` when nothing measured it — an em dash, never a zero.
    let amount: Double?

    private var fraction: Double {
        guard let amount, target.target > 0 else { return 0 }
        return min(max(amount / target.target, 0), 1)
    }

    /// A floor fills toward good; a ceiling fills toward danger, and only turns
    /// once it is genuinely past.
    private var tint: Color {
        guard let amount else { return Color.helix.textTertiary }
        switch target.kind {
        case .floor:   return amount >= target.target ? Color.helix.good : HelixDomain.fuel.accent
        case .ceiling: return amount > target.target ? Color.helix.danger : Color.helix.good
        }
    }

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: HelixSpace.xs) {
            // At the accessibility sizes a name and a figure cannot share a
            // line: the figure holds its width and "Protein" came out one
            // letter per line. The name takes the line and the figure follows.
            if typeSize.isAccessibilitySize {
                name
                figure
            } else {
                HStack(spacing: HelixSpace.s) {
                    name
                    Spacer(minLength: HelixSpace.s)
                    figure
                }
            }
            if amount != nil {
                Gauge(value: fraction, in: 0...1) { EmptyView() }
                    .gaugeStyle(.accessoryLinearCapacity)
                    .tint(tint)
            }
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(target.label)
        .accessibilityValue(spoken)
    }

    private var name: some View {
        Text(target.label)
            .helixType(.body)
            .foregroundStyle(Color.helix.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var figure: some View {
        Text(figures)
            .helixType(.secondary)
            .helixNumeral()
            .foregroundStyle(Color.helix.textSecondary)
            .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
            .layoutPriority(1)
    }

    private var figures: String {
        let goal = "\(NutritionFormat.whole(target.target)) \(target.unit)"
        guard let amount else { return target.kind == .floor ? "aim \(goal)" : "under \(goal)" }
        return "\(NutritionFormat.whole(amount)) / \(goal)"
    }

    private var spoken: String {
        let direction = target.kind == .floor ? "at least" : "at most"
        let goal = "\(direction) \(NutritionFormat.whole(target.target)) \(target.unit)"
        guard let amount else { return "not measured, \(goal)" }
        return "\(NutritionFormat.whole(amount)) \(target.unit), \(goal)"
    }
}

#if DEBUG
#Preview("Nutrients") {
    NavigationStack {
        NutrientsView(model: NutritionPreviews.model("fuel")!)
    }
    .environment(AppEnvironment.preview)
}
#endif
