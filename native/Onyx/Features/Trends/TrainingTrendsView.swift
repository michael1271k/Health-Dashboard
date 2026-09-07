import SwiftUI
import Charts
import OnyxUI
import OnyxCore
import OnyxData

/// Training Trends — four charts over ONE read of the session history.
///
/// ── WHY THERE IS NO MODEL ───────────────────────────────────────────────────
/// Every series here is a pure function of `[TrendSession]` and two pickers,
/// and the arithmetic is already ported with golden vectors (`sessionVolumeKg`,
/// `VolumeSplit`, `IntensityCalendar`, `WidgetDerive.e1rmTrends`,
/// `MuscleAggregator`). All that is left is slicing rows into marks, and a
/// `@State` array is the honest home for that — a model would be a struct
/// holding one array and four computed properties.
struct TrainingTrendsView: View {
    @Environment(AppEnvironment.self) private var environment

    /// Screenshot harness only; the app reads the environment's database.
    var seeded: [TrendSession]?
    /// Screenshot harness only: force a maintenance week the seeded history
    /// would not otherwise contain, so the hollow bars can be photographed.
    var seededLens: MaintenanceLens?

    @State private var sessions: [TrendSession]?
    @State private var window: EraWindow = .default
    @State private var input: EraWindowInput?
    /// Which weeks were maintenance weeks, resolved once for both charts that
    /// draw them. See `MaintenanceLens`.
    @State private var lens: MaintenanceLens = .schedule
    /// The generation this screen's data was read at.
    ///
    /// `.task(id:)` also fires on APPEAR, and this screen's whole point is that
    /// it reads a few thousand sets once. Keying the guard on the generation
    /// rather than on `sessions == nil` keeps that — and re-reads exactly when
    /// an edit has finished rewriting the scores behind it.
    @State private var loadedAt = -1

    private let today = LogicalDay.today()

