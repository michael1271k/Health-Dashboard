import SwiftUI
import Charts
import HelixUI
import HelixCore
import HelixData

/// Body & Vitals over time — the Body tab's trends screen.
///
/// One column of chart cards on the Tide ground: the scale, its ledger, steps,
/// then the four vitals groups. Everything comes from ONE range read at
/// appearance (`bodyVitals`); the screen is a push, so a fresh push after a
/// weigh-in is the refresh. Every chart is Swift Charts wearing `helixChart`,
/// pans over the whole window and scrubs with the system selection — no
/// custom legend, no custom tooltip, one y-axis each.
struct BodyTrendsView: View {
    @Environment(AppEnvironment.self) private var environment

    /// Supplied only by previews and the screenshot harness.
    var seeded: BodyVitalsSlice?

    @State private var slice: BodyVitalsSlice?

    var body: some View {
        Group {
            if let slice {
                BodyTrendsScreen(slice: slice)
            } else {
                ProgressView().controlSize(.large)
            }
        }
        .helixScreen(.body)
        .navigationTitle("Trends")
        .navigationBarTitleDisplayMode(.large)
        .task {
            if slice == nil { slice = seeded ?? ((try? load()) ?? .empty) }
        }
    }

    private func load() throws -> BodyVitalsSlice {
        let to = LogicalDay.today()
        return try environment.database.bodyVitals(
            userId: environment.userIdString, from: ISODate.addDays(to, -(Trend.windowDays - 1)) ?? to, to: to
        )
    }
}

private struct BodyTrendsScreen: View {
    let slice: BodyVitalsSlice

    var body: some View {
        let readings = BodyVitals.readings(ledger: slice.ledger, logs: slice.logs)
        let recent = ISODate.addDays(LogicalDay.today(), -55) ?? LogicalDay.today()
        let logs = slice.logs.filter { $0.date >= recent }
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                CompositionSection(readings: readings, goals: slice.goals)
                LedgerSection(readings: readings, goals: slice.goals)
                StepsSection(
                    steps: BodyVitals.steps(metrics: slice.metrics.filter { $0.date >= recent }, logs: logs),
                    goal: slice.goals?.stepsGoal
                )
                ForEach(VitalGroup.allCases) { VitalGroupCard(group: $0, logs: logs) }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
    }
}

/// A row that stacks at accessibility sizes: an `HStack` of a header and a
/// picker, or a date and a number, is three one-word columns at AX5.
@ViewBuilder
private func accessibleRow<Content: View>(spacing: CGFloat = 8, @ViewBuilder _ content: () -> Content) -> some View {
    AccessibleRow(spacing: spacing, content: content())
}

private struct AccessibleRow<Content: View>: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    let spacing: CGFloat
    let content: Content
    var body: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
            : AnyLayout(HStackLayout(spacing: spacing))
        layout { content }
    }
}

// MARK: - Shared chart arithmetic

/// What every dated chart on this screen needs and Swift Charts leaves to the
/// app: which point the finger is nearest, where a line must break, and how
/// tight the y-axis sits on the data.
enum Trend {
    /// How far back the one read goes.
    static let windowDays = 90

    struct Run { let point: TrendPoint; let run: Int }

    /// A gap in the dates is a gap in the line: consecutive days share a run,
    /// a missing day starts a new one, and `series:` on the mark breaks the
    /// stroke between runs. Nothing is ever plotted for the missing day.
    static func runs(_ series: [TrendPoint]) -> [Run] {
        var out: [Run] = []
        var run = 0
        var previous: Int?
        for p in series {
            let n = ISODate.dayNumber(p.d)
            if let previous, let n, n - previous > 1 { run += 1 }
            out.append(Run(point: p, run: run))
            previous = n
        }
        return out
    }

    struct Hit { let point: TrendPoint; let date: Date }

    /// The reading nearest the scrubbed x, within three and a half days of it.
    /// Scale readings are sparse by protocol, so "the day under the finger" is
    /// usually a day with nothing on it; the nearest reading is what Health
    /// shows and what the finger meant.
    static func nearest(_ series: [TrendPoint], to selected: Date) -> Hit? {
        let hits = series.compactMap { p in HelixChart.date(p.d).map { Hit(point: p, date: $0) } }
        guard let hit = hits.min(by: { abs($0.date.timeIntervalSince(selected)) < abs($1.date.timeIntervalSince(selected)) }),
              abs(hit.date.timeIntervalSince(selected)) <= 3.5 * 86_400 else { return nil }
        return hit
    }

    /// The tight domain as a range, for `chartYScale`.
    static func domain(_ values: [Double?]) -> ClosedRange<Double> {
        let (lo, hi) = ChartScale.tightDomain(values)
        return lo...hi
    }

    static let dash = StrokeStyle(lineWidth: 1, dash: [4, 3])
}

// MARK: - A. Composition

