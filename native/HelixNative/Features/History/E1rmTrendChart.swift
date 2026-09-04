import SwiftUI
import Charts
import HelixUI
import HelixCore

/// Estimated-1RM over time, one line per exercise — the Progression Trail on
/// a session report and the trend on an exercise's page are the same chart
/// with one series or several.
///
/// The scrub is the OS's: `chartXSelection` gives a date, the nearest plotted
/// date snaps to it, and a `RuleMark` with a `HelixCallout` is the tooltip.
/// Nothing here is a legend or a scrubber of its own.
struct E1rmTrendChart: View {
    let series: [SessionAnalysis.TrailSeries]
    /// A pannable window in days, or nil for the whole span on one plot.
    var scrollDays: Int? = nil

    @State private var selected: Date?

    private var dates: [Date] {
        Array(Set(series.flatMap { $0.points.compactMap { HelixChart.date($0.date) } })).sorted()
    }

    private var yDomain: ClosedRange<Double> {
        let (lo, hi) = ChartScale.niceDomain(series.flatMap { $0.points.map { Optional($0.kg) } })
        return lo...hi
    }

    var body: some View {
        if let scrollDays {
            chart.helixScrollable(days: scrollDays, endingAt: dates.last ?? Date())
        } else {
            chart
        }
    }

    private var chart: some View {
        Chart {
            ForEach(series) { s in
                ForEach(s.points, id: \.date) { p in
                    if let date = HelixChart.date(p.date) {
                        LineMark(x: .value("Date", date), y: .value("kg", p.kg))
                            .foregroundStyle(by: .value("Exercise", s.id))
                        PointMark(x: .value("Date", date), y: .value("kg", p.kg))
                            .foregroundStyle(by: .value("Exercise", s.id))
                            .symbolSize(24)
                    }
                }
            }
            if let picked = nearest(selected) {
                RuleMark(x: .value("Selected", picked))
                    .foregroundStyle(Color.helix.textTertiary)
                    .annotation(position: .top, spacing: 0, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        HelixCallout(HelixChart.shortDate(picked), lines: lines(at: picked))
                    }
            }
        }
        .chartForegroundStyleScale(domain: series.map(\.id), range: series.indices.map { Color.helix.series($0) })
        .chartLegend(series.count > 1 ? .visible : .hidden)
        .chartYScale(domain: yDomain)
        .chartXSelection(value: $selected)
        .helixChart(.train)
        .accessibilityLabel("Estimated one rep max over time")
    }

    /// The plotted date closest to the finger.
    private func nearest(_ date: Date?) -> Date? {
        guard let date else { return nil }
        return dates.min { abs($0.timeIntervalSince(date)) < abs($1.timeIntervalSince(date)) }
    }

    private func lines(at date: Date) -> [HelixCallout.Line] {
        series.enumerated().compactMap { i, s in
            guard let p = s.points.first(where: { HelixChart.date($0.date) == date }) else { return nil }
            return HelixCallout.Line(series.count > 1 ? s.id : "", "\(jsIntegerString(jsRound1(p.kg))) kg", color: series.count > 1 ? Color.helix.series(i) : nil)
        }
    }
}
