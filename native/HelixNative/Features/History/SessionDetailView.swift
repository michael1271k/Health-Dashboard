import SwiftUI
import Charts
import HelixUI
import HelixCore
import HelixData

/// The post-workout page: what one session was, and what it means.
///
/// ── NOT THE WEB REPORT, AND NO LONGER A BARE LEDGER ─────────────────────────
/// `session/[id]/page.tsx` is three bordered bands with a six-cell metric table.
/// Wave 7's native answer was the opposite mistake: a `List` that opened
/// straight into set rows, so the screen you land on after finishing a workout
/// began with "Set 1, 42 kg × 10" and you had to scroll to learn anything.
///
/// §5.4 gives it a shape that answers questions in the order they are asked:
///
///   1. WHICH session — a title band washed in the split's own colour, with the
///      plan, the phase week and the lever resolved FOR THAT DATE.
///   2. WHAT it produced — seven figures, each with a reserved line under it for
///      the change against the previous session of the same split.
///   3. WHETHER it was progress — the split's tonnage as a line, this session's
///      point selected, records marked in gold.
///   4. WHERE it landed — the body, hit-testable, with weighted set counts.
///   5. THE LEDGER — every set, grouped by movement, with the previous session's
///      set beside each and a 40×16 trail of estimated 1RM in the header.
///
/// Records are DETECTED here, not read: `personal_records` is a current-best
/// table, so an old session's trophies would vanish the day they were beaten.
/// `SessionAnalysis` replays the engine against the sets that came before,
/// which is the same question the save path asked on the day.
struct SessionDetailView: View {
    let sessionId: String
    /// Screenshot harness only: open parked on the ledger. Half of this page is
    /// the ledger and a shot of the first screen reviews only the half that
    /// fits, so the shot loop takes two pictures of one screen.
    var startAtLedger = false

    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dynamicTypeSize) private var typeSize

    @State private var page: SessionAnalysis.Page?
    @State private var missing = false
    @State private var showDistribution = false

    private var report: SessionAnalysis.Report? { page?.report }
    private var split: Color { Color.helix.day(report?.session.dayKey) }

    var body: some View {
        ScrollViewReader { proxy in
            list(scroller: proxy)
        }
    }

    private func list(scroller: ScrollViewProxy) -> some View {
        List {
            if let page {
                band(page).plainRow()
                metrics(page).plainRow()
                progression(page).plainRow()
                if !page.report.muscles.isEmpty { muscles(page.report).plainRow() }
                ForEach(page.report.exercises) { exercise in
                    ledger(exercise)
                }
                if !page.report.cardio.isEmpty { cardio(page.report.cardio) }
            }
        }
        .listRowBackground(Rectangle().fill(.ultraThinMaterial))
        .listSectionSpacing(HelixSpace.m)
        .scrollContentBackground(.hidden)
        .helixScreen(.train)
        .tint(HelixDomain.train.accent)
        .navigationTitle(report.map { SessionRow.date($0.session.date) } ?? "Session")
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            if missing {
                ContentUnavailableView("Session not found", systemImage: "questionmark.circle")
            } else if page == nil {
                ProgressView()
            }
        }
        .sheet(isPresented: $showDistribution) {
            if let report {
                MuscleDistributionSheet(
                    sets: Dictionary(uniqueKeysWithValues: report.muscles.map { ($0.muscle, $0.sets) }),
                    physicalSets: report.physicalSets
                )
            }
        }
        .task {
            let database = environment.database, id = sessionId
            page = await Task.detached(priority: .userInitiated) {
                SessionAnalysis.page(database: database, sessionId: id)
            }.value
            missing = page == nil
            // `defaultScrollAnchor` is decided at first layout, when the list
            // is still empty — so the harness's ledger shot has to scroll after
            // the page lands.
            if startAtLedger, let first = page?.report.exercises.first {
                try? await Task.sleep(for: .milliseconds(400))
                scroller.scrollTo(first.id, anchor: .top)
            }
        }
    }

    // MARK: - 1 · The title band

    /// The split's own colour, bled behind the title and gone by the time the
    /// tags start.
    ///
    /// ── WHY A WASH AND NOT A COLOURED CARD ──────────────────────────────────
    /// A tinted panel makes the glass under it read as a different material and
    /// puts a hard edge across the top of the screen — the "gradient header"
    /// look the whole mandate exists to avoid. A 30 %→0 wash behind transparent
    /// content says the same thing (this is a leg day) and leaves the surface
    /// alone. The title carries the same hue at full strength, which is where
    /// the colour is actually legible.
    private func band(_ page: SessionAnalysis.Page) -> some View {
        let session = page.report.session
        return VStack(alignment: .leading, spacing: HelixSpace.s) {
            Text(SessionAnalysis.dayLabel(session.dayKey) ?? "Session")
                .helixType(.hero)
                .foregroundStyle(Color.helix.dayLabel(session.dayKey))
            Text(meta(page))
                .helixType(.caption).helixNumeral()
                .foregroundStyle(Color.helix.textSecondary)
            tags(page)
        }
        .padding(HelixSpace.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(alignment: .top) {
            LinearGradient(
                colors: [split.opacity(0.22), .clear],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: 72)
        }
        .helixGlass(.tile)
        .accessibilityElement(children: .contain)
    }

    private func meta(_ page: SessionAnalysis.Page) -> String {
        let session = page.report.session
        var parts: [String] = []
        if let n = page.split.firstIndex(where: { $0.sessionId == session.id }) {
            parts.append("#\(n + 1)")
        }
        if let date = LogicalDay.date(fromISO: session.date) {
            parts.append(date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)))
        }
        if let started = session.startedAt {
            parts.append(started.formatted(date: .omitted, time: .shortened))
        }
        return parts.joined(separator: " · ")
    }

    /// Plan · phase week · lever, each resolved for the session's OWN date.
    private func tags(_ page: SessionAnalysis.Page) -> some View {
        // Wrapping, not an `HStack`: at AX5 three capsules on one line become
        // three vertical blobs one letter wide.
        FlowRow(spacing: HelixSpace.xs) {
            tag(page.planLabel, .train)
            if let week = page.week {
                // `.short` is already "Cut W7" — the number is in it.
                tag(week.short, .fuel)
            }
            if page.maintenance {
                tag("Maintenance", .recover)
            } else if let lever = page.lever {
                tag(lever.label, .fuel)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func tag(_ text: String, _ domain: HelixDomain) -> some View {
        Text(text)
            .helixType(.micro)
            .foregroundStyle(domain.accent)
            .padding(.horizontal, HelixSpace.s)
            .padding(.vertical, 3)
            .background(domain.accent.opacity(0.16), in: .capsule)
    }

    // MARK: - 2 · The metric grid

    /// Seven figures in two rows, each with a reserved line under it.
    ///
    /// ── WHY THE SECOND LINE IS ALWAYS THERE ─────────────────────────────────
    /// §3.6: "every number has a unit and a reserved delta line". A delta that
    /// appears only when there is one to show makes the whole grid change height
    /// between two sessions, and a cell that is silent about its comparison is
    /// indistinguishable from one that has none. So the line is always drawn:
    /// the change when there is a previous session of this split, and "first of
    /// this split" when there is not.
    private func metrics(_ page: SessionAnalysis.Page) -> some View {
        let report = page.report
        return VStack(spacing: HelixSpace.grid) {
            LazyVGrid(columns: columns(3), spacing: HelixSpace.grid) {
                cell("Volume", HelixFormat.volume(report.tonnageKg), "kg",
                     sub: delta(page.tonnageDelta, unit: "kg", higherIsBetter: true))
                cell("Duration", report.session.durationMin.map { jsIntegerString(jsRound($0)) } ?? "—", "min",
                     sub: delta(page.durationDelta, unit: "min", higherIsBetter: nil))
                cell("Sets", "\(report.sets)", nil, sub: composition(report) ?? delta(page.setsDelta.map(Double.init), unit: "", higherIsBetter: true))
            }
            LazyVGrid(columns: columns(4), spacing: HelixSpace.grid) {
                cell("Difficulty", report.session.sessionRpe.map { "\(HelixFormat.rpe($0))/10" } ?? "—", nil,
                     sub: .init(report.session.sessionRpe.map { Effort.rpeLabel($0) } ?? "not rated", Color.helix.textTertiary))
                cell("Records", "\(report.prCount)", nil,
                     sub: recordsDelta(page),
                     tint: report.prCount > 0 ? Color.helix.record : nil)
                cell("Avg HR", page.avgBpm.map { jsIntegerString($0) } ?? "—", page.avgBpm == nil ? nil : "bpm",
                     sub: .init("no data", Color.helix.textTertiary))
                cell("Calories", page.calories.map { jsIntegerString($0.kcal) } ?? "—",
                     page.calories == nil ? nil : "kcal",
                     sub: .init(basis(page.calories), Color.helix.textTertiary),
                     estimated: page.calories != nil)
            }
        }
    }

    /// Three or four across until the type says otherwise, then ONE.
    ///
    /// Two columns at AX5 was tried and is worse than one: a half-width cell at
    /// that size holds "5,1…" and "DURAT…", so the grid keeps its shape and
    /// loses every value in it. A tall column of seven legible cells is what the
    /// setting was turned on for.
    private func columns(_ count: Int) -> [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: HelixSpace.grid),
              count: typeSize.isAccessibilitySize ? 1 : count)
    }

    private struct Sub {
        let text: String
        let color: Color
        init(_ text: String, _ color: Color) { self.text = text; self.color = color }
    }

    private func cell(_ label: String, _ value: String, _ unit: String?, sub: Sub, tint: Color? = nil, estimated: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .helixMicro()
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value)
                    .helixType(.display).helixNumeral()
                    .foregroundStyle(tint ?? Color.helix.textPrimary)
                    .lineLimit(1).minimumScaleFactor(0.7)
                if let unit {
                    Text(unit)
                        .helixType(.caption)
                        .foregroundStyle(Color.helix.textTertiary)
                }
                // The web report's `calc` superscript: this figure was not
                // measured. It is the difference between "you burned 340 kcal"
                // and "340 kcal is what a session this long costs someone your
                // weight", and only one of those is a fact.
                if estimated {
                    Text("calc")
                        .helixType(.micro)
                        .foregroundStyle(Color.helix.textTertiary)
                        .baselineOffset(6)
                }
            }
            Text(sub.text)
                .helixType(.caption).helixNumeral()
                .foregroundStyle(sub.color)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(HelixSpace.s)
        .helixGlass(.row)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label), \(value) \(unit ?? ""), \(sub.text)")
    }

    /// A signed change, in the colour of what it means — or the honest absence.
    ///
    /// `higherIsBetter: nil` for duration: a session that took twelve minutes
    /// less is not worse and not better, it is shorter, and painting it red
    /// would be the app inventing a verdict it does not hold.
    private func delta(_ value: Double?, unit: String, higherIsBetter: Bool?) -> Sub {
        guard let value else { return Sub("first of this split", Color.helix.textTertiary) }
        guard abs(value) >= 0.5 else { return Sub("level", Color.helix.textTertiary) }
        let sign = value > 0 ? "+" : "−"
        let text = "\(sign)\(HelixFormat.volume(abs(value)))\(unit.isEmpty ? "" : " \(unit)")"
        guard let higherIsBetter else { return Sub(text, Color.helix.textSecondary) }
        return Sub(text, (value > 0) == higherIsBetter ? Color.helix.good : Color.helix.textSecondary)
    }

    /// `3 warm-up · 1 drop` — what the set count is made of.
    ///
    /// It takes the sub-line from the delta when there is anything to say,
    /// because a total of 17 that includes three warm-ups and a drop set is a
    /// number the reader will otherwise mistrust, and mistrust costs more than
    /// a comparison does.
    private func composition(_ report: SessionAnalysis.Report) -> Sub? {
        var counts: [String: Int] = [:]
        for exercise in report.exercises {
            for set in exercise.detail.sets where !SetTags.isWorkingSet(set.setType) {
                counts[set.setType, default: 0] += 1
            }
        }
        let entries = SetTags.composition(counts)
        guard !entries.isEmpty else { return nil }
        return Sub(entries.map { "\($0.count) \($0.full.lowercased())" }.joined(separator: " · "), Color.helix.textTertiary)
    }

    private func basis(_ estimate: CalorieEstimate?) -> String {
        switch estimate?.basis {
        case .personalMedian: "your median"
        case .metFormula: "estimated"
        case nil: "no weight"
        }
    }

    /// Records against the previous session of this split. It is the reserved
    /// delta line doing its job: "9" alone is a number, "9, +2" is a session.
    private func recordsDelta(_ page: SessionAnalysis.Page) -> Sub {
        guard let previous = page.previous else { return Sub("first of split", Color.helix.textTertiary) }
        let change = page.report.prCount - previous.prCount
        if change == 0 { return Sub("same as last", Color.helix.textTertiary) }
        return Sub(change > 0 ? "+\(change)" : "−\(-change)",
                   change > 0 ? Color.helix.record : Color.helix.textSecondary)
    }

    // MARK: - 3 · Progression

    private func progression(_ page: SessionAnalysis.Page) -> some View {
        HelixChartCard(
            "Progression", domain: .train,
            headline: "\(HelixFormat.volume(page.report.tonnageKg)) kg",
            caption: page.verdict
        ) {
            if page.split.count >= 2 {
                SplitVolumeChart(points: page.split, current: page.report.session.id, tint: split)
            } else {
                HelixChartEmpty("One session on this split so far. The line starts at two.")
            }
        }
    }

    // MARK: - 4 · Muscle focus

    private func muscles(_ report: SessionAnalysis.Report) -> some View {
        let total = report.muscles.reduce(0) { $0 + $1.sets }
        return VStack(alignment: .leading, spacing: HelixSpace.s) {
            HStack(alignment: .firstTextBaseline) {
                Text("Muscle focus").helixMicro()
                Spacer(minLength: HelixSpace.s)
                Text("\(HelixFormat.sets(total)) weighted sets")
                    .helixType(.caption).helixNumeral()
                    .foregroundStyle(Color.helix.textSecondary)
            }
            HStack(alignment: .center, spacing: HelixSpace.m) {
                Button { showDistribution = true } label: {
                    AtlasFigure(side: .front, worked: MuscleCredit.worked(
                        from: Dictionary(uniqueKeysWithValues: report.muscles.map { ($0.muscle, $0.sets) })
                    ))
                    .frame(height: 96)
                }
                .buttonStyle(.plain)
                .helixPress()
                .accessibilityLabel("Where the session landed")
                .accessibilityHint("Opens the full muscle distribution")

                VStack(alignment: .leading, spacing: HelixSpace.s) {
                    ramp(report.muscles, total: total)
                    legend(report.muscles)
                }
            }
        }
        .padding(HelixSpace.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .helixGlass(.tile)
    }

    /// One bar, split by share. It is the legend's numbers as a length, which
    /// is the comparison the reader is actually making.
    private func ramp(_ rows: [(muscle: LandmarkMuscle, sets: Double)], total: Double) -> some View {
        GeometryReader { proxy in
            HStack(spacing: 1) {
                ForEach(Array(rows.enumerated()), id: \.element.muscle) { i, row in
                    Rectangle()
                        .fill(Color.helix.muscle(row.muscle, step: i, of: rows.count))
                        .frame(width: total > 0 ? max(2, proxy.size.width * row.sets / total) : 0)
                }
            }
            .clipShape(Capsule())
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }

    /// The four biggest, named. The rest are one row, because a legend of
    /// sixteen entries is a table nobody reads standing up — the sheet behind
    /// the figure is where the full ranking lives.
    private func legend(_ rows: [(muscle: LandmarkMuscle, sets: Double)]) -> some View {
        VStack(alignment: .leading, spacing: HelixSpace.xs) {
            ForEach(Array(rows.prefix(4).enumerated()), id: \.element.muscle) { i, row in
                HStack(spacing: HelixSpace.xs) {
                    Circle()
                        .fill(Color.helix.muscle(row.muscle, step: i, of: rows.count))
                        .frame(width: 6, height: 6)
                    Text(row.muscle.displayName)
                        .helixType(.caption)
                        .foregroundStyle(Color.helix.textSecondary)
                        .lineLimit(1)
                    Spacer(minLength: HelixSpace.xs)
                    Text(HelixFormat.sets(row.sets))
                        .helixType(.caption).helixNumeral()
                        .foregroundStyle(Color.helix.textPrimary)
                }
                .accessibilityElement(children: .combine)
            }
            if rows.count > 4 {
                Text("+\(rows.count - 4) more")
                    .helixType(.caption)
                    .foregroundStyle(Color.helix.textTertiary)
            }
        }
    }

    // MARK: - 5 · The ledger

    private func ledger(_ ex: SessionAnalysis.ExerciseReport) -> some View {
        Section {
            ForEach(Array(ex.rows.enumerated()), id: \.offset) { _, row in
                SetRow(row: row, timed: ex.timed)
            }
        } header: {
            ledgerHeader(ex)
        } footer: {
            Text(footer(ex)).helixNumeral()
        }
        .id(ex.id)
    }

    /// The header IS the exercise's report: what was prescribed, how much of it
    /// landed on the ceiling, what to do next time, and the trail of estimated
    /// 1RM behind it. The rows underneath are the evidence.
    private func ledgerHeader(_ ex: SessionAnalysis.ExerciseReport) -> some View {
        let domain = MuscleGroup.forExercise(ex.canonical).domain
        return VStack(alignment: .leading, spacing: HelixSpace.xs) {
            HStack(alignment: .firstTextBaseline, spacing: HelixSpace.s) {
                Text(ex.canonical)
                    .helixType(.caption).fontWeight(.semibold)
                    .textCase(nil)
                    .foregroundStyle(domain.accent)
                    .lineLimit(1)
                Spacer(minLength: HelixSpace.xs)
                // 40×16, no axis, no label: it is there to say "this has been
                // going up" in the space a number would take. Blank under two
                // sessions — `Sparkline`'s own empty caption is written for a
                // widget face and truncates to "not en…" at this width.
                if ex.spark.count >= 2 {
                    Sparkline(points: ex.spark, color: domain.accent, zeroBased: false)
                        .frame(width: 40, height: 16)
                        .accessibilityHidden(true)
                }
            }
            HStack(spacing: HelixSpace.xs) {
                if let window = ex.window {
                    Text("\(ex.atCeiling)/\(Int(ex.detail.workingSets)) @ \(window)")
                        .helixType(.micro).helixNumeral()
                        .foregroundStyle(Color.helix.textTertiary)
                }
                Spacer(minLength: HelixSpace.xs)
                if let cue = ex.cue {
                    Text(cue.short)
                        .helixType(.micro)
                        .textCase(nil)
                        .padding(.horizontal, HelixSpace.s)
                        .padding(.vertical, 2)
                        .background(domain.accent.opacity(0.18), in: .capsule)
                        .foregroundStyle(domain.accent)
                        .accessibilityLabel(cue.title)
                }
            }
        }
    }

    private func footer(_ ex: SessionAnalysis.ExerciseReport) -> String {
        var parts = ["top " + SetFormat.format(weightKg: ex.stats.topKg, reps: ex.stats.topReps, timed: ex.timed)]
        if !ex.timed { parts.append("\(jsIntegerString(ex.stats.totalReps)) reps") }
        parts.append("\(HelixFormat.volume(ex.detail.volumeKg)) kg")
        if let rpe = ex.stats.avgRpe { parts.append("RPE \(jsToFixed1(rpe))") }
        if let prev = ex.prevDate, let date = LogicalDay.date(fromISO: prev) {
            parts.append("prev \(HelixChart.shortDate(date))")
        }
        return parts.joined(separator: " · ")
    }

    // MARK: - 6 · Cardio

    private func cardio(_ rows: [CardioLogRow]) -> some View {
        Section {
            ForEach(rows, id: \.id) { c in
                LabeledContent(CardioKind(c.kind).label) {
                    Text(cardioText(c)).helixNumeral().foregroundStyle(Color.helix.textPrimary)
                }
                .frame(minHeight: 44)
            }
        } header: {
            HelixSectionHeader("Cardio", .body)
        }
    }

    private func cardioText(_ c: CardioLogRow) -> String {
        var parts: [String] = []
        if let m = c.distanceM { parts.append("\(jsToFixed1(m / 1000)) km") }
        if let min = c.durationMin { parts.append("\(jsIntegerString(jsRound(min))) min") }
        if let pace = CardioMetrics.paceMinPerKm(distanceM: c.distanceM, durationMin: c.durationMin) {
            parts.append(CardioMetrics.formatPace(pace))
        }
        if let pct = c.inclinePct { parts.append("\(jsIntegerString(pct))%") }
        return parts.isEmpty ? "—" : parts.joined(separator: " · ")
    }
}

// MARK: - The progression chart

/// Session tonnage across every session of one split, with records in gold.
///
/// ── WHY TONNAGE AND NOT ESTIMATED 1RM ───────────────────────────────────────
/// A session's est-1RM is a per-EXERCISE reading and the ledger already draws
/// it, one sparkline per movement. What a split's line answers is a different
/// question — is the day as a whole carrying more work than it did — and the
/// only figure that survives an exercise being swapped in or out is the
/// session's own tonnage.
private struct SplitVolumeChart: View {
    let points: [SessionAnalysis.SplitPoint]
    let current: String
    let tint: Color

    @State private var selected: Date?

    private var dated: [(date: Date, point: SessionAnalysis.SplitPoint)] {
        points.compactMap { p in HelixChart.date(p.date).map { (date: $0, point: p) } }
    }

    private var yDomain: ClosedRange<Double> {
        let (lo, hi) = ChartScale.niceDomain(points.map { Optional($0.tonnageKg) })
        return lo...hi
    }

    var body: some View {
        Chart {
            ForEach(dated, id: \.point.id) { entry in
                AreaMark(x: .value("Date", entry.date), y: .value("kg", entry.point.tonnageKg))
                    .foregroundStyle(
                        LinearGradient(colors: [tint.opacity(0.28), .clear], startPoint: .top, endPoint: .bottom)
                    )
                LineMark(x: .value("Date", entry.date), y: .value("kg", entry.point.tonnageKg))
                    .foregroundStyle(tint)
                    .interpolationMethod(.monotone)
                // Gold is a record and nothing else, so a point wears it only
                // when that session actually set one. The session being read
                // gets the accent ring instead — "you are here" is not a verdict.
                PointMark(x: .value("Date", entry.date), y: .value("kg", entry.point.tonnageKg))
                    .foregroundStyle(entry.point.prCount > 0 ? Color.helix.record : tint)
                    .symbolSize(entry.point.sessionId == current ? 90 : 28)
            }
            if let picked = nearest(selected), let entry = dated.first(where: { $0.date == picked }) {
                RuleMark(x: .value("Selected", picked))
                    .foregroundStyle(Color.helix.textTertiary)
                    .annotation(position: .top, spacing: 0, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        HelixCallout(HelixChart.shortDate(picked), lines: callout(entry.point))
                    }
            }
        }
        .chartYScale(domain: yDomain)
        // Both bounds labelled (§3.5): a tight domain with only the middle
        // ticks named lets a 2 % rise read as a doubling.
        .chartYAxis {
            AxisMarks(position: .trailing, values: [yDomain.lowerBound, yDomain.upperBound]) { _ in
                AxisGridLine().foregroundStyle(Color.helix.hairline)
                AxisValueLabel()
                    .font(HelixChart.axisFont)
                    .foregroundStyle(Color.helix.textTertiary)
            }
        }
        .chartXSelection(value: $selected)
        .helixChart(.train)
        .accessibilityLabel("Session volume across this split")
    }

    private func nearest(_ date: Date?) -> Date? {
        guard let date else { return nil }
        return dated.map(\.date).min { abs($0.timeIntervalSince(date)) < abs($1.timeIntervalSince(date)) }
    }

    private func callout(_ point: SessionAnalysis.SplitPoint) -> [HelixCallout.Line] {
        var lines = [HelixCallout.Line("", "\(HelixFormat.volume(point.tonnageKg)) kg")]
        if point.prCount > 0 {
            lines.append(HelixCallout.Line("", "\(point.prCount) PR", color: Color.helix.record))
        }
        return lines
    }
}

// MARK: - The set row

/// One ledger row: the set as performed, the records it won, the RPE, and the
/// same set from the previous session. A unilateral pair is one row.
struct SetRow: View {
    let row: RowWithPrev
    let timed: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: HelixSpace.s) {
            Text(ordinal)
                .helixType(.caption).fontWeight(.semibold).helixNumeral()
                .foregroundStyle(isRecord ? Color.helix.record : Color.helix.textTertiary)
                .frame(minWidth: 20, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: HelixSpace.xs) {
                    Text(current)
                        .helixType(.body).helixNumeral()
                        .foregroundStyle(Color.helix.textPrimary)
                    ForEach(axes, id: \.self) { axis in
                        Text(axis)
                            .helixType(.micro)
                            .textCase(nil)
                            .padding(.horizontal, HelixSpace.xs).padding(.vertical, 2)
                            .background(Color.helix.record.opacity(0.20), in: .capsule)
                            .foregroundStyle(Color.helix.record)
                    }
                }
                if let previous {
                    Text("prev \(previous)")
                        .helixType(.caption).helixNumeral()
                        .foregroundStyle(Color.helix.textTertiary)
                }
            }
            Spacer(minLength: HelixSpace.xs)
            if let rpe {
                Text(Effort.rpeLabel(rpe))
                    .helixType(.caption)
                    .foregroundStyle(Color.helix.effort(rpe))
            }
        }
        .frame(minHeight: 44)
        // A record row wears a gold inset on its leading edge — the ONE place
        // gold appears in the ledger, so scanning for it finds records and
        // nothing else.
        .listRowBackground(
            Rectangle().fill(.ultraThinMaterial)
                .overlay(alignment: .leading) {
                    if isRecord { Color.helix.record.frame(width: 2) }
                }
        )
        .accessibilityElement(children: .combine)
    }

    private var ordinal: String { row.row.num.map(String.init) ?? "W" }

    private var lead: DetailSet? { row.row.set ?? row.row.left ?? row.row.right }

    private var isRecord: Bool { !axes.isEmpty }

    private var current: String {
        if row.row.kind == "pair" {
            return [row.row.left.map { "L " + fmt($0.weightKg, $0.reps) }, row.row.right.map { "R " + fmt($0.weightKg, $0.reps) }]
                .compactMap { $0 }.joined(separator: " · ")
        }
        return lead.map { fmt($0.weightKg, $0.reps) } ?? "—"
    }

    private var previous: String? {
        guard row.row.num != nil, let p = row.prev else { return nil }
        if row.row.kind == "pair", let r = row.prevRight {
            return "L \(fmt(p.weightKg, p.reps)) · R \(fmt(r.weightKg, r.reps))"
        }
        return fmt(p.weightKg, p.reps)
    }

    private var axes: [String] {
        var out: [String] = []
        for a in [row.row.set, row.row.left, row.row.right].compactMap { $0?.prAxes }.flatMap({ $0 }) {
            let label = PrAxis(rawValue: a).map { PrEngine.axisLabel($0, timed: timed) } ?? a
            if !out.contains(label) { out.append(label) }
        }
        return out
    }

    private var rpe: Double? {
        [row.row.set, row.row.left, row.row.right].compactMap { $0?.rpe }.max()
    }

    private func fmt(_ kg: Double, _ reps: Double) -> String {
        SetFormat.format(weightKg: kg, reps: reps, timed: timed)
    }
}

// MARK: - Cards inside a List

private extension View {
    /// A card that happens to live in a `List`: no inset, no row material, no
    /// separator. The `List` is here for the LEDGER — a real list of sets with
    /// real section headers — and these four panels ride above it rather than
    /// forcing the whole page into a `ScrollView` of hand-drawn rows.
    func plainRow() -> some View {
        Section {
            self
                .listRowInsets(EdgeInsets(top: 0, leading: HelixSpace.l, bottom: 0, trailing: HelixSpace.l))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
        }
    }
}

#if DEBUG
#Preview("Session") { HistoryPreviews.view("session") }
#endif
