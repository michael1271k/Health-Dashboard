import OnyxCore
import OnyxData
import OnyxUI
import SwiftUI
import WatchKit

/// Rest, and the rating for the set that earned it.
///
/// ── WHY THE RPE LADDER LIVES HERE ───────────────────────────────────────────
/// Rest is 90 to 180 seconds of dead time. It is the only moment in a workout
/// when asking "how hard was that" is free — during the set it is noise, and
/// after the next set it is a memory test. Putting the ladder on its own page
/// would mean navigating to it, and nobody navigates to a rating.
///
/// It also gives `nil` the right shape. `SetSnapshot.rpe` is emphatic that an
/// unrated set is not a set rated zero — the progression rule has to tell "I
/// did not judge this" from "this was easy". On this screen, doing nothing IS
/// the unrated answer: the cover dismisses itself when the clock runs out and
/// no rating is written. You have to reach for a rung to make a claim.
///
/// ── AND THE LADDER IS EIGHT WORDS, NOT A NUMBER LINE ────────────────────────
/// `Effort.ladder` is eight NON-UNIFORM stops starting at 5.0 —
/// `[5, 6.5, 7.5, 8, 8.5, 9, 9.5, 10]` — because that is the shape of the scale
/// this athlete's 2,190 rated rows are on. A uniform 6-to-10 half-step scrubber
/// would write 6.0 and 7.0, which are not rungs: `Effort.rpeStopIndex` returns
/// -1 for them and the phone falls through to the CR-10 anchor, so the same set
/// would read with a word from a different scale on the two devices.
///
/// The Crown scrubs the ladder BY INDEX and the screen shows the word and its
/// reps-in-reserve gloss. A number on a ten-point scale means nothing to anyone
/// who has not memorised the scale — which is why the phone deleted its own
/// numeric picker.
struct RestView: View {

    @Environment(WatchModel.self) private var model
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dismiss) private var dismiss

    let pulse: RestPulse

    /// Which rung the Crown is on. -1 is "nothing chosen", which is the state
    /// this screen is designed to be left in.
    @State private var rung: Double = -1
    @State private var didWarn = false
    @State private var didFire = false

    private var chosen: RpeStop? {
        let index = Int(rung.rounded())
        guard index >= 0, index < Effort.ladder.count else { return nil }
        return Effort.ladder[index]
    }

    var body: some View {
        ScrollView {
            VStack(spacing: OnyxSpace.s) {
                clock
                ladder
                if let exercise = pulse.exercise {
                    Text("Next · \(exercise)")
                        .font(WatchType.label)
                        .foregroundStyle(WatchInk.secondary)
                        // Two lines: "Next · Incline Dumbbell Press" is three at
                        // 146 pt, and a "Next" line that pushes the ladder off
                        // the screen is worse than one that truncates.
                        .lineLimit(2)
                        .allowsTightening(true)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, OnyxSpace.s)
        }
        .safeAreaInset(edge: .bottom) { skip }
        .containerBackground(WatchInk.ground, for: .navigation)
        .dimmedWhenLuminanceReduced()
        .focusable()
        // The Crown means the ladder here, and nothing else is on screen — so
        // it is unambiguous by construction rather than by a focus ring.
        .digitalCrownRotation(
            $rung,
            from: -1, through: Double(Effort.ladder.count - 1), by: 1,
            sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true
        )
        .accessibilityElement()
        .accessibilityLabel("Effort")
        .accessibilityValue(chosen?.label ?? "not rated")
        .accessibilityAdjustableAction { direction in
            let next = rung + (direction == .increment ? 1 : -1)
            rung = min(Double(Effort.ladder.count - 1), max(-1, next))
        }
        .onChange(of: chosen?.value) { _, value in
            guard let value else { return }
            model.rate(value)
        }
        .task(id: pulse.endsAt) { await countdown() }
    }

    // MARK: - The clock

    /// mm:ss, counted by the SYSTEM.
    ///
    /// `Text(timerInterval:)` is ticked by the OS rather than by a timer in this
    /// view tree, which is what makes a running countdown cost nothing while the
    /// wrist is down — and what makes it still correct after the app has been
    /// suspended, because it is derived from an instant rather than accumulated.
    /// That is the same reason `RestPulse` carries `endsAt` and not a remaining
    /// duration.
    private var clock: some View {
        VStack(spacing: OnyxSpace.xs) {
            if !isLuminanceReduced && !reduceMotion {
                ring
            }
            Text(timerInterval: Date()...pulse.endsAt, countsDown: true)
                .font(WatchType.hero)
                .foregroundStyle(WatchInk.primary)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
    }

    /// The arc.
    ///
    /// Hidden in the always-on state AND under Reduce Motion, which share this
    /// one branch: an arc redrawn at 1 Hz stutters visibly, and it is precisely
    /// what Reduce Motion is asking to be spared. The digits keep counting in
    /// both cases, and the digits are the answer to the only question a dropped
    /// wrist is asking.
    private var ring: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let remaining = max(0, pulse.endsAt.timeIntervalSince(context.date))
            let fraction = pulse.duration > 0 ? remaining / pulse.duration : 0
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(WatchInk.commit, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: 44, height: 44)
                .accessibilityHidden(true)
        }
    }

    // MARK: - The ladder

    private var ladder: some View {
        VStack(spacing: 2) {
            Text(chosen?.label ?? "Rate")
                .font(WatchType.value)
                .foregroundStyle(chosen == nil ? WatchInk.secondary : WatchInk.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(chosen?.hint ?? "turn the crown")
                .font(WatchType.label)
                .foregroundStyle(WatchInk.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .padding(.vertical, OnyxSpace.xs)
        .containerRelativeFrame(.horizontal)
        .background(
            RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous)
                .fill(chosen == nil ? WatchInk.fill : WatchInk.fillActive)
        )
    }

    private var skip: some View {
        Button("Skip rest") {
            model.stopRest()
            dismiss()
        }
        .font(WatchType.label)
        .buttonStyle(.bordered)
        .tint(WatchInk.fill)
        .foregroundStyle(WatchInk.primary)
        .opacity(isLuminanceReduced ? 0 : 1)
        .disabled(isLuminanceReduced)
    }

    // MARK: - Haptics

    /// Warn at three seconds, fire at zero, then get out of the way.
    ///
    /// ── AND WHY THIS ONLY WORKS INSIDE AN `HKWorkoutSession` ────────────────
    /// A haptic fires when the app is frontmost or when a workout session is
    /// running. With your wrist down and no session, watchOS has suspended this
    /// process seconds ago: the countdown is frozen, the zero never arrives, and
    /// raising your wrist gets a cold launch. `WorkoutSessionController` is what
    /// makes every line of this screen mean anything.
    ///
    /// Driven by a `task` rather than a `Timer` so it is cancelled with the
    /// view, and keyed on `endsAt` so adding 15 s restarts it rather than
    /// leaving a second one running.
    private func countdown() async {
        didWarn = false
        didFire = false
        while !Task.isCancelled {
            let remaining = pulse.endsAt.timeIntervalSinceNow
            if remaining <= 3, !didWarn {
                didWarn = true
                WKInterfaceDevice.current().play(.click)
            }
            if remaining <= 0, !didFire {
                didFire = true
                WKInterfaceDevice.current().play(.notification)
                model.stopRest()
                dismiss()
                return
            }
            try? await Task.sleep(for: .milliseconds(250))
        }
    }
}