/// What the picker can put on the one y-axis. Switching swaps the series; it
/// never adds a rail.
private enum BodyPlot: String, CaseIterable, Identifiable {
    case weight, fat, skeletal, lean, ffm, visceral, whr

    var id: String { rawValue }

    var label: String {
        switch self {
        case .weight:   "Weight"
        case .fat:      "Body fat"
        case .skeletal: "Skeletal muscle"
        case .lean:     "Lean soft tissue"
        case .ffm:      "Fat-free mass"
        case .visceral: "Visceral fat"
        case .whr:      "W:H ratio"
        }
    }

    func value(_ r: BodyReading) -> Double? {
        switch self {
        case .weight:   r.weight
        case .fat:      r.fatPct
        case .skeletal: r.skeletalMuscle
        case .lean:     r.leanSoftTissue
        case .ffm:      r.fatFreeMass
        case .visceral: r.visceral
        case .whr:      r.waistToHip
        }
    }

    func format(_ v: Double?) -> String {
        guard let v else { return "—" }
        switch self {
        case .weight, .skeletal, .lean, .ffm: return "\(jsToFixed(v, 1)) kg"
        case .fat:      return "\(jsToFixed(v, 1)) %"
        case .visceral: return jsToFixed(v, 0)
        case .whr:      return jsToFixed(v, 2)
        }
    }
}

private struct CompositionSection: View {
    let readings: [BodyReading]
    let goals: UserGoalRow?

    @State private var plot: BodyPlot = .weight
    @State private var selected: Date?

    private var series: [TrendPoint] {
        readings.compactMap { r in plot.value(r).map { TrendPoint(d: r.date, v: $0) } }
    }

    private var target: Double? { plot == .weight ? goals?.targetWeightKg : nil }

    var body: some View {
        let series = series
        VStack(alignment: .leading, spacing: 8) {
            accessibleRow {
                HelixSectionHeader("Composition", .body)
                Spacer(minLength: 8)
                Picker("Metric", selection: $plot) {
                    ForEach(BodyPlot.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.menu)
                .tint(Color.helix.accent(.body))
                .accessibilityLabel("Composition metric")
            }
            HelixChartCard(plot.label, domain: .body, headline: series.last.map { plot.format($0.v) }) {
                if series.isEmpty {
                    HelixChartEmpty("No \(plot.label.lowercased()) readings yet.")
                } else {
                    chart(series)
                }
            }
        }
        .onChange(of: plot) { selected = nil }
    }

    private func chart(_ series: [TrendPoint]) -> some View {
        Chart {
            ForEach(series, id: \.d) { p in
                if let date = HelixChart.date(p.d) {
                    LineMark(x: .value("Day", date, unit: .day), y: .value(plot.label, p.v))
                        .interpolationMethod(.monotone)
                    PointMark(x: .value("Day", date, unit: .day), y: .value(plot.label, p.v))
                        .symbolSize(24)
                }
            }
            if let target {
                RuleMark(y: .value("Target", target))
                    .lineStyle(Trend.dash)
                    .foregroundStyle(Color.helix.textTertiary)
                    .annotation(position: .top, alignment: .trailing) {
                        Text("Target \(jsToFixed(target, 1)) kg")
                            .font(HelixChart.axisFont)
                            .foregroundStyle(Color.helix.textTertiary)
                    }
            }
            if let selected, let hit = Trend.nearest(series, to: selected),
               let reading = readings.first(where: { $0.date == hit.point.d }) {
                RuleMark(x: .value("Day", hit.date, unit: .day))
                    .foregroundStyle(Color.helix.textTertiary)
                    .annotation(position: .top, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        HelixCallout(HelixChart.shortDate(hit.date), lines: [
                            .init("Weight", BodyPlot.weight.format(reading.weight)),
                            .init("Body fat", BodyPlot.fat.format(reading.fatPct)),
                            .init("Skeletal", BodyPlot.skeletal.format(reading.skeletalMuscle)),
                        ])
                    }
            }
        }
        .chartYScale(domain: Trend.domain(series.map { Optional($0.v) } + [target]))
        .chartXSelection(value: $selected)
        .helixScrollable(days: 90)
        .helixChart(.body)
    }
}

// MARK: - B. Ledger

/// The last ten weigh-ins, each judged against the one before by the phase's
/// own rule (`DeltaVerdict`): a maintenance day has a dead band, a cut wants
/// the number down, a bulk wants it up. Rows, not a `List` — a `List` inside
/// the screen's scroll view would fight it for the gesture.
private struct LedgerSection: View {
    let readings: [BodyReading]
    let goals: UserGoalRow?

    private struct Entry: Identifiable {
        let reading: BodyReading
        let delta: Double?
        var id: String { reading.date }
    }

