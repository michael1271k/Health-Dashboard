import ActivityKit
import SwiftUI
import WidgetKit
import HelixCore
import HelixUI

/// The native app's widget extension.
///
/// Wave 5: the five Home Screen families, the Lock Screen accessory and the
/// running-workout Live Activity. Every tile is a `HelixUI` view drawing a
/// `HelixSnapshot` that `HelixProvider` builds from the App Group database —
/// no network, no snapshot route, no token. The Capacitor extension that did
/// all of this over HTTP is gone.
///
/// ⚠️ `kind:` strings are load-bearing: a kind that disappears takes every
/// placed instance of it off the Home Screen. They are the same five strings
/// the Capacitor extension used, so a re-install keeps what the user placed.
@main
struct HelixNativeWidgets: WidgetBundle {
    var body: some Widget {
        // Gallery order: what to eat, what to train, how the body is doing,
        // the whole day at once, the overnight readings, the running session,
        // and then the accessory sizes.
        HelixFuelWidget()
        HelixTrainingWidget()
        HelixBodyWidget()
        HelixDailyWidget()
        HelixVitalsWidget()
        HelixWorkoutActivityWidget()
        HelixLockWidget()
    }
}

// MARK: - Home Screen families

struct HelixFuelWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "HelixFuelFamily", intent: FuelConfiguration.self, provider: HelixIntentProvider<FuelConfiguration>()) { entry in
            FuelView(entry: entry.tile, focus: entry.tile.fuelFocus)
        }
        .configurationDisplayName("Fuel")
        .description("Calories, macros and hydration. Tap through to Fuel.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct HelixTrainingWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "HelixTrainingFamily", intent: TrainingConfiguration.self, provider: HelixIntentProvider<TrainingConfiguration>()) { entry in
            TrainingView(entry: entry.tile, focus: entry.tile.trainingFocus)
        }
        .configurationDisplayName("Training")
        .description("Today's session, the month, volume, streak and records.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct HelixBodyWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "HelixBodyFamily", intent: BodyConfiguration.self, provider: HelixIntentProvider<BodyConfiguration>()) { entry in
            BodyView(entry: entry.tile, focus: entry.tile.bodyFocus)
        }
        .configurationDisplayName("Body")
        .description("Weight, sleep and the daily score. Tap through to Body.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct HelixDailyWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "HelixDailyFamily", intent: DailyConfiguration.self, provider: HelixIntentProvider<DailyConfiguration>()) { entry in
            DailyView(entry: entry.tile)
        }
        .configurationDisplayName("Helix Daily")
        .description("Fuel, water, steps and training in one register.")
        .supportedFamilies([.systemLarge])
    }
}

