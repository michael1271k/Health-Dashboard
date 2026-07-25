import WidgetKit
import SwiftUI

// MARK: - Palette

private enum Helix {
    static let obsidian = Color(red: 0.047, green: 0.051, blue: 0.067)
    static let ember    = Color(red: 0.878, green: 0.439, blue: 0.235)
    static let sapphire = Color(red: 0.239, green: 0.478, blue: 0.722)
    static let emerald  = Color(red: 0.243, green: 0.620, blue: 0.478)
    static let gold     = Color(red: 0.831, green: 0.686, blue: 0.216)
    static let muted    = Color(white: 0.55)
}

// MARK: - Timeline

struct HelixEntry: TimelineEntry {
    let date: Date
    let snapshot: HelixSnapshot?
    let stale: Bool
}

struct HelixProvider: TimelineProvider {
    func placeholder(in context: Context) -> HelixEntry {
        HelixEntry(date: Date(), snapshot: nil, stale: false)
    }

    func getSnapshot(in context: Context, completion: @escaping (HelixEntry) -> Void) {
        Task {
            let (snap, stale) = await HelixSnapshotClient.fetchWithFallback()
            completion(HelixEntry(date: Date(), snapshot: snap, stale: stale))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HelixEntry>) -> Void) {
        Task {
            let (snap, stale) = await HelixSnapshotClient.fetchWithFallback()
            let entry = HelixEntry(date: Date(), snapshot: snap, stale: stale)
            // Refresh cadence: the snapshot changes at most a few times an hour.
            let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }
}

// MARK: - Small widget (calories remaining · water)

struct HelixSmallView: View {
    let entry: HelixEntry

    private var kcalLeft: Int? { entry.snapshot?.caloriesRemaining }
    private var waterProgress: Double? {
        HelixSnapshot.progress(entry.snapshot?.water.ml, entry.snapshot?.water.goalMl)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("KCAL LEFT")
                .font(.system(size: 10, weight: .heavy)).tracking(1.5)
                .foregroundStyle(Helix.ember)
            Text(kcalLeft.map { "\($0)" } ?? "—")
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .minimumScaleFactor(0.6)
            Spacer(minLength: 0)
            HStack(spacing: 4) {
                Image(systemName: "drop.fill").font(.system(size: 10)).foregroundStyle(Helix.sapphire)
                Text(entry.snapshot?.water.ml.map { String(format: "%.1f L", $0 / 1000) } ?? "—")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(.white.opacity(0.08))
                    Capsule().fill(Helix.sapphire)
                        .frame(width: max(0, CGFloat(waterProgress ?? 0) * geo.size.width))
                }
            }.frame(height: 4)
        }
        .containerBackground(Helix.obsidian.gradient, for: .widget)
    }
}

// MARK: - Medium widget (weekly trend · battery)

struct HelixMediumView: View {
    let entry: HelixEntry

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("THIS WEEK")
                    .font(.system(size: 10, weight: .heavy)).tracking(1.5)
                    .foregroundStyle(Helix.ember)
                metric("\(entry.snapshot?.week.sessions ?? 0)", "sessions", Helix.sapphire)
                metric(String(format: "%.0f t", (entry.snapshot?.week.volumeKg ?? 0) / 1000), "volume", .white)
                metric("\(entry.snapshot?.week.prs ?? 0)", "PRs", Helix.gold)
            }
            Spacer()
            batteryRing
        }
        .containerBackground(Helix.obsidian.gradient, for: .widget)
    }

    private func metric(_ value: String, _ label: String, _ color: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text(value).font(.system(.title3, design: .rounded).weight(.bold)).foregroundStyle(color)
            Text(label).font(.caption2).foregroundStyle(Helix.muted)
        }
    }

    private var batteryRing: some View {
        let pct = Double(entry.snapshot?.battery ?? 0) / 100
        return ZStack {
            Circle().stroke(.white.opacity(0.08), lineWidth: 8)
            Circle().trim(from: 0, to: pct)
                .stroke(Helix.emerald, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .shadow(color: Helix.emerald.opacity(0.5), radius: 4)
            VStack(spacing: 0) {
                Text(entry.snapshot?.battery.map { "\($0)" } ?? "—")
                    .font(.system(.title3, design: .rounded).weight(.bold)).foregroundStyle(.white)
                Text("BATT").font(.system(size: 8, weight: .bold)).foregroundStyle(Helix.muted)
            }
        }.frame(width: 74, height: 74)
    }
}

// MARK: - Widget declarations

struct HelixCaloriesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HelixCalories", provider: HelixProvider()) { entry in
            HelixSmallView(entry: entry)
        }
        .configurationDisplayName("Fuel & Water")
        .description("Calories remaining and water for today.")
        .supportedFamilies([.systemSmall])
    }
}

struct HelixWeekWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HelixWeek", provider: HelixProvider()) { entry in
            HelixMediumView(entry: entry)
        }
        .configurationDisplayName("Weekly Trend")
        .description("This week's training volume, PRs, and readiness battery.")
        .supportedFamilies([.systemMedium])
    }
}

@main
struct HelixWidgetsBundle: WidgetBundle {
    var body: some Widget {
        HelixCaloriesWidget()
        HelixWeekWidget()
    }
}
