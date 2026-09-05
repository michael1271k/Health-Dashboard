import SwiftUI
import Charts
import OnyxUI
import OnyxCore
import OnyxData

/// The vitals table — `VitalsGroups.tsx`'s `GROUPS` and `MetricDef` as data.
///
/// A group is one card with a picker; a metric is a column on `daily_logs`, a
/// roll-up and a formatter. Steps are not here: they have their own bar chart on
/// the same screen. Sleep moved from Rhythm into Recovery because it is the
/// overnight signal the group's blurb already claims, and Lunar is its accent.
enum VitalGroup: String, CaseIterable, Identifiable {
    case recovery, respiratory, engine, rhythm

    var id: String { rawValue }

    var title: String {
        switch self {
        case .recovery:    "Recovery"
        case .respiratory: "Respiratory"
        case .engine:      "Fitness engine"
        case .rhythm:      "Rhythm"
        }
    }

    var domain: OnyxDomain { self == .recovery ? .recover : .body }

    var metrics: [VitalMetric] {
        switch self {
        case .recovery: [
            VitalMetric("hrv", "HRV", roll: .mean, format: { VitalMetric.fixed($0, 0, "ms") }) { positive($0.hrvMs) },
            VitalMetric("rhr", "Resting HR", roll: .mean, format: { VitalMetric.fixed($0, 0, "bpm") }) { positive($0.avgRestHeartRate.map(Double.init)) },
            VitalMetric("wrist", "Wrist temp", roll: .mean, format: { VitalMetric.fixed($0, 1, "°C") }) { positive($0.wristTempDelta) },
            VitalMetric("sleep", "Sleep", roll: .mean, format: { Format.sleep($0) }) { positive($0.sleepMinutes.map(Double.init)) },
        ]
        case .respiratory: [
            VitalMetric("rr", "Respiratory rate", roll: .mean, format: { VitalMetric.fixed($0, 1, "br/min") }) { positive($0.respiratoryRate) },
            VitalMetric("spo2", "Blood O₂", roll: .mean, format: { VitalMetric.fixed($0, 0, "%") }) { positive(Format.normalizeSpO2($0.bloodOxygen)) },
        ]
        case .engine: [
            VitalMetric("train", "Training", roll: .sum, format: { VitalMetric.fixed($0, 0, "min") }) { ($0.exerciseMinutes ?? $0.trainingMinutes).map(Double.init) },
            VitalMetric("energy", "Active energy", roll: .sum, format: { "\(Int(jsRound($0)).formatted()) kcal" }) { $0.activeEnergy },
        ]
        case .rhythm: [
            VitalMetric("daylight", "Daylight", roll: .sum, format: { VitalMetric.fixed($0, 1, "h") }) { $0.timeInDaylightMin.map { Double($0) / 60 } },
            VitalMetric("stand", "Stand", roll: .mean, format: { VitalMetric.fixed($0, 1, "h/d") }) { $0.standHours.map(Double.init) },
        ]
        }
    }
}

/// Zero is not a reading for an autonomic signal — treat it as no data.
private func positive(_ v: Double?) -> Double? { v.flatMap { $0 > 0 ? $0 : nil } }

struct VitalMetric: Identifiable {
    let id: String
    let label: String
    let roll: BodyVitals.Roll
    let format: (Double) -> String
    let pick: (DailyLogRow) -> Double?

    init(_ id: String, _ label: String, roll: BodyVitals.Roll, format: @escaping (Double) -> String, pick: @escaping (DailyLogRow) -> Double?) {
        self.id = id
        self.label = label
        self.roll = roll
        self.format = format
        self.pick = pick
    }

    /// "52 ms" — `jsToFixed`, so a .5 rounds the way every other number here does.
    static func fixed(_ v: Double, _ digits: Int, _ unit: String) -> String {
        "\(jsToFixed(v, digits)) \(unit)"
    }
}

/// One group: a header with the metric picker, then the chart card for the
/// chosen metric. The headline is the newest reading; the caption is this
/// week's roll-up beside last week's, Sunday-anchored.
struct VitalGroupCard: View {
    let group: VitalGroup
    let logs: [DailyLogRow]

    @State private var key: String
    @State private var selected: Date?

    init(group: VitalGroup, logs: [DailyLogRow]) {
        self.group = group
        self.logs = logs
        _key = State(initialValue: group.metrics[0].id)
    }

    private var metric: VitalMetric { group.metrics.first { $0.id == key } ?? group.metrics[0] }

    private var series: [TrendPoint] {
        WidgetDerive.trendPoints(logs.map { DatedValue(date: $0.date, value: metric.pick($0)) }, limit: .max)
    }

    var body: some View {
        let series = series
        let weeks = BodyVitals.weekly(series, roll: metric.roll)
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                OnyxSectionHeader(group.title, group.domain)
                Spacer(minLength: 8)
                Picker("Metric", selection: $key) {
                    ForEach(group.metrics) { Text($0.label).tag($0.id) }
                }
                .pickerStyle(.menu)
                .tint(group.domain.accent)
                .accessibilityLabel("\(group.title) metric")
            }
            OnyxChartCard(
                metric.label, domain: group.domain,
                headline: series.last.map { metric.format($0.v) },
                caption: caption(weeks)
            ) {
                if series.isEmpty {
                    OnyxChartEmpty("No \(metric.label.lowercased()) from Apple Health yet.")
                } else {
                    chart(series)
                }
            }
        }
        .onChange(of: key) { selected = nil }
    }

    private func caption(_ weeks: [TrendPoint]) -> String? {
        guard let week = weeks.last else { return nil }
        let word = metric.roll == .sum ? "total" : "mean"
        let prior = weeks.dropLast().last.map { " · last week \(metric.format($0.v))" } ?? ""
        return "This week \(word) \(metric.format(week.v))\(prior)"
    }

    private func chart(_ series: [TrendPoint]) -> some View {
        Chart {
            ForEach(Trend.runs(series), id: \.point.d) { run in
                if let date = OnyxChart.date(run.point.d) {
                    LineMark(x: .value("Day", date, unit: .day), y: .value(metric.label, run.point.v), series: .value("Run", run.run))
                        .interpolationMethod(.monotone)
                    PointMark(x: .value("Day", date, unit: .day), y: .value(metric.label, run.point.v))
                        .symbolSize(18)
                }
            }
            if let selected, let hit = Trend.nearest(series, to: selected) {
                RuleMark(x: .value("Day", hit.date, unit: .day))
                    .foregroundStyle(Color.onyx.textTertiary)
                    .annotation(position: .top, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        OnyxCallout(OnyxChart.shortDate(hit.date), value: metric.format(hit.point.v))
                    }
            }
        }
        .chartYScale(domain: Trend.domain(series.map(\.v)))
        .chartXSelection(value: $selected)
        .onyxScrollable(days: 28)
        .onyxChart(group.domain)
    }
}
