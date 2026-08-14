import WidgetKit
import SwiftUI

// MARK: - Palette
//
// Mirrors src/lib/theme/palette.ts. Helix has no light theme — the app is
// obsidian on every surface — so `WidgetBackground.colorset` carries one
// universal colour rather than a light/dark pair. A light-mode widget would be
// the only pale Helix surface in existence and would read as broken sitting
// beside the app it opens. iOS 18's TINTED mode is handled instead, properly:
// see `widgetRenderingMode` below.

private enum Helix {
    static let ember    = Color(red: 0.878, green: 0.439, blue: 0.235)
    static let sapphire = Color(red: 0.239, green: 0.478, blue: 0.722)
    static let emerald  = Color(red: 0.243, green: 0.620, blue: 0.478)
    static let gold     = Color(red: 0.831, green: 0.686, blue: 0.216)
    static let oxide    = Color(red: 0.769, green: 0.318, blue: 0.306)
    static let steel    = Color(red: 0.557, green: 0.604, blue: 0.675)
    static let muted    = Color(white: 0.55)
    static let background = Color("WidgetBackground")
}

// MARK: - Timeline

struct HelixEntry: TimelineEntry {
    let date: Date
    let snapshot: HelixSnapshot?
    let status: HelixSnapshotClient.Status

    /// Showing a cached snapshot because the live fetch failed.
    var isStale: Bool { snapshot != nil && status != .ok }
    /// Nothing to draw at all — the diagnostic face takes over.
    var isEmpty: Bool { snapshot == nil }
}

struct HelixProvider: TimelineProvider {
    func placeholder(in context: Context) -> HelixEntry {
        HelixEntry(date: Date(), snapshot: nil, status: .ok)
    }

    func getSnapshot(in context: Context, completion: @escaping (HelixEntry) -> Void) {
        Task {
            let (snap, status) = await HelixSnapshotClient.fetchWithFallback()
            completion(HelixEntry(date: Date(), snapshot: snap, status: status))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HelixEntry>) -> Void) {
        Task {
            let (snap, status) = await HelixSnapshotClient.fetchWithFallback()
            let entry = HelixEntry(date: Date(), snapshot: snap, status: status)
            // Retry sooner after a failure than after a success: 30 minutes of a
            // widget saying "can't reach HELIX" when the phone regained signal
            // 40 seconds later is a widget nobody trusts again.
            let minutes = status == .ok ? 30 : 5
            let next = Calendar.current.date(byAdding: .minute, value: minutes, to: Date())
                ?? Date().addingTimeInterval(TimeInterval(minutes * 60))
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }
}

// MARK: - Primitives
//
// ── THE ONE RULE THESE EXIST TO ENFORCE ──────────────────────────────────────
// Every one of these takes an OPTIONAL and renders an em dash for nil. The
// previous versions wrote `entry.snapshot?.week.sessions ?? 0`, which is not a
// blank widget — it is a widget confidently reporting zero sessions, zero
// volume, zero PRs and a 0% battery on a week you trained five times. That is
// the "widgets show empty data" symptom, and it is a bug independent of whether
// the network works: `src/lib/widget/snapshot.ts` states the contract in its
// header — a widget showing "—" is correct, one showing an invented number is
// not — and the Swift side was the half that ignored it.

private struct Dash: View {
    var size: CGFloat = 20
    var body: some View {
        Text("—")
            .font(.system(size: size, weight: .bold))
            .foregroundStyle(Helix.muted)
    }
}

/// A big number, or an em dash. Never a zero standing in for "unknown".
private struct BigValue: View {
    let value: String?
    var size: CGFloat = 30
    var color: Color = .white
    var body: some View {
        if let value {
            Text(value)
                .font(.system(size: size, weight: .bold))
                .foregroundStyle(color)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
        } else {
            Dash(size: size)
        }
    }
}

/// A progress rail. `nil` draws the empty track only — an unfilled bar reads as
/// "no reading", where a zero-width fill on a coloured track reads as "zero".
private struct Rail: View {
    let progress: Double?
    let color: Color
    var height: CGFloat = 4
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.08))
                if let progress {
                    Capsule().fill(color)
                        .frame(width: max(0, CGFloat(progress) * geo.size.width))
                }
            }
        }
        .frame(height: height)
    }
}

/// The battery ring. A nil battery draws the track dimmed and an em dash in the
/// middle, rather than a full circle of "0%".
private struct BatteryRing: View {
    let pct: Int?
    var size: CGFloat = 74
    var lineWidth: CGFloat = 8

    private var color: Color {
        guard let pct else { return Helix.muted }
        return pct >= 60 ? Helix.emerald : pct >= 30 ? Helix.gold : Helix.oxide
    }

    var body: some View {
        ZStack {
            Circle().stroke(.white.opacity(0.08), lineWidth: lineWidth)
            if let pct {
                Circle().trim(from: 0, to: Double(pct) / 100)
                    .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .shadow(color: color.opacity(0.5), radius: 4)
            }
            VStack(spacing: 0) {
                BigValue(value: pct.map { "\($0)" }, size: size * 0.27, color: .white)
                Text("BATT")
                    .font(.system(size: size * 0.11, weight: .bold))
                    .foregroundStyle(Helix.muted)
            }
        }
        .frame(width: size, height: size)
    }
}

