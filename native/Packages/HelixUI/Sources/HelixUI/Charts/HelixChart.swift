import SwiftUI
import Charts

/// The chart kit. Swift Charts, one style modifier, no custom legend, no custom
/// scrubber.
///
/// ── WHAT THE WEB KIT WAS, AND WHY NONE OF IT COMES ACROSS ───────────────────
/// `components/charts/{ChartTooltip, SmartLegend, ChartRange, HelixViz}.tsx`
/// plus the hand-rolled SVG kit in `parts.tsx` — ~700 loc that existed because
/// recharts' tooltip, legend and brush were the wrong shape for a phone. Swift
/// Charts ships the three things that code imitated:
///
///   · `chartXSelection(value:)` — the scrub. A `RuleMark` at the selected x with
///     an `.annotation` is the tooltip; the OS owns the gesture, the haptics and
///     the accessibility of it.
///   · `chartScrollableAxes(.horizontal)` + `chartXVisibleDomain` — the range
///     rail. The user pans a window over the whole series instead of picking a
///     bucket from a segmented control.
///   · `chartLegend` — drawn from `chartForegroundStyleScale`, so the legend and
///     the marks cannot disagree, which was `SmartLegend`'s entire bug class.
///
/// What the kit DOES own is the part Apple leaves to the app: colour, type and
/// the weight of the axes. That is `helixChart(_:)`, and every chart in the app
/// wears it so the chart on the Body tab and the chart on an exercise's history
/// read as one instrument.
///
/// ── THE DATAVIZ RULES THIS ENCODES ──────────────────────────────────────────
/// · Recessive axes: grid lines are the 8 % hairline, no axis line, no ticks,
///   labels in tertiary ink. The data is the only thing that is a colour.
/// · One axis. Nothing here lets a second y-scale in; two measures are two
///   charts stacked, never one chart with two rails.
/// · Text wears text tokens, never the series colour — a value beside a mark
///   is `textPrimary` with the coloured mark carrying identity.
/// · Categorical colour is a FIXED order (`Color.helix.series`), validated on
///   black with the dataviz palette script (OKLCH L 0.48–0.67, ΔE ≥ 9 across
///   every CVD simulation, ≥ 3:1 on the surface). A seventh series is never a
///   generated hue; it is the neutral and it should have been folded.
/// · Numerals are rounded + monospaced, as everywhere else in the app.
public struct HelixChartStyle: ViewModifier {
    let domain: HelixDomain

    public func body(content: Content) -> some View {
        content
            .foregroundStyle(domain.accent)
            .chartXAxis {
                AxisMarks(preset: .aligned) { _ in
                    AxisGridLine().foregroundStyle(Color.helix.hairline)
                    AxisValueLabel()
                        .font(HelixChart.axisFont)
                        .foregroundStyle(Color.helix.textTertiary)
                }
            }
            .chartYAxis {
                AxisMarks(position: .trailing) { _ in
                    AxisGridLine().foregroundStyle(Color.helix.hairline)
                    AxisValueLabel()
                        .font(HelixChart.axisFont)
                        .foregroundStyle(Color.helix.textTertiary)
                }
            }
            .chartPlotStyle { plot in plot.background(.clear) }
            .chartLegend(position: .top, alignment: .leading, spacing: 8)
            // Selection and pan tracks the finger 1:1 and never animates; the
            // only motion a chart makes is the data changing under it, and
            // under Reduce Motion even that is a cut.
            .transaction { t in if HelixChart.reduceMotion { t.animation = nil } }
    }
}

public extension View {
    /// The one chart modifier. Colour, type, axis weight — everything a chart
    /// should not decide for itself.
    func helixChart(_ domain: HelixDomain) -> some View {
        modifier(HelixChartStyle(domain: domain))
    }

    /// A pannable window over a dated x-axis, parked on the newest data.
    ///
    /// This replaces `ChartRange.tsx`: instead of picking 30/90/180 from a
    /// segmented control and re-fetching, the whole series is on the chart and
    /// the user pans. `days` is how much of it fits in the plot at once.
    func helixScrollable(days: Int, endingAt end: Date = Date()) -> some View {
        self
            .chartScrollableAxes(.horizontal)
            .chartXVisibleDomain(length: TimeInterval(days) * 86_400)
            .chartScrollPosition(initialX: end.addingTimeInterval(-TimeInterval(days) * 86_400))
    }
}

public enum HelixChart {
    /// Axis labels: the app's numeral face at caption size.
    public static let axisFont: Font = .system(.caption2, design: .rounded).monospacedDigit()

    /// The default plot height. Charts scale their TYPE with Dynamic Type; the
    /// plot itself keeps a fixed height because a taller plot is not more
    /// legible, and the hairline grid would spread until it read as empty.
    public static let plotHeight: CGFloat = 180

