import ActivityKit
import AppIntents
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
        .description("Calories, macros and hydration. Tap through to Nutrition.")
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
        .description("Weight, sleep and the daily score. Tap through to Pulse.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct HelixDailyWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "HelixDailyFamily", intent: DailyConfiguration.self, provider: HelixIntentProvider<DailyConfiguration>()) { entry in
            DailyView(entry: entry.tile)
        }
        .configurationDisplayName("Daily")
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
        .configurationDisplayName("Lock Screen")
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
                .activitySystemActionForegroundColor(Color.helix.accent(.train))
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
                        // ── THE MARK, NOT THE NAME ──────────────────────────
                        // This slot used to read `● HELIX`, which was a dot
                        // that said nothing beside a wordmark for an app that
                        // no longer has that name. `OnyxMark` is both at once:
                        // the ring is the brand AND, tinted with the split's
                        // colour, it is the same coloured token every other
                        // surface uses to say which session is running.
                        OnyxMark(size: 12, tint: Color.helix.day(context.state.dayKey), opacity: 1)
                        Text("ONYX")
                            .font(HelixWidgetType.label(10, weight: .black))
                            .tracking(1.2)
                            .foregroundStyle(.white.opacity(0.9))
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    WorkoutCountdown(state: context.state, startedAt: context.attributes.startedAt)
                        .frame(maxWidth: 62, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        WorkoutTotals(state: context.state)
                        HStack(alignment: .bottom, spacing: 10) {
                            WorkoutCurrentSet(state: context.state)
                            Spacer(minLength: 6)
                            WorkoutSpark(values: context.state.spark, color: Color.helix.day(context.state.dayKey))
                                .frame(width: 76, height: 30)
                        }
                        if !context.state.lastTime.isEmpty {
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text("LAST TIME")
                                    .font(HelixWidgetType.label(8, weight: .bold))
                                    .tracking(1.1)
                                    .foregroundStyle(Color.helix.textTertiary)
                                Text(context.state.lastTime)
                                    .font(HelixWidgetType.figure(11))
                                    .foregroundStyle(Color.helix.textSecondary)
                            }
                        }
                        // Only while the clock is running: a skip button with
                        // nothing to skip is dead chrome on a surface that has
                        // no room for any.
                        if context.state.restEndsAt != nil {
                            WorkoutSkipRest(dayKey: context.state.dayKey)
                        }
                    }
                }
            } compactLeading: {
                // The one place the brand is visible while the phone is in a
                // pocket-to-hand glance, and it costs nothing a filled dot did
                // not already cost.
                OnyxMark(size: 14, tint: Color.helix.day(context.state.dayKey), opacity: 1)
            } compactTrailing: {
                // Whichever number is the answer RIGHT NOW: the rest clock while
                // resting, the load while working. Two facts competing for one
                // ~44 pt slot is how the compact region becomes unreadable.
                Group {
                    if let countdown = restCountdown(context.state.restEndsAt) {
                        Text(timerInterval: countdown, countsDown: true)
                            .frame(maxWidth: 44)
                    } else {
                        Text(context.state.load.replacingOccurrences(of: " kg ", with: ""))
                    }
                }
                .font(HelixWidgetType.figure(12))
                .foregroundStyle(Color.helix.day(context.state.dayKey))
            } minimal: {
                Image(systemName: context.state.restEndsAt == nil
                      ? "figure.strengthtraining.traditional" : "timer")
                    .font(HelixWidgetType.label(12, weight: .bold))
                    .foregroundStyle(Color.helix.day(context.state.dayKey))
            }
            .keylineTint(Color.helix.day(context.state.dayKey))
        }
        // watchOS 11 / iOS 18: a real Watch card, asked for through the same
        // content closure. This is the fix for the Smart Stack rendering the
        // Dynamic Island's compact slots on a face with room for four lines.
        .supplementalActivityFamilies([.small])
    }
}

// MARK: - Lock Screen

/// Unwraps the `ActivityViewContext` and picks the surface.
///
/// Everything it draws lives in `Shared/WorkoutActivityCard.swift`, taking the
/// attributes and the state as plain values — see that file's header for why.
/// This wrapper is all that has to stay here: the context type only exists
/// inside a running activity, so it is the one thing the harness cannot make.
private struct LockScreenWorkout: View {
    let context: ActivityViewContext<HelixWorkoutAttributes>

    @Environment(\.activityFamily) private var family

    var body: some View {
        switch family {
        case .small:
            WorkoutWatchCard(title: context.attributes.title, state: context.state)
        default:
            WorkoutLockCard(
                title: context.attributes.title,
                startedAt: context.attributes.startedAt,
                state: context.state
            )
        }
    }
}