private struct Caption: View {
    let text: String
    var color: Color = Helix.ember
    init(_ text: String, color: Color = Helix.ember) {
        self.text = text
        self.color = color
    }
    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .heavy)).tracking(1.5)
            .foregroundStyle(color)
    }
}

private struct Metric: View {
    let value: String?
    let label: String
    var color: Color = .white
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            BigValue(value: value, size: 19, color: color)
            Text(label).font(.caption2).foregroundStyle(Helix.muted)
        }
    }
}

/// "offline · last known", shown only when a CACHED snapshot is on screen. A
/// number you cannot date is worse than no number.
private struct StaleTag: View {
    var body: some View {
        Text("last known")
            .font(.system(size: 8, weight: .semibold))
            .foregroundStyle(Helix.muted)
    }
}

/// What to do about it, not just that something is wrong.
private struct Unavailable: View {
    let status: HelixSnapshotClient.Status
    var compact = false

    private var symbol: String {
        switch status {
        case .notConfigured: return "key.slash"
        case .unauthorized:  return "lock.trianglebadge.exclamationmark"
        default:             return "wifi.exclamationmark"
        }
    }
    private var title: String {
        switch status {
        case .notConfigured: return "Not configured"
        case .unauthorized:  return "Token rejected"
        default:             return "Can't reach HELIX"
        }
    }
    private var detail: String {
        switch status {
        case .notConfigured: return "Add HELIX_SNAPSHOT_URL / TOKEN to Secrets.xcconfig and rebuild."
        case .unauthorized:  return "Rotate the row in widget_tokens and rebuild."
        default:             return "Retrying shortly."
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: symbol).font(.system(size: 14)).foregroundStyle(Helix.oxide)
            Text(title).font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
            if !compact {
                Text(detail)
                    .font(.system(size: 9))
                    .foregroundStyle(Helix.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Faces

/// Small · what is left to eat today.
struct FuelView: View {
    let entry: HelixEntry
    @Environment(\.widgetRenderingMode) private var mode

    private var s: HelixSnapshot? { entry.snapshot }
    private var proteinProgress: Double? {
        HelixSnapshot.progress(s?.macros.proteinG, s?.macros.proteinGoalG)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if entry.isEmpty {
                Unavailable(status: entry.status, compact: true)
            } else {
                Caption("KCAL LEFT")
                BigValue(value: s?.caloriesRemaining.map { "\($0)" })
                Spacer(minLength: 0)
                HStack(spacing: 4) {
                    Image(systemName: "fork.knife").font(.system(size: 9)).foregroundStyle(Helix.emerald)
                    BigValue(
                        value: s?.macros.proteinG.map { "\(Int($0.rounded()))g" },
                        size: 12, color: .white
                    )
                    Spacer(minLength: 0)
                    if entry.isStale { StaleTag() }
                }
                Rail(progress: proteinProgress, color: mode == .accented ? .white : Helix.emerald)
            }
        }
        .containerBackground(Helix.background, for: .widget)
    }
}

/// Small · how much of the day's battery is left, and what today is.
struct BatteryView: View {
    let entry: HelixEntry

    private var s: HelixSnapshot? { entry.snapshot }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if entry.isEmpty {
                Unavailable(status: entry.status, compact: true)
            } else {
                HStack(spacing: 4) {
                    Caption(s?.workout.isRestDay == true ? "REST" : "TRAIN", color: Helix.steel)
                    Spacer(minLength: 0)
                    if s?.workout.logged == true {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 10)).foregroundStyle(Helix.emerald)
                    }
                }
                Spacer(minLength: 0)
                HStack {
                    Spacer(minLength: 0)
                    BatteryRing(pct: s?.battery, size: 78)
                    Spacer(minLength: 0)
                }
                Spacer(minLength: 0)
                Text(s?.workout.label ?? "—")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Helix.muted)
                    .lineLimit(1)
            }
        }
        .containerBackground(Helix.background, for: .widget)
    }
}

/// Medium · the whole day in one glance.
struct TodayView: View {
    let entry: HelixEntry
    @Environment(\.widgetRenderingMode) private var mode

    private var s: HelixSnapshot? { entry.snapshot }
    private func tint(_ c: Color) -> Color { mode == .accented ? .white : c }

