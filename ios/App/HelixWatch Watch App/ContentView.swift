//
//  ContentView.swift
//  HelixWatch Watch App
//
//  The standalone HELIX watch face: five swipeable screens fed by the
//  token-authenticated /api/widget/snapshot endpoint (see Shared/HelixSnapshot.swift).
//  No App Group, no phone dependency — it fetches for itself over Wi-Fi/LTE.
//

import SwiftUI
import Combine  // ObservableObject / @Published live here; watchOS doesn't re-export via SwiftUI

// MARK: - Palette (mirrors the web jewel tokens)

private enum HelixTheme {
    /// TRUE black, not near-black. On an OLED watch a #0C0D11 fill is a
    /// visible grey rectangle inside the bezel; #000000 is the bezel. The web
    /// app's obsidian exists to sit under glass — there is no glass here.
    static let obsidian = Color.black
    static let ember    = Color(red: 0.878, green: 0.439, blue: 0.235)  // action / now
    static let sapphire = Color(red: 0.239, green: 0.478, blue: 0.722)  // data / physiology
    static let emerald  = Color(red: 0.243, green: 0.620, blue: 0.478)  // good delta
    static let gold     = Color(red: 0.831, green: 0.686, blue: 0.216)  // achievement
    static let amethyst = Color(red: 0.557, green: 0.486, blue: 0.996)  // sleep
    static let oxide    = Color(red: 0.769, green: 0.318, blue: 0.306)  // warning
    static let muted    = Color(white: 0.55)
}

// MARK: - Store

/// Fetches + holds the snapshot for the whole watch app. One refresh feeds all
/// five screens, so swiping between them never triggers a new network call.
@MainActor
final class SnapshotStore: ObservableObject {
    @Published var snapshot: HelixSnapshot?
    @Published var isStale = false
    @Published var isLoading = false
    @Published var configured = HelixSnapshotClient.isConfigured

    func refresh() async {
        guard configured else { return }
        isLoading = true
        let (snap, status) = await HelixSnapshotClient.fetchWithFallback()
        if let snap { snapshot = snap }
        isStale = status != .ok
        isLoading = false
    }
}

// MARK: - Root

struct ContentView: View {
    @StateObject private var store = SnapshotStore()

    var body: some View {
        Group {
            if !store.configured {
                NotConfiguredView()
            } else if let snap = store.snapshot {
                TabView {
                    SleepScreen(sleep: snap.sleep)
                    WeightScreen(weight: snap.weight)
                    WorkoutScreen(workout: snap.workout, week: snap.week)
                    MacrosScreen(macros: snap.macros)
                    WaterScreen(water: snap.water)
                }
                .tabViewStyle(.verticalPage)
                .overlay(alignment: .top) { if store.isStale { StaleBanner() } }
            } else if store.isLoading {
                ProgressView().tint(Helix.ember)
            } else {
                RetryView { Task { await store.refresh() } }
            }
        }
        .containerBackground(HelixTheme.obsidian, for: .tabView)
        .task { await store.refresh() }
        .refreshable { await store.refresh() }
    }
}

// MARK: - Screens

/// Last night's sleep — total, a proportional stage ribbon, and Deep/REM splits.
private struct SleepScreen: View {
    let sleep: HelixSnapshot.Sleep

    var body: some View {
        ScreenScaffold(title: "SLEEP", accent: Helix.amethyst) {
            Text(HelixSnapshot.formatSleep(sleep.minutes))
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(.white)
            StageRibbon(deep: sleep.deepMin, rem: sleep.remMin, total: sleep.minutes)
                .frame(height: 8)
            HStack(spacing: 14) {
                Stat(label: "DEEP", value: HelixSnapshot.formatSleep(sleep.deepMin), color: Helix.amethyst)
                Stat(label: "REM", value: HelixSnapshot.formatSleep(sleep.remMin), color: Helix.sapphire)
            }
        }
    }
}

/// Weight + the change since the last weigh-in, tinted by direction (a drop on a
/// cut is good → emerald).
private struct WeightScreen: View {
    let weight: HelixSnapshot.Weight

    private var deltaColor: Color {
        guard let d = weight.deltaKg, d != 0 else { return Helix.muted }
        return d < 0 ? Helix.emerald : Helix.oxide
    }

    var body: some View {
        ScreenScaffold(title: "WEIGHT", accent: Helix.ember) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(weight.kg.map { String(format: "%.1f", $0) } ?? "—")
                    .font(.system(size: 40, weight: .bold))
                    .foregroundStyle(.white)
                Text("kg").font(.footnote).foregroundStyle(Helix.muted)
            }
            if let d = weight.deltaKg, d != 0 {
                Text(String(format: "%@%.1f kg", d < 0 ? "▼" : "▲", abs(d)))
                    .font(.system(.footnote).weight(.bold))
                    .foregroundStyle(deltaColor)
            }
            if let on = weight.measuredOn {
                Text(on).font(.caption2).foregroundStyle(Helix.muted)
            }
        }
    }
}

/// Today's session + the week's training tally.
private struct WorkoutScreen: View {
    let workout: HelixSnapshot.Workout
    let week: HelixSnapshot.Week

