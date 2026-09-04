import SwiftUI
import HelixUI
import HelixCore
import HelixData

/// One movement: what it trains, how it is logged, and how much of it you have
/// done.
///
/// ── TWO HALVES ──────────────────────────────────────────────────────────────
/// The header is the movement itself — what it trains, how it is logged — and
/// comes entirely from the domain. Below it is the history: the record book
/// (`personal_records`, keyed by canonical name), the session-best estimated
/// 1RM as a Swift Chart, and the ledger of recent sets. An unloaded movement
/// has no 1RM to estimate and no trend; its record is the rep count, and the
/// chart says so rather than drawing a flat zero.
struct ExerciseDetailView: View {
    let entry: ExerciseCatalogEntry

    @Environment(AppEnvironment.self) private var environment
    @State private var records: [PersonalRecordRow] = []
    @State private var trend: [SessionAnalysis.TrailSeries] = []
    @State private var ledger: [HistorySetRow] = []
    @State private var loaded = false

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
            }

            if !records.isEmpty {
                Section {
                    ForEach(records, id: \.axis) { r in
                        LabeledContent {
                            Text(recordValue(r)).helixNumeral().foregroundStyle(Color.helix.textPrimary)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(PrAxis(rawValue: r.axis).map { PrEngine.axisLabel($0, timed: timed) } ?? r.axis)
                                Text(Self.longDate(r.achievedOn))
                                    .font(.caption)
                                    .foregroundStyle(Color.helix.textSecondary)
                            }
                        }
                    }
                } header: {
                    HelixSectionHeader("Records", group.domain)
                }
            }

            if loaded, !ledger.isEmpty {
                Section {
                    HelixChartCard("Estimated 1RM", domain: group.domain, headline: trend.first?.points.last.map { "\(jsIntegerString(jsRound1($0.kg))) kg" }) {
                        if trend.isEmpty {
                            HelixChartEmpty(timed ? "Held for time — the record is the duration." : "Unloaded — the record is the rep count.")
                        } else {
                            E1rmTrendChart(series: trend, scrollDays: spanDays > 90 ? 90 : nil)
                        }
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }

                Section {
                    ForEach(ledger) { set in
                        HStack(spacing: 10) {
                            Text(Self.shortDate(set.date))
                                .font(.caption).helixNumeral()
                                .foregroundStyle(Color.helix.textSecondary)
                                .frame(minWidth: 52, alignment: .leading)
                            Text(SetFormat.format(weightKg: set.weightKg, reps: Double(set.reps), timed: timed))
                                .helixNumeral()
                                .foregroundStyle(SetTags.isWorkingSet(set.setType) ? Color.helix.textPrimary : Color.helix.textTertiary)
                            if let tag = SetTags.tag(for: set.setType) {
                                Text(tag.label)
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(Color.helix.textTertiary)
                            }
                            Spacer(minLength: 4)
                            if let rpe = set.rpe {
                                Text("RPE \(jsIntegerString(rpe))")
                                    .font(.caption).helixNumeral()
                                    .foregroundStyle(Color.helix.textSecondary)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                } header: {
                    HelixSectionHeader("Ledger", group.domain)
                } footer: {
                    Text("The last \(ledger.count) sets, newest first.")
                }
            }
        }
        .listRowBackground(Rectangle().fill(.ultraThinMaterial))
        .scrollContentBackground(.hidden)
        .helixScreen(group.domain)
        .navigationTitle(canonical)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            let database = environment.database, id = entry.id, key = canonical
            let (sets, book) = await Task.detached(priority: .userInitiated) {
                ((try? database.historySets(exerciseIds: [id])) ?? [], (try? database.personalRecords(exerciseKey: key)) ?? [])
            }.value
            records = book
            let points = SessionAnalysis.sessionBestE1rm(sets)
            trend = points.count >= 2 ? [SessionAnalysis.TrailSeries(id: key, points: points)] : []
            ledger = Array(sets.reversed().prefix(40))
            loaded = true
        }
    }

    private var timed: Bool { TimedExercise.isTimed(canonical) }

    /// Days between the first and last plotted point; past 90 the chart pans.
    private var spanDays: Int {
        guard let pts = trend.first?.points, let first = pts.first, let last = pts.last,
              let a = ISODate.dayNumber(first.date), let b = ISODate.dayNumber(last.date) else { return 0 }
        return b - a
    }

    /// A record as the axis means it: a load, a rep count or a hold, a set's
    /// tonnage with the set that made it, an estimate.
    private func recordValue(_ r: PersonalRecordRow) -> String {
        switch PrAxis(rawValue: r.axis) {
        case .reps: return timed ? "\(jsIntegerString(r.value)) sec" : "\(jsIntegerString(r.value)) reps"
        case .volume:
            let set = SetFormat.format(weightKg: r.weightKg, reps: r.reps.map(Double.init), timed: timed)
            return r.weightKg == nil ? "\(jsIntegerString(r.value)) kg" : "\(jsIntegerString(r.value)) kg (\(set))"
        default: return "\(jsIntegerString(jsRound1(r.value))) kg"
        }
    }

    private static func shortDate(_ iso: String) -> String {
        LogicalDay.date(fromISO: iso).map(HelixChart.shortDate) ?? iso
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
    HistoryPreviews.view("exercise-history")
}
#endif

private extension Array where Element: Hashable {
    /// Order-preserving dedupe. Several map tokens fold onto one landmark.
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}