    var body: some View {
        ScrollView {
            VStack(spacing: OnyxSpace.l) {
                if let sessions, let input {
                    let resolved = window.resolve(input)
                    EraWindowPicker(selection: $window, input: input)
                    // The window decides which sessions EXIST for this screen;
                    // each card still owns its own display span (the intensity
                    // grid is twelve weeks, the muscle bars four). Widening a
                    // heat grid to a year would draw a smear, and narrowing it
                    // to the window would make two cards answer the same
                    // question at two scales.
                    let visible = sessions.filter { resolved.contains($0.date) }
                    VolumeStreamCard(sessions: visible, era: resolved.era, today: today, lens: lens)
                    IntensityCard(sessions: visible, today: today)
                    StrengthTrendsCard(sessions: visible, today: today)
                    MuscleFocusCard(sessions: visible, today: today)
                } else {
                    ProgressView().controlSize(.large)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .onyxScreen(.train)
        .navigationTitle("Trends")
        .task(id: environment.rescoreGeneration) {
            guard loadedAt != environment.rescoreGeneration else { return }
            loadedAt = environment.rescoreGeneration
            // ponytail: the whole history in one read (~5k sets today); page by
            // era/year when the table is ten times that.
            let loaded = seeded ?? ((try? environment.database.trainingTrendSessions(
                userId: environment.userIdString, from: "2000-01-01", to: today
            )) ?? [])
            sessions = loaded
            lens = seededLens ?? MaintenanceLens.read(
                database: environment.database, userId: environment.userIdString, today: today
            )
            // "All" means this screen's own oldest session, not a floor
            // invented for it — which is exactly what `firstDataISO` is for.
            input = EraWindowSource.input(
                database: environment.database, today: today,
                firstDataISO: loaded.map(\.date).min()
            )
        }
    }
}

// MARK: - A. Volume stream

/// Weekly tonnage, one bar per programme week, stacked by split.
///
/// A session lands in the bucket its OWN `day_key` names (`VolumeSplit.resolve`)
/// — never the weekday, which a swap makes meaningless.
private struct VolumeStreamCard: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    let sessions: [TrendSession]
    /// `ResolvedEraWindow.era` — `"ppl"`, `"axis"` or `"all"`, which is what
    /// `VolumeSplit.splits(forEra:)` speaks. A window spanning the cut start
    /// spans both programmes and gets both pill sets.
    let era: String
    let today: String
    let lens: MaintenanceLens

    /// `nil` is every split, stacked.
    @State private var split: String?

    private struct Bar: Identifiable {
        let id: String
        let start: Date
        let end: Date
        let split: String
        let kg: Double
        /// Planned lighter — see `MaintenanceLens`.
        let maintenance: Bool
    }

    private var splits: [String] { VolumeSplit.splits(forEra: era) }

    /// The picked split, or all of them when the pick belongs to another era.
    private var activeSplit: String? { split.flatMap { splits.contains($0) ? $0 : nil } }

    private var bars: [Bar] {
        var order: [String] = []
        var kg: [String: Double] = [:]
        for s in sessions {
            let key = s.session.dayKey
            let bucket = VolumeSplit.resolve(dateISO: s.date, split: key ?? "", era: Era.forDate(s.date).rawValue, dayKey: key)
            guard splits.contains(bucket), activeSplit == nil || bucket == activeSplit else { continue }
            let id = Week.start(of: s.date) + "|" + bucket
            if kg[id] == nil { order.append(id) }
            kg[id, default: 0] += s.volumeKg
        }
        return order.compactMap { id in
            let parts = id.split(separator: "|").map(String.init)
            guard let start = OnyxChart.date(parts[0]) else { return nil }
            return Bar(
                id: id, start: start, end: start.addingTimeInterval(7 * 86_400),
                split: parts[1], kg: kg[id]!, maintenance: lens.callsWeek(startingOn: parts[0])
            )
        }
    }

    /// The newest week's total, as the headline.
    private var latestWeekKg: Double? {
        guard let last = bars.map(\.start).max() else { return nil }
        return bars.filter { $0.start == last }.reduce(0) { $0 + $1.kg }
    }

    var body: some View {
        let bars = bars
        let weekTotals = Dictionary(grouping: bars, by: \.start).values.map { $0.reduce(0) { $0 + $1.kg } }
        OnyxChartCard(
            "Volume", domain: .train,
            headline: latestWeekKg.map { "\(ChartScale.compactKg($0)) kg" },
            legend: bars.contains(where: \.maintenance)
                ? AnyView(MaintenanceLegend(symbol: .bar)) : nil
        ) {
            VStack(alignment: .leading, spacing: 6) {
                Picker("Split", selection: $split) {
                    Text("All splits").tag(String?.none)
                    ForEach(splits, id: \.self) { Text(VolumeSplit.label($0)).tag(Optional($0)) }
                }
                .pickerStyle(.menu)
                .tint(Color.onyx.textSecondary)

                if bars.isEmpty {
                    OnyxChartEmpty("No sessions in this window.")
                } else {
                    Chart(bars) { bar in
                        // `x:` with a unit, not xStart/xEnd: only the former
                        // STACKS the splits; the range form overlays them.
                        BarMark(
                            x: .value("Week", bar.start, unit: .weekOfYear),
                            y: .value("Tonnage", bar.kg)
                        )
                        .foregroundStyle(by: .value("Split", VolumeSplit.label(bar.split)))
                        .cornerRadius(3)
                        // ── A MAINTENANCE WEEK IS DRAWN HOLLOW ──────────────
                        // A deliberate deload is a SHORT bar, and a short bar
                        // drawn like every other one reads as a week that went
                        // wrong. Washing it back says "planned" while keeping
                        // the split's own colour, which is what the legend and
                        // the picker are keyed on — a second hue per split
                        // would double the palette to say one thing.
                        //
                        // Hollow and not hatched: a stacked bar has no outline
                        // to hollow out and Swift Charts has no pattern fill,
                        // so a hatch would be a custom `ChartContent` drawing
                        // its own rectangles and losing the stack.
                        .opacity(bar.maintenance ? 0.38 : 1)
                    }
                    .chartForegroundStyleScale(
                        domain: splits.map(VolumeSplit.label),
                        range: splits.map { Color.onyx.day(Self.dayKey(for: $0)) }
                    )
                    // Tonnage starts at zero; left to itself the axis pads
                    // below the floor and prints a negative tonnage.
                    .chartYScale(domain: 0...max(1, weekTotals.max() ?? 1) * 1.08)
                    .onyxChart(.train)
                    // Eight legend rows at AX5 are the whole plot. The split
                    // picker above is the legend there: pick one, see one.
                    .chartLegend(typeSize.isAccessibilitySize ? .hidden : .automatic)
                    .onyxScrollable(days: 84, endingAt: OnyxChart.date(Week.start(of: today))?.addingTimeInterval(7 * 86_400) ?? Date())
                }
            }
        }
    }

    /// A split's swatch is the colour of the DAY that trains it.
    private static func dayKey(for split: String) -> String {
        switch split {
        case "push": "ppl_push_sun"
        case "pull": "ppl_pull_mon"
        case "legs": "ppl_legs_tue"
        default: split
        }
    }
}

// MARK: - B. Intensity calendar

/// Twelve weeks of daily load as a heat grid: x = week, y = weekday, fill = the
/// day's tonnage against the window's heaviest day, on ONE hue.
private struct IntensityCard: View {
    let sessions: [TrendSession]
    let today: String

    private static let days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    private struct Cell: Identifiable {
        let id: String
        let week: String
        /// 0 = Sunday, plotted top-down on a numeric y so the band has a real
        /// height: a categorical y ignores `height: .ratio` and draws a hairline.
        let day: Int
        let t: Double
        var yStart: Double { Double(6 - day) + 0.1 }
        var yEnd: Double { Double(6 - day) + 0.9 }
    }

    private var volumeByDate: [(String, Double)] {
        var order: [String] = []
        var kg: [String: Double] = [:]
        for s in sessions {
            if kg[s.date] == nil { order.append(s.date) }
            kg[s.date, default: 0] += s.volumeKg
        }
        return order.map { ($0, kg[$0]!) }
    }

    var body: some View {
        let model = IntensityCalendar.build(volumeByDate: volumeByDate, days: 84, todayISO: today)
        let weeks = model?.weeks.compactMap { $0.first.flatMap { OnyxChart.date($0.date) }.map(OnyxChart.shortDate) } ?? []
        let cells: [Cell] = (model?.weeks ?? []).enumerated().flatMap { w, column in
            column.enumerated().compactMap { d, cell in
                cell.elapsed ? Cell(id: cell.date, week: weeks[w], day: d, t: cell.t) : nil
            }
        }
        OnyxChartCard("Intensity", domain: .train, caption: model.map(caption)) {
            if let model, model.stats.activeDays > 0 {
                Chart(cells) { cell in
                    RectangleMark(
                        x: .value("Week", cell.week),
                        yStart: .value("Day", cell.yStart),
                        yEnd: .value("Day", cell.yEnd),
                        width: .ratio(0.8)
                    )
                    // Sequential: the accent from faint to full. Untrained is the hairline.
                    .foregroundStyle(cell.t > 0 ? OnyxDomain.train.accent.opacity(0.25 + 0.75 * cell.t) : Color.onyx.hairline)
                    .cornerRadius(3)
                }
                .chartXScale(domain: weeks)
                .chartYScale(domain: 0...7)
                .chartYAxis {
                    AxisMarks(position: .trailing, values: (0..<7).map { Double($0) + 0.5 }) { value in
                        if let y = value.as(Double.self) {
                            AxisValueLabel {
                                Text(Self.days[6 - Int(y)])
                                    .font(OnyxChart.axisFont)
                                    .foregroundStyle(Color.onyx.textTertiary)
                            }
                        }
                    }
                }
                // Twelve week labels do not fit one plot width; every third.
                // Before `onyxChart`: the axis closest to the Chart wins.
                .chartXAxis {
                    AxisMarks(values: weeks) { value in
                        if let week = value.as(String.self), let i = weeks.firstIndex(of: week), i % 3 == 0 {
                            AxisValueLabel {
                                Text(week)
                                    .font(OnyxChart.axisFont)
                                    .foregroundStyle(Color.onyx.textTertiary)
                            }
                        }
                    }
                }
                .onyxChart(.train)

            } else {
                OnyxChartEmpty("Nothing in the last 12 weeks.")
            }
        }
    }

    private func caption(_ model: CalendarModel) -> String {
        let stats = model.stats
        var bestWeek: [String: Double] = [:]
        let first = model.weeks.first?.first?.date ?? today
        for s in sessions where s.date >= first { bestWeek[Week.start(of: s.date), default: 0] += s.volumeKg }
        var parts = ["\(stats.activeDays) sessions", "streak \(stats.streak) d"]
        if let best = bestWeek.values.max(), best > 0 { parts.append("best week \(ChartScale.compactKg(best)) kg") }
        return parts.joined(separator: " · ")
    }
}

// MARK: - C. Strength trends

/// Session-best estimated 1RM for the most-trained loaded exercises — one point
/// per session, the TOP set's estimate (`collapseToSessionBest`), stored
/// `est_1rm_kg` read with `||` semantics so a legacy 0 falls through to Epley.
private struct StrengthTrendsCard: View {
    let sessions: [TrendSession]
    let today: String

    @State private var selection: Date?

    private struct Point: Identifiable {
        let id: String
        let exercise: String
        let iso: String
        let date: Date
        let kg: Double
    }

    /// Most-trained first, so colour order is stable across eras.
    private var series: [WidgetE1rm] {
        var sessionsPer: [String: Set<String>] = [:]
        var rows: [WidgetSetRow] = []
        for s in sessions {
            for t in s.sets where SetTags.isWorkingSet(t.set.setType) && t.set.weightKg > 0 {
                sessionsPer[t.exerciseName, default: []].insert(s.id)
                rows.append(WidgetSetRow(
                    exercise: t.exerciseName, day: s.date, weightKg: t.set.weightKg, reps: Double(t.set.reps),
                    est1rmKg: t.set.est1rmKg, setType: t.set.setType
                ))
            }
        }
        let top = sessionsPer
            .sorted { $0.value.count != $1.value.count ? $0.value.count > $1.value.count : $0.key < $1.key }
            .prefix(4)
            .map(\.key)
        let trends = WidgetDerive.e1rmTrends(rows.filter { top.contains($0.exercise) }, asOf: today, windowDays: 28, limit: top.count)
        return top.compactMap { name in trends.first { $0.exercise == name } }
    }

    var body: some View {
        let series = series
        let points: [Point] = series.flatMap { e in
            e.trend.compactMap { p in
                OnyxChart.date(p.d).map { Point(id: "\(e.exercise)|\(p.d)", exercise: e.exercise, iso: p.d, date: $0, kg: p.v) }
            }
        }
        let domain = ChartScale.niceDomain(points.map(\.kg), hardMin: 0)
        OnyxChartCard("Strength", domain: .train) {
            if points.isEmpty {
                OnyxChartEmpty("No loaded sets yet.")
            } else {
                Chart {
                    ForEach(points) { p in
                        LineMark(x: .value("Date", p.date), y: .value("est. 1RM", p.kg))
                            .foregroundStyle(by: .value("Exercise", p.exercise))
                            .interpolationMethod(.monotone)
                        PointMark(x: .value("Date", p.date), y: .value("est. 1RM", p.kg))
                            .foregroundStyle(by: .value("Exercise", p.exercise))
                            .symbolSize(18)
                    }
                    if let picked = nearest(points, to: selection) {
                        RuleMark(x: .value("Date", picked.date))
                            .foregroundStyle(Color.onyx.textTertiary)
                            .lineStyle(StrokeStyle(lineWidth: 1))
                            .annotation(position: .top, spacing: 0, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                                OnyxCallout(OnyxChart.shortDate(picked.date), lines: series.enumerated().compactMap { i, e in
                                    points.first { $0.exercise == e.exercise && $0.iso == picked.iso }
                                        .map { OnyxCallout.Line(e.exercise, "\(jsToFixed1($0.kg)) kg", color: Color.onyx.series(i)) }
                                })
                            }
                    }
                }
                .chartForegroundStyleScale(domain: series.map(\.exercise), range: series.indices.map(Color.onyx.series))
                .chartYScale(domain: domain.0...domain.1)
                .chartXSelection(value: $selection)
                .onyxChart(.train)
                .onyxScrollable(days: 120, endingAt: OnyxChart.date(today) ?? Date())
            }
        }
    }

    /// The logged date closest to the finger.
    private func nearest(_ points: [Point], to date: Date?) -> Point? {
        guard let date else { return nil }
        return points.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) }
    }
}

