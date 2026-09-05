import SwiftUI
import OnyxUI
import OnyxCore

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

    /// The stack's own nutrients are still shown apart from the food's — they
    /// are a different KIND of intake, and creatine belongs next to citrulline
    /// rather than next to fibre. What changed in §W6 is that they now carry a
    /// reading: the phone credits a dose the moment its slot has passed, the
    /// same rule the web has always used, so "5 000 / 5 000 mg creatine" is a
    /// measurement of the protocol rather than a blank with a target beside it.
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
        let fromStack = model.stack.nutrients
        List {
            ForEach(groups, id: \.0) { group, targets in
                Section {
                    ForEach(targets, id: \.key) { target in
                        NutrientRow(target: resolved(target), amount: day[target.key], stack: fromStack[target.key])
                    }
                } header: {
                    OnyxSectionHeader(group, .fuel)
                }
            }

            Section {
                ForEach(stack, id: \.key) { target in
                    NutrientRow(target: target, amount: nil, stack: fromStack[target.key])
                }
            } header: {
                OnyxSectionHeader("From the stack", .fuel)
            } footer: {
                Text("Apple Health measures none of these — the reading is the protocol: a dose counts once its slot has passed, unless it was skipped. Change that on the Stack screen.")
            }
        }
        .onyxFormBackground(.fuel)
        .navigationTitle("Nutrients")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// One nutrient: name, figure, and a bar whose colour says which way it should
/// be going.
private struct NutrientRow: View {
    let target: NutrientTarget
    /// What FOOD delivered. `nil` when nothing measured it — an em dash, never
    /// a zero.
    let amount: Double?
    /// What the STACK delivered, credited by `StackCredit`.
    var stack: Double?

    /// Food plus stack, or nil when neither has anything to say.
    private var total: Double? {
        guard amount != nil || stack != nil else { return nil }
        return (amount ?? 0) + (stack ?? 0)
    }

    private func fraction(_ value: Double?) -> Double {
        guard let value, target.target > 0 else { return 0 }
        return min(max(value / target.target, 0), 1)
    }

    /// A floor fills toward good; a ceiling fills toward danger, and only turns
    /// once it is genuinely past.
    private var tint: Color {
        guard let total else { return Color.onyx.textTertiary }
        switch target.kind {
        case .floor:   return total >= target.target ? Color.onyx.good : OnyxDomain.fuel.accent
        case .ceiling: return total > target.target ? Color.onyx.danger : Color.onyx.good
        }
    }

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.xs) {
            // At the accessibility sizes a name and a figure cannot share a
            // line: the figure holds its width and "Protein" came out one
            // letter per line. The name takes the line and the figure follows.
            if typeSize.isAccessibilitySize {
                name
                figure
            } else {
                HStack(spacing: OnyxSpace.s) {
                    name
                    Spacer(minLength: OnyxSpace.s)
                    figure
                }
            }
            if total != nil { bar }
            if let stackNote {
                Text(stackNote)
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textTertiary)
            }
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(target.label)
        .accessibilityValue(spoken)
    }

    /// Two segments on one rail: what food delivered, and what the stack put on
    /// top of it. A single total would hide the one fact worth knowing here —
    /// that a target is being met by a tablet — and `Gauge` cannot draw two, so
    /// the rail is drawn rather than styled.
    private var bar: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            ZStack(alignment: .leading) {
                Capsule().fill(Color.onyx.hairline)
                Capsule()
                    .fill(tint.opacity(0.45))
                    .frame(width: width * fraction(total))
                Capsule()
                    .fill(tint)
                    .frame(width: width * fraction(amount))
            }
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }

    private var name: some View {
        Text(target.label)
            .onyxType(.body)
            .foregroundStyle(Color.onyx.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var figure: some View {
        Text(figures)
            .onyxType(.secondary)
            .onyxNumeral()
            .foregroundStyle(Color.onyx.textSecondary)
            .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
            .layoutPriority(1)
    }

    private var figures: String {
        let goal = "\(NutritionFormat.whole(target.target)) \(target.unit)"
        guard let total else { return target.kind == .floor ? "aim \(goal)" : "under \(goal)" }
        return "\(NutritionFormat.whole(total)) / \(goal)"
    }

    /// Only when the stack is actually carrying some of it — a caption that
    /// says "0 from the stack" is a line of type spent saying nothing.
    private var stackNote: String? {
        guard let stack, stack > 0, amount != nil else { return nil }
        return "\(NutritionFormat.whole(stack)) from the stack"
    }

    private var spoken: String {
        let direction = target.kind == .floor ? "at least" : "at most"
        let goal = "\(direction) \(NutritionFormat.whole(target.target)) \(target.unit)"
        guard let total else { return "not measured, \(goal)" }
        let note = stackNote.map { ", \($0)" } ?? ""
        return "\(NutritionFormat.whole(total)) \(target.unit)\(note), \(goal)"
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