struct HelixVitalsWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "HelixVitalsFamily", intent: VitalsConfiguration.self, provider: HelixIntentProvider<VitalsConfiguration>()) { entry in
            VitalsView(entry: entry.tile, focus: entry.tile.vitalsFocus)
        }
        .configurationDisplayName("Vitals")
        .description("Overnight readings against your own normal — HRV, resting HR, temperature, blood oxygen, breathing.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct HelixLockWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "HelixLockFamily", intent: LockConfiguration.self, provider: HelixIntentProvider<LockConfiguration>()) { entry in
            LockView(entry: entry.tile, focus: entry.tile.lockFocus)
        }
        .configurationDisplayName("Helix (Lock Screen)")
        .description("One fact on the Lock Screen: battery, calories, steps or today's session.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - The running workout

/// ── ONE STRUCT, BECAUSE THE FLOOR IS iOS 18 ─────────────────────────────────
/// The Capacitor app needs TWO widget structs for this — `supplementalActivity-
/// Families` is `@available(iOS 18.0, *)` and returns a different opaque type,
/// so it cannot be applied conditionally inside one `body`, and WidgetKit ships
/// no `AnyWidgetConfiguration` to erase it with. The native app's deployment
/// target IS 18.0, so the availability branch, the duplicate struct and the
/// `buildLimitedAvailability` dance all simply do not exist here.
///
/// ── AND WHY THE WATCH LAYOUT IS A BRANCH IN THE VIEW ────────────────────────
/// Before watchOS 11 the Smart Stack mirrored an iPhone activity by rendering
/// its DYNAMIC ISLAND COMPACT regions — two ~44 pt slots flanking a camera
/// cutout, drawn on a watch face with room for four lines, which is how "Helix
/// 1/2 75x13" happened. Declaring the supplemental family makes the system ask
/// for a watch-shaped card through the SAME content closure, so the branch
/// belongs in the view (`@Environment(\.activityFamily)`) and not in a second
/// configuration.
struct HelixWorkoutActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: HelixWorkoutAttributes.self) { context in
            LockScreenWorkout(context: context)
                // The Lock Screen draws on the SYSTEM's material. A solid
                // obsidian panel here reads as a black rectangle stuck to the
                // wallpaper; a tint makes the card the app's without claiming
                // the whole surface.
                .activityBackgroundTint(.black.opacity(0.55))
                .activitySystemActionForegroundColor(HelixPalette.ember)
        } dynamicIsland: { context in
            // No `let accent = …` here, however much it would tidy the call
            // sites: a binding turns the trailing closure into a multi-statement
            // body, which stops `DynamicIslandExpandedContentBuilder` inferring
            // `Expanded` and fails with "generic parameter 'Expanded' could not
            // be inferred" — an error that names none of the actual code.
            DynamicIsland {
                // ── WHY ALMOST EVERYTHING IS IN `.bottom` ───────────────────
                // The expanded presentation has four regions and they are NOT
                // equal. `.leading` and `.trailing` are the narrow columns
                // either side of the camera and `.center` is the sliver BETWEEN
                // them — the narrowest of the three. Only `.bottom` spans the
                // full width. So the flanks hold only what is genuinely short,
                // and every fact that has a length lives where it can breathe.
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 5) {
                        Circle()
                            .fill(Color(hex: context.state.accent))
                            .frame(width: 7, height: 7)
                        Text("HELIX")
                            .font(.system(size: 10, weight: .black, design: .rounded))
                            .tracking(1.2)
                            .foregroundStyle(.white.opacity(0.9))
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(state: context.state, startedAt: context.attributes.startedAt)
                        .frame(maxWidth: 62, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        SessionTotals(state: context.state)
                        HStack(alignment: .bottom, spacing: 10) {
                            CurrentSet(state: context.state)
                            Spacer(minLength: 6)
                            Spark(values: context.state.spark, color: Color(hex: context.state.accent))
                                .frame(width: 76, height: 30)
                        }
                        if !context.state.lastTime.isEmpty {
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text("LAST TIME")
                                    .font(.system(size: 8, weight: .bold))
                                    .tracking(1.1)
                                    .foregroundStyle(HelixPalette.dim)
                                Text(context.state.lastTime)
                                    .font(.system(size: 11, weight: .medium, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(HelixPalette.muted)
                            }
                        }
                    }
                }
            } compactLeading: {
                Circle()
                    .fill(Color(hex: context.state.accent))
                    .frame(width: 8, height: 8)
            } compactTrailing: {
                // Whichever number is the answer RIGHT NOW: the rest clock while
                // resting, the load while working. Two facts competing for one
                // ~44 pt slot is how the compact region becomes unreadable.
                Group {
                    if let endsAt = context.state.restEndsAt {
                        Text(timerInterval: Date()...endsAt, countsDown: true)
                            .frame(maxWidth: 44)
                    } else {
                        Text(context.state.load.replacingOccurrences(of: " kg ", with: ""))
                    }
                }
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Color(hex: context.state.accent))
            } minimal: {
                Image(systemName: context.state.restEndsAt == nil
                      ? "figure.strengthtraining.traditional" : "timer")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Color(hex: context.state.accent))
            }
            .keylineTint(Color(hex: context.state.accent))
        }
        // watchOS 11 / iOS 18: a real Watch card, asked for through the same
        // content closure. This is the fix for the Smart Stack rendering the
        // Dynamic Island's compact slots on a face with room for four lines.
        .supplementalActivityFamilies([.small])
    }
}

// MARK: - Lock Screen

private struct LockScreenWorkout: View {
    let context: ActivityViewContext<HelixWorkoutAttributes>

    @Environment(\.activityFamily) private var family

    private var accent: Color { Color(hex: context.state.accent) }

    var body: some View {
        switch family {
        case .small:  watchCard
        default:      lockScreenCard
        }
    }

