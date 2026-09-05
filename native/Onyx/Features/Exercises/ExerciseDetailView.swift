import SwiftUI
import OnyxUI
import OnyxCore
import OnyxData

/// One movement: what it trains, how far it has come, and every set of it.
///
/// ── TWO SEGMENTS, BECAUSE THEY ARE TWO QUESTIONS ────────────────────────────
/// Wave 7 had this as one scroll: badges, muscles, counts, the record book, a
/// chart, then forty set rows. Everything was present and nothing was
/// findable — "what is my best" and "what did I do last Tuesday" were forty
/// rows apart in a screen with no landmarks.
///
/// §5.5 splits it. **Summary** is the movement's own page: three figures, the
/// caveat that makes them honest, and the est-1RM curve. **History** is the
/// ledger, newest session first, as a compact grid of sets rather than a row
/// each — a session is a shape you recognise, and thirty rows hide the shape.
///
/// ── AND WHY THE FIGURES ARE DERIVED, NOT READ FROM `personal_records` ───────
/// That table is a CURRENT-BEST book keyed by canonical name, and its `volume`
/// axis is a per-SET tonnage record, not a session's. Reading "best session
/// volume" out of it would print a set's number under a session's label. Every
/// figure here comes from the ledger this page is already holding, so the strip
/// and the chart under it cannot disagree.
struct ExerciseDetailView: View {
    let entry: ExerciseCatalogEntry
    /// The library's own order, for the prev/next chevrons. Empty when the page
    /// was reached from somewhere with no list behind it.
    var siblings: [ExerciseCatalogEntry] = []

    @Environment(AppEnvironment.self) private var environment

    @State private var current: ExerciseCatalogEntry?
    @State private var segment = Segment.summary
    @State private var ledger: [HistorySetRow] = []
    @State private var loaded = false

    private enum Segment: String, CaseIterable, Identifiable {
        case summary = "Summary"
        case history = "History"
        var id: String { rawValue }
    }

    private var shown: ExerciseCatalogEntry { current ?? entry }
    private var canonical: String { ExerciseAliases.canonicalName(shown.name) }
    private var group: MuscleGroup { MuscleGroup.forExercise(shown.name) }
    private var timed: Bool { TimedExercise.isTimed(canonical) }
    /// Unloaded work has no 1RM to estimate: the reading is the rep count.
    private var unloaded: Bool { working.allSatisfy { $0.weightKg <= 0 } }
    private var working: [HistorySetRow] { ledger.filter { SetTags.isWorkingSet($0.setType) } }

    var body: some View {
        List {
            Section {
                Picker("View", selection: $segment) {
                    ForEach(Segment.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 0, leading: OnyxSpace.l, bottom: OnyxSpace.xs, trailing: OnyxSpace.l))
            }

            if segment == .summary {
                summary
            } else {
                history
            }
        }
        .listRowBackground(Rectangle().fill(.ultraThinMaterial))
        .scrollContentBackground(.hidden)
        .onyxScreen(group.domain)
        .tint(group.domain.accent)
        .navigationTitle(canonical)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { chevrons }
        .sensoryFeedback(.selection, trigger: shown.id)
        .task(id: shown.id) {
            let database = environment.database, id = shown.id
            ledger = await Task.detached(priority: .userInitiated) {
                (try? database.historySets(exerciseIds: [id])) ?? []
            }.value
            loaded = true
        }
    }

    // MARK: - Prev / next

