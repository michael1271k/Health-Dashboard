import SwiftUI
import OnyxUI

/// Everything the running workout draws, on every surface ActivityKit offers.
///
/// ── WHY THIS IS NOT IN THE WIDGET EXTENSION WITH ITS CONFIGURATION ──────────
/// It used to be, and the cost was that nothing could look at it. An
/// `ActivityViewContext` can only be made by ActivityKit, so a view that takes
/// one is a view that renders in exactly one place: a real Lock Screen, during
/// a real workout, on a device. Every other screen in this app is photographed
/// by the harness from a fixture and reviewed as a picture; this one was
/// reviewed by reading it, which is how it kept a `Text("ONYX")` through a
/// rename and typed itself in raw points beside thirty faces on the widget
/// scale.
///
/// So the views take the two plain values the context carries — the attributes
/// and the state — and the extension's configuration closures unwrap the
/// context for them. `Shared/` is already compiled into both targets for
/// `OnyxWorkoutAttributes` (see its header), so the app's preview harness can
/// draw the same card the Lock Screen does, from the same code, with no second
/// implementation to drift.

// MARK: - The clock

/// The rest countdown as a range `Text(timerInterval:)` will accept, or `nil`
/// once it has run out.
///
/// ── WHY THIS IS NOT `Date()...endsAt` INLINE ────────────────────────────────
/// It was, on four surfaces, and every one of them was a crash waiting for the
/// obvious moment. `Text(timerInterval:)` traps on a range whose end is behind
/// its start — "Fatal error: Range requires lowerBound <= upperBound" — and
/// `restEndsAt` is stale by construction on exactly this surface: the phone is
/// LOCKED while the card is being read, so the app is suspended and nothing
/// clears the date at the instant it expires. The next redraw took the whole
/// widget extension down with it.
///
/// `nil` therefore means "the rest is over", and each caller falls back to what
/// it shows when it was never resting — which is the truth at that moment
/// anyway.
func restCountdown(_ endsAt: Date?) -> ClosedRange<Date>? {
    let now = Date()
    guard let endsAt, endsAt > now else { return nil }
    return now...endsAt
}

// MARK: - The Lock Screen

/// The card on the Lock Screen and in the Notification Centre.
///
/// Two columns: what the session IS on the left, what shape it has taken on the
/// right. It omits "last time" that the expanded Dynamic Island carries — one
/// reference is context, two is a table, and this surface is read at arm's
/// length in the gap between sets.
struct WorkoutLockCard: View {
    let title: String
    let startedAt: Date
    let state: OnyxWorkoutAttributes.ContentState

    private var accent: Color { Color.onyx.day(state.dayKey) }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 6) {
                    // The mark, carrying the split's colour, IS the dot that
                    // used to sit here — a filled circle said "this app has a
                    // colour", the ring says which app.
                    OnyxMark(size: 11, tint: accent, opacity: 1)
                    Text(title.uppercased())
                        .font(OnyxWidgetType.label(10, weight: .black))
                        .tracking(1.2)
                        .foregroundStyle(accent)
                    WorkoutCountdown(state: state, startedAt: startedAt)
                }
                WorkoutTotals(state: state)
                WorkoutCurrentSet(state: state)
                // Appears with the clock and leaves with it. The watch card
                // below deliberately has no equivalent: watchOS cannot perform
                // the iPhone app's intent, so the button there would be a
                // control that does nothing.
                if state.restEndsAt != nil {
                    WorkoutSkipRest(dayKey: state.dayKey)
                }
            }
            Spacer(minLength: 0)
            WorkoutSpark(values: state.spark, color: accent)
                .frame(width: 86, height: 44)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

// MARK: - The wrist

/// The Smart Stack card (`.small` activity family).
///
/// Four lines, all of them full words — no abbreviations, which is the entire
/// lesson of "Onyx 1/2 75x13": before watchOS 11 the Smart Stack mirrored the
/// Dynamic Island's two ~44 pt compact slots onto a face with room for four
/// lines.
struct WorkoutWatchCard: View {
    let title: String
    let state: OnyxWorkoutAttributes.ContentState

    private var accent: Color { Color.onyx.day(state.dayKey) }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(OnyxWidgetType.hero(13))
                .foregroundStyle(accent)
                .lineLimit(1)
            Text(state.exercise)
                .font(OnyxWidgetType.label(12, weight: .medium))
                .foregroundStyle(.white)
                .lineLimit(2)
            if let countdown = restCountdown(state.restEndsAt) {
                Text(timerInterval: countdown, countsDown: true)
                    .font(OnyxWidgetType.figure(16))
                    .foregroundStyle(accent)
            } else if !state.load.isEmpty {
                Text(state.load)
                    .font(OnyxWidgetType.figure(15))
                    .foregroundStyle(.white)
            }
            Text("\(state.setsDone)/\(state.setsPlanned) sets · \(state.volume)")
                .font(OnyxWidgetType.label(10, weight: .medium))
                .foregroundStyle(Color.onyx.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
    }
}