    var body: some View {
        ScreenScaffold(title: "TODAY", accent: workout.isRestDay ? Helix.amethyst : Helix.ember) {
            Text(workout.isRestDay ? "Rest · Zone-2" : workout.label)
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(.white)
                .minimumScaleFactor(0.6)
                .lineLimit(2)
            if !workout.isRestDay {
                Label(workout.logged ? "Logged" : "Not logged yet",
                      systemImage: workout.logged ? "checkmark.circle.fill" : "circle")
                    .font(.caption)
                    .foregroundStyle(workout.logged ? Helix.emerald : Helix.muted)
            }
            HStack(spacing: 12) {
                Stat(label: "SESS", value: "\(week.sessions)", color: Helix.sapphire)
                Stat(label: "PRs", value: "\(week.prs)", color: Helix.gold)
            }
        }
    }
}

/// Calories remaining + the macro splits.
private struct MacrosScreen: View {
    let macros: HelixSnapshot.Macros

    private var remaining: Int? {
        guard let k = macros.kcal, let g = macros.kcalGoal else { return nil }
        return Int((g - k).rounded())
    }

    var body: some View {
        ScreenScaffold(title: "FUEL", accent: Helix.ember) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(remaining.map { "\($0)" } ?? "—")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(.white)
                Text("kcal left").font(.caption2).foregroundStyle(Helix.muted)
            }
            ProgressBar(value: HelixSnapshot.progress(macros.kcal, macros.kcalGoal), color: Helix.ember)
            HStack(spacing: 10) {
                Stat(label: "P", value: macros.proteinG.map { "\(Int($0))" } ?? "—", color: Helix.emerald)
                Stat(label: "C", value: macros.carbsG.map { "\(Int($0))" } ?? "—", color: Helix.sapphire)
                Stat(label: "F", value: macros.fatG.map { "\(Int($0))" } ?? "—", color: Helix.gold)
            }
        }
    }
}

/// Water intake vs goal, with a rising fill.
private struct WaterScreen: View {
    let water: HelixSnapshot.Water

    var body: some View {
        ScreenScaffold(title: "WATER", accent: Helix.sapphire) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(water.ml.map { String(format: "%.1f", $0 / 1000) } ?? "—")
                    .font(.system(size: 38, weight: .bold))
                    .foregroundStyle(.white)
                Text("L").font(.footnote).foregroundStyle(Helix.muted)
            }
            ProgressBar(value: HelixSnapshot.progress(water.ml, water.goalMl), color: Helix.sapphire)
            if let goal = water.goalMl {
                Text(String(format: "goal %.1f L", goal / 1000))
                    .font(.caption2).foregroundStyle(Helix.muted)
            }
        }
    }
}

// MARK: - Building blocks

private struct ScreenScaffold<Content: View>: View {
    let title: String
    let accent: Color
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(.caption2).weight(.heavy))
                .tracking(2)
                .foregroundStyle(accent)
            content()
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
        .padding(.horizontal, 6)
    }
}

private struct Stat: View {
    let label: String
    let value: String
    let color: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value).font(.system(.body).weight(.bold)).foregroundStyle(.white)
            Text(label).font(.system(size: 9, weight: .bold)).tracking(1).foregroundStyle(color)
        }
    }
}

/// A proportional Deep/REM/Core-remainder ribbon. We store stage TOTALS, not the
/// stage timeline, so this is a composition split — never billed as a hypnogram.
private struct StageRibbon: View {
    let deep: Int?
    let rem: Int?
    let total: Int?

    var body: some View {
        GeometryReader { geo in
            let t = max(total ?? 0, 1)
            let d = CGFloat(deep ?? 0) / CGFloat(t)
            let r = CGFloat(rem ?? 0) / CGFloat(t)
            HStack(spacing: 1.5) {
                seg(d, Helix.amethyst, geo.size.width)
                seg(r, Helix.sapphire, geo.size.width)
                seg(max(0, 1 - d - r), Color(white: 0.30), geo.size.width)
            }
            .clipShape(Capsule())
        }
    }

    private func seg(_ frac: CGFloat, _ color: Color, _ width: CGFloat) -> some View {
        color.frame(width: max(0, frac * width))
    }
}

private struct ProgressBar: View {
    let value: Double?
    let color: Color
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.08))
                Capsule().fill(color)
                    .frame(width: max(0, CGFloat(value ?? 0) * geo.size.width))
                    .shadow(color: color.opacity(0.6), radius: 3)
            }
        }
        .frame(height: 6)
    }
}

private struct StaleBanner: View {
    var body: some View {
        Text("offline · last known")
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(Helix.muted)
            .padding(.horizontal, 8).padding(.vertical, 2)
            .background(Capsule().fill(.black.opacity(0.5)))
    }
}

private struct NotConfiguredView: View {
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "key.slash").foregroundStyle(Helix.oxide)
            Text("Snapshot not configured").font(.caption).multilineTextAlignment(.center)
            Text("Add HELIX_SNAPSHOT_URL / TOKEN in Secrets.xcconfig")
                .font(.caption2).foregroundStyle(Helix.muted).multilineTextAlignment(.center)
        }.padding()
    }
}

private struct RetryView: View {
    let retry: () -> Void
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "wifi.exclamationmark").foregroundStyle(Helix.oxide)
            Text("Couldn't reach HELIX").font(.caption)
            Button("Retry", action: retry).tint(Helix.ember)
        }.padding()
    }
}

#Preview { ContentView() }