    /// Walk the library without going back to it.
    ///
    /// The chevrons move THROUGH the list as it was ordered on screen — grouped
    /// by muscle, alphabetical inside a group — so "next" is the row that was
    /// under your finger, not the next id in the table.
    @ToolbarContentBuilder
    private var chevrons: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button { step(-1) } label: { Image(systemName: "chevron.up") }
                .disabled(index == nil || index == 0)
                .accessibilityLabel("Previous exercise")
            Button { step(1) } label: { Image(systemName: "chevron.down") }
                .disabled(index == nil || index == siblings.count - 1)
                .accessibilityLabel("Next exercise")
        }
    }

    private var index: Int? { siblings.firstIndex { $0.id == shown.id } }

    private func step(_ by: Int) {
        guard let index, siblings.indices.contains(index + by) else { return }
        loaded = false
        ledger = []
        current = siblings[index + by]
    }

    // MARK: - Summary

    @ViewBuilder
    private var summary: some View {
        Section {
            VStack(alignment: .leading, spacing: OnyxSpace.s) {
                HStack(spacing: OnyxSpace.grid) {
                    stat("Heaviest", heaviest.map { "\(OnyxFormat.kg($0)) kg" } ?? "—")
                    stat(timed ? "Longest hold" : "Best 1RM", bestReading)
                    stat("Best session", bestSessionVolume.map { "\(OnyxFormat.volume($0)) kg" } ?? "—")
                }
                // The caveat is the difference between a headline and a lie.
                // "Heaviest" is ONE set, not a session; the total reps beside it
                // is the volume the heaviest number says nothing about.
                Text(caveat)
                    .onyxType(.caption).onyxNumeral()
                    .foregroundStyle(Color.onyx.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, OnyxSpace.xs)
            .accessibilityElement(children: .contain)
        } header: {
            OnyxSectionHeader("Best", group.domain)
        }

        Section {
            OnyxChartCard(
                unloaded ? "Reps per session" : "Estimated 1RM",
                domain: group.domain,
                headline: headline
            ) {
                if !loaded {
                    OnyxChartEmpty("Reading the ledger…")
                } else if series.count >= 2 {
                    E1rmTrendChart(series: [SessionAnalysis.TrailSeries(id: canonical, points: series)],
                                   scrollDays: spanDays > 90 ? 90 : nil)
                } else {
                    OnyxChartEmpty("Two sessions and the line starts.")
                }
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }

        Section {
            musclesRow("Directly", primary)
            musclesRow("Assisting", secondary)
            if !badges.isEmpty {
                // Wrapping rather than a single line: at AX5 three chips in an
                // `HStack` would each be two characters wide.
                FlowRow(spacing: OnyxSpace.xs) {
                    ForEach(badges, id: \.self) { badge in
                        Text(badge)
                            .onyxType(.micro)
                            .textCase(nil)
                            .padding(.horizontal, OnyxSpace.s)
                            .padding(.vertical, 3)
                            .background(group.domain.accent.opacity(0.18), in: .capsule)
                            .foregroundStyle(group.domain.accent)
                    }
                }
                .frame(minHeight: 44)
            }
        } header: {
            OnyxSectionHeader("Muscles", group.domain)
        } footer: {
            // The credit rule, stated where the numbers it produces are read.
            // It is why a set of rows pays the lats fully and the biceps at
            // half, and it is the thing most often assumed to be a bug in the
            // weekly totals.
            Text("A set counts fully for what it trains directly and at half for what assists. Overlaps take the larger credit, never the sum.")
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).onyxMicro()
            Text(value)
                .onyxType(.display).onyxNumeral()
                .foregroundStyle(Color.onyx.textPrimary)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var heaviest: Double? { working.map(\.weightKg).max().flatMap { $0 > 0 ? $0 : nil } }

    private var bestE1rm: Double? { series.map(\.kg).max() }

    private var bestReading: String {
        if timed { return working.map { Double($0.reps) }.max().map { "\(jsIntegerString($0)) s" } ?? "—" }
        if unloaded { return working.map { Double($0.reps) }.max().map { "\(jsIntegerString($0)) reps" } ?? "—" }
        return bestE1rm.map { "\(jsIntegerString(jsRound1($0))) kg" } ?? "—"
    }

    /// The most tonnage this movement has ever carried in ONE session — the
    /// figure a set-level record book cannot answer.
    private var bestSessionVolume: Double? {
        let bySession = Dictionary(grouping: working, by: \.sessionId)
        let best = bySession.values
            .map { SessionVolume.sessionVolumeKg($0.map(SessionAnalysis.volumeSet)) }
            .max()
        return (best ?? 0) > 0 ? jsRound(best ?? 0) : nil
    }

    private var caveat: String {
        var parts: [String] = []
        if let heaviest, let set = working.filter({ $0.weightKg == heaviest }).max(by: { $0.reps < $1.reps }) {
            parts.append("heaviest single set \(SetFormat.format(weightKg: heaviest, reps: Double(set.reps), timed: timed))")
        }
        let reps = working.reduce(0) { $0 + $1.reps }
        if reps > 0 { parts.append("\(reps) reps in \(working.count) working sets") }
        return parts.isEmpty ? "No working sets logged yet." : parts.joined(separator: " · ").capitalizedFirst
    }

    private var headline: String? {
        guard let last = series.last else { return nil }
        return unloaded ? "\(jsIntegerString(last.kg)) reps" : "\(jsIntegerString(jsRound1(last.kg))) kg"
    }

    /// Session-best est-1RM, or — for unloaded work, which has none — the best
    /// rep count of the session. Same shape, so one chart draws both.
    private var series: [(date: String, kg: Double)] {
        guard unloaded else { return SessionAnalysis.sessionBestE1rm(ledger) }
        var best: [String: Double] = [:]
        for r in working { best[r.date] = max(best[r.date] ?? 0, Double(r.reps)) }
        return best.keys.sorted().map { (date: $0, kg: best[$0]!) }
    }

    /// Days between the first and last plotted point; past 90 the chart pans.
    private var spanDays: Int {
        guard let first = series.first, let last = series.last,
              let a = ISODate.dayNumber(first.date), let b = ISODate.dayNumber(last.date) else { return 0 }
        return b - a
    }

    private var primary: [LandmarkMuscle] { MuscleMap.primaryLandmarks(shown.name).uniqued() }

    /// The assisting muscles, MINUS anything already trained directly.
    ///
    /// Several map tokens fold onto one landmark — a wide-grip row lists `traps`
    /// as an assist and `upper back` as a primary, and both are `upperBack` here
    /// because sixteen landmarks is the resolution the app scores in. Printed
    /// raw, "Upper back" appears on both rows and reads as 1.5 sets of credit
    /// for one muscle. `MuscleCredit` takes the LARGER credit on an overlap and
    /// never the sum, so direct work wins and the assist is not shown twice.
    private var secondary: [LandmarkMuscle] {
        let direct = Set(primary)
        return MuscleMap.secondaryLandmarks(shown.name).uniqued().filter { !direct.contains($0) }
    }

    @ViewBuilder
    private func musclesRow(_ label: String, _ muscles: [LandmarkMuscle]) -> some View {
        if !muscles.isEmpty {
            LabeledContent {
                Text(muscles.map(\.displayName).joined(separator: ", "))
                    .multilineTextAlignment(.trailing)
                    .foregroundStyle(Color.onyx.textPrimary)
            } label: {
                Text(label)
            }
            .frame(minHeight: 44)
            .accessibilityLabel(label)
            .accessibilityValue(muscles.map(\.displayName).joined(separator: ", "))
        }
    }

    /// How the movement is LOGGED — the three facts that change which controls
    /// the deck offers, so they belong on the page about the movement.
    private var badges: [String] {
        var out: [String] = []
        if Unilateral.isUnilateral(shown.name) { out.append("One side at a time") }
        if Bodyweight.isBodyweight(shown.name) {
            out.append(Bodyweight.isLoadable(shown.name) ? "Bodyweight · loadable" : "Bodyweight")
        }
        if TimedExercise.isTimed(shown.name) { out.append("Held for time") }
        return out
    }

    // MARK: - History

    /// Newest session first, its sets as a grid of chips.
    ///
    /// ── WHY A GRID AND NOT A ROW PER SET ────────────────────────────────────
    /// A row per set is forty rows for six sessions, and every one of them
    /// repeats the date. A session is five chips on one or two lines — you read
    /// `42×10 42×9 40×12` as a shape and see the fade without parsing three
    /// rows. Warm-ups are drawn in tertiary ink rather than hidden, because a
    /// session that opened at 20 kg is part of what the session was.
    @ViewBuilder
    private var history: some View {
        if loaded, sessions.isEmpty {
            Section {
                ContentUnavailableView("No sets logged", systemImage: "clock",
                                       description: Text("This movement is in the catalogue but has no history."))
            }
            .listRowBackground(Color.clear)
        }
        ForEach(sessions, id: \.id) { session in
            Section {
                FlowRow(spacing: OnyxSpace.xs) {
                    ForEach(session.sets, id: \.id) { set in
                        chip(set)
                    }
                }
                .frame(minHeight: 44)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(session.spoken(timed: timed))
            } header: {
                HStack(alignment: .firstTextBaseline) {
                    OnyxSectionHeader(session.title, group.domain)
                    Spacer()
                    Text(session.meta)
                        .onyxType(.micro).onyxNumeral()
                        .foregroundStyle(Color.onyx.textTertiary)
                }
            }
        }
    }

    private func chip(_ set: HistorySetRow) -> some View {
        let work = SetTags.isWorkingSet(set.setType)
        return Text(SetFormat.format(weightKg: set.weightKg, reps: Double(set.reps), timed: timed))
            .onyxType(.caption).onyxNumeral()
            .foregroundStyle(work ? Color.onyx.textPrimary : Color.onyx.textTertiary)
            .padding(.horizontal, OnyxSpace.s)
            .padding(.vertical, OnyxSpace.xs)
            .background(
                work ? group.domain.accent.opacity(0.14) : Color.onyx.hairline,
                in: RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous)
            )
    }

    private struct SessionBlock {
        let id: String
        let title: String
        let meta: String
        let sets: [HistorySetRow]

        func spoken(timed: Bool) -> String {
            "\(title), " + sets.map { SetFormat.format(weightKg: $0.weightKg, reps: Double($0.reps), timed: timed) }
                .joined(separator: ", ")
        }
    }

    private var sessions: [SessionBlock] {
        var order: [String] = []
        var by: [String: [HistorySetRow]] = [:]
        for row in ledger {
            if by[row.sessionId] == nil { order.append(row.sessionId) }
            by[row.sessionId, default: []].append(row)
        }
        return order.reversed().map { id in
            let rows = by[id]!
            let date = LogicalDay.date(fromISO: rows[0].date)
                .map { $0.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)) } ?? rows[0].date
            let work = rows.filter { SetTags.isWorkingSet($0.setType) }
            let volume = jsRound(SessionVolume.sessionVolumeKg(work.map(SessionAnalysis.volumeSet)))
            var meta = "\(work.count) sets"
            if volume > 0 { meta += " · \(OnyxFormat.volume(volume)) kg" }
            return SessionBlock(id: id, title: date, meta: meta, sets: rows)
        }
    }
}

/// Chips that wrap.
///
/// `Layout` rather than a `LazyVGrid`: a grid gives every chip the widest chip's
/// width, so "Bodyweight" and "One side at a time" would sit in two columns the
/// width of the longer one. This is the smallest correct flow layout — measure
/// each subview, break when the line is full.
struct FlowRow: Layout {
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

private extension String {
    /// Sentence case for a caption stitched from clauses, without touching the
    /// rest of the string — `.capitalized` would turn "42 kg" into "42 Kg".
    var capitalizedFirst: String {
        guard let first else { return self }
        return String(first).uppercased() + dropFirst()
    }
}
