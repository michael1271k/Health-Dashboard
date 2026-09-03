import SwiftUI

/// The rest clock — the one number on this screen you read from arm's length.
///
/// ── WHY IT IS A `TimelineView` AND NOT A `Timer` ────────────────────────────
/// A `Timer` publishing into `@State` re-renders the whole logger once a second,
/// keeps a retain cycle to get wrong, and stops when the run loop is busy —
/// which on a data-entry screen is exactly while you are typing. `TimelineView`
/// asks the system for a schedule, redraws only its own subtree, and is the
/// same mechanism WidgetKit uses, so the bar and the Live Activity are counting
/// the same way.
///
/// ── AND WHY IT COUNTS DOWN FROM A DATE, NOT DOWN A COUNTER ──────────────────
/// The end instant is stored; the remaining time is derived. A decrementing
/// counter drifts, and worse, it is wrong after a backgrounding — iOS suspends
/// the app between sets routinely, and a counter resumes where it stopped while
/// a deadline is simply late.
struct RestTimerBar: View {
    let endsAt: Date
    let duration: TimeInterval
    let exerciseName: String?
    let accent: Color
    let onAdjust: (TimeInterval) -> Void
    let onStop: () -> Void

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.5)) { context in
            let remaining = max(0, endsAt.timeIntervalSince(context.date))
            let progress = duration > 0 ? min(1, max(0, remaining / duration)) : 0

            HStack(spacing: 14) {
                ring(progress: progress, remaining: remaining)

                VStack(alignment: .leading, spacing: 2) {
                    Text(remaining > 0 ? "RESTING" : "GO")
                        .helixText(.micro, weight: .black, leading: .none)
                        .tracking(1.4)
                        .foregroundStyle(remaining > 0 ? HelixPalette.muted : HelixPalette.emerald)
                    if let exerciseName {
                        Text(exerciseName)
                            .helixText(.compact, weight: .semibold, leading: .none)
                            .foregroundStyle(HelixPalette.text)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 0)

                adjust(-15, "minus")
                adjust(+15, "plus")

                Button(action: onStop) {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(HelixPalette.dim)
                        .frame(width: 34, height: 34)
                }
                .helixPress(scale: 0.88)
                .accessibilityLabel("Skip rest")
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(.ultraThinMaterial)
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(accent.opacity(0.10))
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .strokeBorder(accent.alphaByte(0x4a), lineWidth: 1)
                }
            }
            // A big translucent surface reads as thicker than a chip, so it
            // carries a deeper shadow. Over a dense list of cards it also has
            // more to separate itself from.
            .shadow(color: .black.opacity(0.45), radius: 18, y: 8)
            .padding(.horizontal, 14)
            // The instant rest is over the bar stops being chrome and becomes an
            // announcement: it is the only moment on this screen worth a haptic
            // you did not ask for.
            .sensoryFeedback(.success, trigger: remaining <= 0)
        }
    }

    private func ring(progress: Double, remaining: TimeInterval) -> some View {
        ZStack {
            Circle()
                .stroke(HelixPalette.trackFill, lineWidth: 4)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(
                    remaining > 0 ? accent : HelixPalette.emerald,
                    style: StrokeStyle(lineWidth: 4, lineCap: .round)
                )
                // Twelve o'clock, and draining clockwise. A ring that starts at
                // three o'clock is a progress indicator; a clock face is what
                // this is.
                .rotationEffect(.degrees(-90))
                .animation(.linear(duration: 0.5), value: progress)

            Text(Self.clock(remaining))
                .helixText(.compact, weight: .bold, leading: .none)
                .helixNumber()
                .foregroundStyle(HelixPalette.text)
        }
        .frame(width: 48, height: 48)
    }

    private func adjust(_ seconds: TimeInterval, _ symbol: String) -> some View {
        Button { onAdjust(seconds) } label: {
            Image(systemName: "\(symbol).circle.fill")
                .font(.system(size: 24))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(HelixPalette.platinum)
        }
        .helixPress(scale: 0.86)
        .accessibilityLabel(seconds > 0 ? "Add 15 seconds" : "Remove 15 seconds")
    }

    private static func clock(_ remaining: TimeInterval) -> String {
        let total = Int(remaining.rounded(.up))
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

#Preview("Rest bar") {
    VStack {
        Spacer()
        RestTimerBar(
            endsAt: Date().addingTimeInterval(78), duration: 120,
            exerciseName: "Seated Cable Row (Wide Grip)",
            accent: HelixPalette.emerald,
            onAdjust: { _ in }, onStop: {}
        )
        RestTimerBar(
            endsAt: Date(), duration: 120,
            exerciseName: "Chest Press (Machine)",
            accent: HelixPalette.ember,
            onAdjust: { _ in }, onStop: {}
        )
    }
    .padding(.vertical, 40)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(HelixPalette.obsidian)
}