    private var entries: [Entry] {
        let weighed = readings.filter { $0.weight != nil }
        return weighed.indices.suffix(10).reversed().map { i in
            var delta: Double?
            if i > 0, let now = weighed[i].weight, let before = weighed[i - 1].weight {
                delta = jsRound((now - before) * 100) / 100
            }
            return Entry(reading: weighed[i], delta: delta)
        }
    }

    var body: some View {
        let entries = entries
        VStack(alignment: .leading, spacing: 8) {
            HelixSectionHeader("Ledger", .body)
            VStack(spacing: 0) {
                if entries.isEmpty {
                    Text("No weigh-ins in the last \(Trend.windowDays) days.")
                        .font(.footnote)
                        .foregroundStyle(Color.helix.textSecondary)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                }
                ForEach(entries) { entry in
                    row(entry)
                    if entry.id != entries.last?.id { Divider().overlay(Color.helix.hairline) }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 4)
            .helixGlass(.tile)
        }
    }

    private func row(_ entry: Entry) -> some View {
        let date = HelixChart.date(entry.reading.date).map(HelixChart.shortDate) ?? entry.reading.date
        return accessibleRow(spacing: 12) {
            Text(date)
                .font(.subheadline)
                .foregroundStyle(Color.helix.textSecondary)
            Spacer(minLength: 8)
            if let delta = entry.delta, delta != 0 {
                Text("\(delta > 0 ? "+" : "−")\(jsToFixed(abs(delta), 1))")
                    .font(.system(.footnote, design: .rounded).weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(color(verdict(delta, on: entry.reading.date)))
                    .accessibilityLabel("\(delta > 0 ? "up" : "down") \(jsToFixed(abs(delta), 1)) kilograms")
            }
            Text(BodyPlot.weight.format(entry.reading.weight))
                .font(.system(.body, design: .rounded).weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(Color.helix.textPrimary)
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }

    private func verdict(_ delta: Double, on date: String) -> Verdict {
        DeltaVerdict.verdict(
            .weight, delta: delta,
            phase: ProgramPhase.stored(goals?.activePhase ?? goals?.goalPreset),
            maintenance: Maintenance.isMaintenanceDate(
                date, stored: goals?.activeLever, until: goals?.maintenanceUntil, today: LogicalDay.today()
            )
        )
    }

    private func color(_ verdict: Verdict) -> Color {
        switch verdict {
        case .good:    Color.helix.good
        case .bad:     Color.helix.danger
        case .neutral: Color.helix.textSecondary
        }
    }
}

// MARK: - C. Steps

/// Daily steps against the goal. Above-goal days wear Tide, the rest wear
/// tertiary ink — status colours stay reserved; a short day is not a failure.
private struct StepsSection: View {
    let steps: [TrendPoint]
    let goal: Int?

    @State private var selected: Date?

    private static func count(_ v: Double) -> String { Int(jsRound(v)).formatted() }

    var body: some View {
        let week = BodyVitals.weekly(steps, roll: .mean).last
        VStack(alignment: .leading, spacing: 8) {
            HelixSectionHeader("Steps", .body)
            HelixChartCard(
                "Daily steps", domain: .body,
                headline: steps.last.map { Self.count($0.v) },
                caption: week.map { w in
                    "This week \(Self.count(w.v)) a day" + (goal.map { " · goal \($0.formatted())" } ?? "")
                }
            ) {
                if steps.isEmpty {
                    HelixChartEmpty("No steps from Apple Health yet.")
                } else {
                    chart
                }
            }
        }
    }

    private var chart: some View {
        Chart {
            ForEach(steps, id: \.d) { p in
                if let date = HelixChart.date(p.d) {
                    BarMark(x: .value("Day", date, unit: .day), y: .value("Steps", p.v))
                        .foregroundStyle(goal.map { p.v >= Double($0) } ?? true ? Color.helix.accent(.body) : Color.helix.textTertiary)
                        .cornerRadius(3)
                }
            }
            if let goal {
                RuleMark(y: .value("Goal", goal))
                    .lineStyle(Trend.dash)
                    .foregroundStyle(Color.helix.textTertiary)
                    .annotation(position: .top, alignment: .trailing) {
                        Text("Goal \(goal.formatted())")
                            .font(HelixChart.axisFont)
                            .foregroundStyle(Color.helix.textTertiary)
                    }
            }
            if let selected, let hit = Trend.nearest(steps, to: selected) {
                RuleMark(x: .value("Day", hit.date, unit: .day))
                    .foregroundStyle(Color.helix.textTertiary)
                    .annotation(position: .top, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        HelixCallout(HelixChart.shortDate(hit.date), value: "\(Self.count(hit.point.v)) steps")
                    }
            }
        }
        .chartYScale(domain: 0...ChartScale.niceDomain(steps.map { Optional($0.v) } + [goal.map(Double.init)], zeroBased: true).1)
        .chartXSelection(value: $selected)
        .helixScrollable(days: 28)
        .helixChart(.body)
    }
}