// MARK: - D. Muscle focus

/// Sets per muscle family over the last four weeks, primary and assisting alike
/// (`MuscleAggregator`: a unilateral pair is one set, a family tagged twice on a
/// row is credited once).
private struct MuscleFocusCard: View {
    let sessions: [TrendSession]
    let today: String

    private var stats: [MuscleStat] {
        let from = ISODate.addDays(today, -27) ?? today
        var rows: [MuscleSetRow] = []
        for s in sessions where s.date >= from {
            for t in s.sets where t.set.setType != "ghost" {
                let movers = MuscleMap.resolveMovers(t.exerciseName)
                var groups: [String] = []
                for token in movers.primary + movers.secondary {
                    if let g = MuscleAggregator.map.first(where: { $0.0 == token.lowercased() })?.1, !groups.contains(g) { groups.append(g) }
                }
                rows.append(MuscleSetRow(
                    id: t.set.id, weightKg: t.set.weightKg, reps: Double(t.set.reps),
                    pairId: t.set.pairId, side: Self.side(t.set.side), groups: groups, date: s.date
                ))
            }
        }
        return MuscleAggregator.aggregate(rows, todayISO: today).stats
    }

    /// The aggregator compares `"L"`/`"R"`; the local row stores the long form.
    private static func side(_ stored: String?) -> String? {
        switch stored?.lowercased() {
        case "left", "l": "L"
        case "right", "r": "R"
        default: nil
        }
    }

    var body: some View {
        let stats = stats
        OnyxChartCard("Muscle focus", domain: .train, caption: "Sets per family, last 4 weeks") {
            if stats.allSatisfy({ $0.sets == 0 }) {
                OnyxChartEmpty("Nothing in the last 4 weeks.")
            } else {
                Chart(stats, id: \.group) { stat in
                    BarMark(x: .value("Sets", stat.sets), y: .value("Family", stat.group))
                        .foregroundStyle(OnyxDomain.forFamily(stat.group).accent)
                        .cornerRadius(3)
                        .annotation(position: .trailing, spacing: 4) {
                            Text("\(stat.sets)")
                                .font(.system(.caption2, design: .rounded).weight(.semibold))
                                .monospacedDigit()
                                .foregroundStyle(Color.onyx.textPrimary)
                        }
                }
                .chartYScale(domain: MuscleAggregator.groups)
                .onyxChart(.train)
            }
        }
    }
}

#if DEBUG
#Preview("Trends") {
    TrendsPreviews.view("trends")
}

#Preview("Trends — empty") {
    TrendsPreviews.view("trends-empty")
}
#endif