    /// Read once per draw; a chart has no ambient motion, so this only decides
    /// whether a data change cross-fades or cuts.
    static var reduceMotion: Bool { UIAccessibility.isReduceMotionEnabled }

    /// A short date for an x-axis or a callout: "4 Sep".
    public static func shortDate(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.abbreviated))
    }

    /// ISO `yyyy-MM-dd` → `Date` at local midnight, the x-value every dated
    /// series plots on. Every domain series is keyed by ISO string; the chart
    /// is the one place a `Date` is wanted, so the conversion lives here.
    public static func date(_ iso: String) -> Date? {
        var parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        let day = parts.removeLast(), month = parts.removeLast(), year = parts.removeLast()
        return Calendar.current.date(from: DateComponents(year: year, month: month, day: day))
    }
}

public extension Color.helix {
    /// Categorical series colour, in FIXED order. Validated on black:
    /// L 0.48–0.67 · chroma ≥ 0.1 · worst adjacent CVD ΔE 9.1 · ≥ 3:1.
    ///
    /// Ion, Tide, Solar, Lunar, then the far stop of Ion and Solar — the four
    /// domains first so a two-series chart in the Body tab is still Tide and
    /// something, not two strangers.
    static let series: [Color] = [
        Color(hex: 0x7C5CFF),
        Color(hex: 0x10A08A),
        Color(hex: 0xD9752A),
        Color(hex: 0x8271E8),
        Color(hex: 0x1E9DBD),
        Color(hex: 0xDB4B66),
    ]

    /// Series `index`, or the neutral past the sixth: a seventh series is a
    /// chart that should have been two, and it does not get a colour that
    /// pretends otherwise.
    static func series(_ index: Int) -> Color {
        index >= 0 && index < series.count ? series[index] : textTertiary
    }
}

/// The scrub callout: what `RuleMark(x:).annotation { }` shows at the selected
/// x. Glass, a caption and one or more numerals in text ink.
///
/// `chartXSelection` gives the x; the caller resolves the y-values for that x
/// (there may be several series) and hands them here as label/value pairs, so
/// the callout never re-derives data.
public struct HelixCallout: View {
    public struct Line: Identifiable {
        public let id: String
        public let label: String
        public let value: String
        public let color: Color?
        public init(_ label: String, _ value: String, color: Color? = nil) {
            self.id = label; self.label = label; self.value = value; self.color = color
        }
    }

    let title: String
    let lines: [Line]

    public init(_ title: String, lines: [Line]) {
        self.title = title
        self.lines = lines
    }

    public init(_ title: String, value: String) {
        self.init(title, lines: [Line("", value)])
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(Color.helix.textSecondary)
            ForEach(lines) { line in
                HStack(spacing: 5) {
                    if let color = line.color {
                        Circle().fill(color).frame(width: 6, height: 6)
                    }
                    if !line.label.isEmpty {
                        Text(line.label)
                            .font(.caption2)
                            .foregroundStyle(Color.helix.textSecondary)
                    }
                    Text(line.value)
                        .font(.system(.caption, design: .rounded).weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(Color.helix.textPrimary)
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .helixGlass(.row)
    }
}

/// A titled chart on a tile. The header carries the name, an optional headline
/// value (the latest reading, in the domain's accent) and the chart sits under
/// it at `HelixChart.plotHeight`.
public struct HelixChartCard<Content: View>: View {
    let title: String
    let domain: HelixDomain
    let headline: String?
    let caption: String?
    let content: Content

    public init(
        _ title: String,
        domain: HelixDomain,
        headline: String? = nil,
        caption: String? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.domain = domain
        self.headline = headline
        self.caption = caption
        self.content = content()
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(title.uppercased())
                    .font(.caption.weight(.semibold))
                    .tracking(0.6)
                    .foregroundStyle(domain.accent)
                Spacer(minLength: 8)
                if let headline {
                    Text(headline)
                        .font(.system(.title3, design: .rounded).weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(Color.helix.textPrimary)
                        .contentTransition(.numericText())
                }
            }
            if let caption {
                Text(caption)
                    .font(.footnote)
                    .foregroundStyle(Color.helix.textSecondary)
            }
            content
                .frame(height: HelixChart.plotHeight)
        }
        .padding(14)
        .helixGlass(.tile)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(headline.map { "\(title), \($0)" } ?? title)
    }
}

/// What a chart shows when the series is empty. Stock, so it looks like every
/// other empty state on the device.
public struct HelixChartEmpty: View {
    let message: String
    public init(_ message: String = "Nothing logged yet.") { self.message = message }
    public var body: some View {
        ContentUnavailableView {
            Label("No data", systemImage: "chart.xyaxis.line")
        } description: {
            Text(message)
        }
        .frame(maxWidth: .infinity, minHeight: HelixChart.plotHeight)
    }
}
