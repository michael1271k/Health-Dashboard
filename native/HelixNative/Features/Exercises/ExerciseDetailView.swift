import SwiftUI
import HelixUI
import HelixCore
import HelixData

/// One movement: what it trains, how it is logged, and how much of it you have
/// done.
///
/// ── WHAT IS DELIBERATELY NOT HERE YET ───────────────────────────────────────
/// The records, the estimated-1RM trend and the ledger are Wave 7 — they are
/// Swift Charts work sitting on the PR engine, and drawing an empty chart now
/// would be a promise the screen cannot keep. This wave is the HEADER: the facts
/// about the movement itself, which come entirely from the domain and need no
/// history at all.
struct ExerciseDetailView: View {
    let entry: ExerciseCatalogEntry

    private var canonical: String { ExerciseAliases.canonicalName(entry.name) }
    private var group: MuscleGroup { MuscleGroup.forExercise(entry.name) }
    private var primary: [LandmarkMuscle] {
        MuscleMap.primaryLandmarks(entry.name).uniqued()
    }

    /// The assisting muscles, MINUS anything already trained directly.
    ///
    /// ── WHY THE SUBTRACTION IS THE DOMAIN RULE, NOT TIDYING ─────────────────
    /// Several map tokens fold onto one landmark — a wide-grip row lists `traps`
    /// as an assist and `upper back` as a primary, and both are `upperBack` here
    /// because sixteen landmarks is the resolution the app scores in. Printed
    /// raw, "Upper back" appears on both rows and reads as 1.5 sets of credit
    /// for one muscle. `MuscleCredit` takes the LARGER credit on an overlap and
    /// never the sum, so direct work wins and the assist is not shown twice.
    private var secondary: [LandmarkMuscle] {
        let direct = Set(primary)
        return MuscleMap.secondaryLandmarks(entry.name).uniqued().filter { !direct.contains($0) }
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    // No second copy of the name: the navigation bar carries it
                    // in `.inline` mode, and repeating it is the same string
                    // twice on a 393 pt screen.
                    if badges.isEmpty {
                        Text("Loaded both sides, by weight.")
                            .font(.footnote)
                            .foregroundStyle(Color.helix.textSecondary)
                    }

                    if !badges.isEmpty {
                        // Wrapping rather than a single line: at AX5 three chips
                        // in an `HStack` would each be two characters wide.
                        FlowRow(spacing: 6) {
                            ForEach(badges, id: \.self) { badge in
                                Text(badge)
                                    .font(.caption2.weight(.medium))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(group.domain.accent.opacity(0.18), in: .capsule)
                                    .foregroundStyle(group.domain.accent)
                            }
                        }
                    }
                }
                .padding(.vertical, 4)
                .accessibilityElement(children: .combine)
            } header: {
                HelixSectionHeader(group.rawValue, group.domain)
            }

            Section {
                musclesRow("Directly", primary, credit: 1)
                musclesRow("Assisting", secondary, credit: MuscleCredit.secondarySetCredit)
            } header: {
                HelixSectionHeader("Muscles", group.domain)
            } footer: {
                // The credit rule, stated where the numbers it produces are
                // read. It is the reason a set of rows pays the lats fully and
                // the biceps at half, and it is the thing people most often
                // assume is a bug in the weekly totals.
                Text("A set counts fully for what it trains directly and at half for what assists. Overlaps take the larger credit, never the sum.")
            }

            Section {
                LabeledContent("Sets logged") {
                    Text(entry.setCount, format: .number).helixNumeral()
                }
                LabeledContent("Last trained") {
                    Text(entry.lastTrained.map(Self.longDate) ?? "—")
                        .helixNumeral()
                        .accessibilityValue(entry.lastTrained == nil ? "Not trained yet" : "")
                }
            } header: {
                HelixSectionHeader("History", group.domain)
            } footer: {
                Text("Records, the estimated-1RM trend and the full ledger arrive with the charts.")
            }
        }
        .listRowBackground(Rectangle().fill(.ultraThinMaterial))
        .scrollContentBackground(.hidden)
        .helixScreen(group.domain)
        .navigationTitle(canonical)
        .navigationBarTitleDisplayMode(.inline)
    }

    /// How the movement is LOGGED — the three facts that change which controls
    /// the deck offers, so they belong on the page about the movement.
    private var badges: [String] {
        var out: [String] = []
        if Unilateral.isUnilateral(entry.name) { out.append("One side at a time") }
        if Bodyweight.isBodyweight(entry.name) {
            out.append(Bodyweight.isLoadable(entry.name) ? "Bodyweight · loadable" : "Bodyweight")
        }
        if TimedExercise.isTimed(entry.name) { out.append("Held for time") }
        return out
    }

    @ViewBuilder
    private func musclesRow(_ label: String, _ muscles: [LandmarkMuscle], credit: Double) -> some View {
        if !muscles.isEmpty {
            LabeledContent {
                Text(muscles.map(\.displayName).joined(separator: ", "))
                    .multilineTextAlignment(.trailing)
                    .foregroundStyle(Color.helix.textPrimary)
            } label: {
                Text(label)
            }
            .accessibilityLabel("\(label), \(credit.formatted()) credit")
            .accessibilityValue(muscles.map(\.displayName).joined(separator: ", "))
        }
    }

    private static func longDate(_ iso: String) -> String {
        guard let date = LogicalDay.date(fromISO: iso) else { return iso }
        return date.formatted(.dateTime.day().month(.abbreviated).year())
    }
}

/// Chips that wrap.
///
/// `Layout` rather than a `LazyVGrid`: a grid gives every chip the widest chip's
/// width, so "Bodyweight" and "One side at a time" would sit in two columns the
/// width of the longer one. This is the smallest correct flow layout — measure
/// each subview, break when the line is full.
private struct FlowRow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, lineHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += lineHeight + spacing
                lineHeight = 0
            }
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: proposal.width ?? x, height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, lineHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += lineHeight + spacing
                lineHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}

#if DEBUG
#Preview("Exercise") {
    NavigationStack {
        ExerciseDetailView(entry: .init(
            id: "1", name: "Seated Cable Row (Wide Grip)", setCount: 22, lastTrained: "2026-08-28"
        ))
    }
}
#endif

private extension Array where Element: Hashable {
    /// Order-preserving dedupe. Several map tokens fold onto one landmark.
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}