    var body: some View {
        HStack(spacing: 14) {
            if entry.isEmpty {
                Unavailable(status: entry.status)
            } else {
                VStack(alignment: .leading, spacing: 7) {
                    HStack(spacing: 5) {
                        Caption("TODAY")
                        if entry.isStale { StaleTag() }
                    }
                    Metric(
                        value: s?.caloriesRemaining.map { "\($0)" },
                        label: "kcal left", color: tint(Helix.ember)
                    )
                    Metric(
                        value: s?.macros.proteinG.map { "\(Int($0.rounded()))g" },
                        label: "protein", color: tint(Helix.emerald)
                    )
                    Metric(
                        value: s?.steps.count.map { "\($0)" },
                        label: "steps", color: .white
                    )
                    Metric(
                        value: s?.water.ml.map { String(format: "%.1fL", $0 / 1000) },
                        label: "water", color: tint(Helix.sapphire)
                    )
                }
                Spacer(minLength: 0)
                BatteryRing(pct: s?.battery)
            }
        }
        .containerBackground(Helix.background, for: .widget)
    }
}

/// Medium · the training week so far.
struct WeekView: View {
    let entry: HelixEntry
    @Environment(\.widgetRenderingMode) private var mode

    private var s: HelixSnapshot? { entry.snapshot }
    private func tint(_ c: Color) -> Color { mode == .accented ? .white : c }

    /// The week is optional here, its FIELDS are not — `sessions`, `volumeKg`,
    /// `sets` and `prs` are plain `Int`/`Double` because a snapshot always counts
    /// them, even at zero. That is why they are formatted off this one optional
    /// rather than in place: in `s?.week.volumeKg.map { … }` the `.map` binds to
    /// the *unwrapped* `Double`, which has no such member, so the whole file
    /// fails to compile. Only a leaf that is itself optional (`macros.proteinG`)
    /// can take `.map` mid-chain.
    private var week: HelixSnapshot.Week? { s?.week }

    /// Sessions carry a denominator when the plan states one. "3" alone is not a
    /// fact you can act on at a glance; "3/5" is.
    private var sessions: String? {
        guard let week else { return nil }
        if let target = week.sessionTarget, target > 0 { return "\(week.sessions)/\(target)" }
        return "\(week.sessions)"
    }

    var body: some View {
        HStack(spacing: 14) {
            if entry.isEmpty {
                Unavailable(status: entry.status)
            } else {
                VStack(alignment: .leading, spacing: 7) {
                    HStack(spacing: 5) {
                        Caption("THIS WEEK")
                        if entry.isStale { StaleTag() }
                    }
                    Metric(value: sessions, label: "sessions", color: tint(Helix.sapphire))
                    Metric(
                        value: week.map { String(format: "%.1f t", $0.volumeKg / 1000) },
                        label: "volume", color: .white
                    )
                    Metric(value: week.map { "\($0.sets)" }, label: "sets", color: Helix.steel)
                    Metric(value: week.map { "\($0.prs)" }, label: "PRs", color: tint(Helix.gold))
                }
                Spacer(minLength: 0)
                BatteryRing(pct: s?.battery)
            }
        }
        .containerBackground(Helix.background, for: .widget)
    }
}

/// Lock screen / Smart Stack · the battery alone.
struct BatteryAccessoryView: View {
    let entry: HelixEntry
    var body: some View {
        Gauge(value: Double(entry.snapshot?.battery ?? 0), in: 0...100) {
            Image(systemName: "bolt.fill")
        } currentValueLabel: {
            // Still an em dash when unknown — the gauge sits at zero because it
            // has to sit somewhere, but the NUMBER never lies about it.
            Text(entry.snapshot?.battery.map { "\($0)" } ?? "—")
        }
        .gaugeStyle(.accessoryCircular)
        .containerBackground(.clear, for: .widget)
    }
}

// MARK: - Widget declarations

struct HelixFuelWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HelixFuel", provider: HelixProvider()) { entry in
            FuelView(entry: entry)
        }
        .configurationDisplayName("Fuel")
        .description("Calories remaining and protein for today.")
        .supportedFamilies([.systemSmall])
    }
}

struct HelixBatteryWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HelixBattery", provider: HelixProvider()) { entry in
            BatteryView(entry: entry)
        }
        .configurationDisplayName("Battery")
        .description("Today's recovery battery and scheduled session.")
        .supportedFamilies([.systemSmall])
    }
}

struct HelixTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HelixToday", provider: HelixProvider()) { entry in
            TodayView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("Fuel, protein, steps, water and the recovery battery.")
        .supportedFamilies([.systemMedium])
    }
}

struct HelixWeekWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HelixWeek", provider: HelixProvider()) { entry in
            WeekView(entry: entry)
        }
        .configurationDisplayName("This Week")
        .description("Sessions, volume, sets and PRs against the plan.")
        .supportedFamilies([.systemMedium])
    }
}

struct HelixBatteryAccessoryWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HelixBatteryAccessory", provider: HelixProvider()) { entry in
            BatteryAccessoryView(entry: entry)
        }
        .configurationDisplayName("Battery (Lock Screen)")
        .description("Recovery battery as a lock-screen gauge.")
        .supportedFamilies([.accessoryCircular])
    }
}

@main
struct HelixWidgetsBundle: WidgetBundle {
    var body: some Widget {
        HelixFuelWidget()
        HelixBatteryWidget()
        HelixTodayWidget()
        HelixWeekWidget()
        HelixBatteryAccessoryWidget()
    }
}