// MARK: - Pieces

/// The rest clock while resting, the session's own elapsed time otherwise.
struct WorkoutCountdown: View {
    let state: OnyxWorkoutAttributes.ContentState
    let startedAt: Date

    var body: some View {
        Group {
            if let countdown = restCountdown(state.restEndsAt) {
                Label {
                    Text(timerInterval: countdown, countsDown: true)
                } icon: {
                    Image(systemName: "timer")
                }
                .foregroundStyle(Color.onyx.day(state.dayKey))
            } else {
                // A duration counted by the SYSTEM. ActivityKit budgets
                // updates; a clock is not worth spending them on.
                Text(startedAt, style: .timer)
                    .foregroundStyle(Color.onyx.textSecondary)
            }
        }
        .font(OnyxWidgetType.figure(12))
        .monospacedDigit()
    }
}

/// Tonnage, sets done against planned, and records — the three numbers that
/// answer "how is this session going" without opening anything.
struct WorkoutTotals: View {
    let state: OnyxWorkoutAttributes.ContentState

    var body: some View {
        HStack(spacing: 10) {
            stat(state.volume, Color.onyx.day(state.dayKey))
            stat("\(state.setsDone)/\(state.setsPlanned) sets", Color.onyx.textPrimary)
            // Zero renders as NOTHING. A permanent gold zero is how gold stops
            // meaning a personal record.
            if state.prsThisSession > 0 {
                stat("\(state.prsThisSession) PR", Color.onyx.record)
            }
        }
    }

    private func stat(_ text: String, _ color: Color) -> some View {
        Text(text)
            .font(OnyxWidgetType.figure(12))
            .foregroundStyle(color)
    }
}

/// The set you are standing in front of. The card LEADS with this: history used
/// to be the largest thing on the face while the current set went unnamed.
struct WorkoutCurrentSet: View {
    let state: OnyxWorkoutAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 6) {
                // ── WHY IT SHRINKS RATHER THAN TRUNCATES ────────────────
                // "Seated Cable Row (Wide Grip)" is 28 characters and the card
                // is 360 pt wide with a sparkline in the other column, so a
                // plain `lineLimit(1)` cut it at "Seated Cable Row (Wide…" —
                // dropping the grip. The catalogue deliberately holds the wide
                // and close grips as SEPARATE movements with separate records,
                // so a card that ends at the bracket is a card that cannot tell
                // you which of the two you are on.
                Text(state.exercise)
                    .font(OnyxWidgetType.label(12))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                if !state.setLabel.isEmpty {
                    Text(state.setLabel)
                        .font(OnyxWidgetType.label(9, weight: .bold))
                        .tracking(0.6)
                        .foregroundStyle(Color.onyx.textTertiary)
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if !state.load.isEmpty {
                    Text(state.load)
                        .font(OnyxWidgetType.figure(17))
                        .foregroundStyle(.white)
                }
                if !state.rpe.isEmpty {
                    Text(state.rpe)
                        .font(OnyxWidgetType.figure(11))
                        .foregroundStyle(Color.onyx.textSecondary)
                }
            }
        }
    }
}

/// The rest-skip button (§9, decision 16).
///
/// 44 pt on both surfaces it appears on, including the expanded Dynamic Island
/// — that region has the height, and a 32 pt target there would have been the
/// only sub-HIG control in the app.
struct WorkoutSkipRest: View {
    let dayKey: String

    var body: some View {
        Button(intent: RestSkipIntent()) {
            Label("Skip rest", systemImage: "forward.fill")
                .font(OnyxWidgetType.label(12, weight: .bold))
                .foregroundStyle(Color.onyx.day(dayKey))
                .padding(.horizontal, 14)
                .frame(minHeight: 44)
                .background(Color.onyx.day(dayKey).opacity(0.16), in: Capsule())
        }
        .buttonStyle(.plain)
        .buttonBorderShape(.capsule)
        .accessibilityLabel("Skip rest")
        .accessibilityHint("Ends the rest timer and moves on to the next set")
    }
}

/// The session's cumulative tonnage, as a line.
///
/// Hand-drawn rather than Swift Charts: a widget extension has a hard memory
/// budget and this is four points of geometry, not a chart. It draws nothing
/// below two points — one dot on an axis reads as a rendering failure, not as a
/// trend.
struct WorkoutSpark: View {
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