    /// The wrist. Four lines, all of them full words — no abbreviations, which
    /// is the entire lesson of "Helix 1/2 75x13".
    private var watchCard: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(context.attributes.title)
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .foregroundStyle(accent)
                .lineLimit(1)
            Text(context.state.exercise)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white)
                .lineLimit(2)
            if let endsAt = context.state.restEndsAt {
                Text(timerInterval: Date()...endsAt, countsDown: true)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(accent)
            } else if !context.state.load.isEmpty {
                Text(context.state.load)
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
            }
            Text("\(context.state.sets) sets · \(context.state.volume)")
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(HelixPalette.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
    }

    private var lockScreenCard: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 6) {
                    Circle().fill(accent).frame(width: 7, height: 7)
                    Text(context.attributes.title.uppercased())
                        .font(.system(size: 10, weight: .black, design: .rounded))
                        .tracking(1.2)
                        .foregroundStyle(accent)
                    Countdown(state: context.state, startedAt: context.attributes.startedAt)
                }
                SessionTotals(state: context.state)
                CurrentSet(state: context.state)
            }
            Spacer(minLength: 0)
            // The right-hand column takes the session's SHAPE rather than a
            // second set of numbers. The Lock Screen omits "last time"
            // entirely for the same reason: one reference is context, two is a
            // table.
            Spark(values: context.state.spark, color: accent)
                .frame(width: 86, height: 44)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

// MARK: - Pieces

private struct Countdown: View {
    let state: HelixWorkoutAttributes.ContentState
    let startedAt: Date

    var body: some View {
        Group {
            if let endsAt = state.restEndsAt {
                Label {
                    Text(timerInterval: Date()...endsAt, countsDown: true)
                } icon: {
                    Image(systemName: "timer")
                }
                .foregroundStyle(Color(hex: state.accent))
            } else {
                // A duration counted by the SYSTEM. ActivityKit budgets
                // updates; a clock is not worth spending them on.
                Text(startedAt, style: .timer)
                    .foregroundStyle(HelixPalette.muted)
            }
        }
        .font(.system(size: 12, weight: .semibold, design: .rounded))
        .monospacedDigit()
    }
}

private struct SessionTotals: View {
    let state: HelixWorkoutAttributes.ContentState

    var body: some View {
        HStack(spacing: 10) {
            stat(state.volume, HelixPalette.ember)
            stat("\(state.sets) sets", HelixPalette.platinum)
            // Zero renders as NOTHING. A permanent gold zero is how gold stops
            // meaning a personal record.
            if state.records > 0 {
                stat("\(state.records) PR", HelixPalette.gold)
            }
        }
    }

    private func stat(_ text: String, _ color: Color) -> some View {
        Text(text)
            .font(.system(size: 12, weight: .bold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(color)
    }
}

private struct CurrentSet: View {
    let state: HelixWorkoutAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 6) {
                Text(state.exercise)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if !state.setLabel.isEmpty {
                    Text(state.setLabel)
                        .font(.system(size: 9, weight: .bold))
                        .tracking(0.6)
                        .foregroundStyle(HelixPalette.dim)
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if !state.load.isEmpty {
                    Text(state.load)
                        .font(.system(size: 17, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                }
                if !state.rpe.isEmpty {
                    Text(state.rpe)
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundStyle(HelixPalette.amber)
                }
            }
        }
    }
}

/// The session's cumulative tonnage, as a line.
///
/// Hand-drawn rather than Swift Charts: a widget extension has a hard memory
/// budget and this is four points of geometry, not a chart. It draws nothing
/// below two points — one dot on an axis reads as a rendering failure, not as a
/// trend.
private struct Spark: View {
    let values: [Double]
    let color: Color

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            if values.count > 1, let low = values.min(), let high = values.max() {
                let span = high - low
                let points = values.enumerated().map { index, value -> CGPoint in
                    let x = size.width * CGFloat(index) / CGFloat(values.count - 1)
                    // A flat series (identical totals) would divide by zero;
                    // it sits on the baseline instead, which is what a flat
                    // series looks like.
                    let ratio = span > 0 ? (value - low) / span : 0
                    return CGPoint(x: x, y: size.height * (1 - CGFloat(ratio)))
                }
                ZStack {
                    Path { path in
                        path.addLines(points)
                        path.addLine(to: CGPoint(x: size.width, y: size.height))
                        path.addLine(to: CGPoint(x: 0, y: size.height))
                        path.closeSubpath()
                    }
                    .fill(LinearGradient(
                        colors: [color.opacity(0.28), color.opacity(0.02)],
                        startPoint: .top, endPoint: .bottom
                    ))
                    Path { $0.addLines(points) }
                        .stroke(color, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                }
            }
        }
    }
}
