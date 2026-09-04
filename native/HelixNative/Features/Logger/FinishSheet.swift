import SwiftUI
import HelixUI
import HelixCore

/// How the session ends.
///
/// ── WHY A SHEET AND NOT A CONFIRMATION DIALOG ───────────────────────────────
/// Wave 1 ended a workout with `confirmationDialog("Finish this session?")` —
/// two buttons and a sentence of totals. That is the right control for a
/// destructive action and finishing is not one: it is the moment the session
/// becomes history, the only moment a session RPE can be asked for, and the
/// last thing you see before putting the phone away. A dialog can hold none of
/// that, and a dialog is also the wrong shape for a decision you might want to
/// look at first — you cannot scroll it, and you cannot leave it half open.
///
/// `.presentationDetents([.medium, .large])` gives both: the dial and the
/// totals at medium, the whole summary by dragging up, and the same
/// interruptible grab every other sheet in the app has.
struct FinishSheet: View {
    let model: LoggerModel
    let onFinish: (Double?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var rpe: Double = 8
    /// An unrated session stays unrated. `sessionRpe` is nullable in the store
    /// precisely so "I did not say" survives, and a dial that starts at 8 would
    /// otherwise write an 8 for everyone who never touched it.
    @State private var rated = false
    /// The finish haptic fires on a CHANGE, so it needs something that changes.
    @State private var finishTicks = 0

    private var accent: Color { Color.helix.day(model.day.key) }
    private var minutes: Int { max(0, Int(Date().timeIntervalSince(model.startedAt) / 60)) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: HelixSpace.l) {
                    dial
                    summary
                    if let sessionId = model.sessionId {
                        NavigationLink {
                            SessionDetailView(sessionId: sessionId)
                        } label: {
                            HStack {
                                Text("View summary")
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right")
                                    .helixType(.caption)
                                    .foregroundStyle(Color.helix.textTertiary)
                            }
                            .helixType(.body)
                            .foregroundStyle(Color.helix.textPrimary)
                            .padding(.horizontal, HelixSpace.m)
                            .frame(minHeight: 44)
                            .frame(maxWidth: .infinity)
                            .helixGlass(.row)
                        }
                        .buttonStyle(.plain)
                    }
                    finishButton
                }
                .padding(HelixSpace.l)
            }
            .helixScreen(.train)
            .navigationTitle("Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Keep logging") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationContentInteraction(.scrolls)
    }

    // MARK: - Effort

    private var dial: some View {
        VStack(spacing: HelixSpace.s) {
            RPEDial(value: $rpe, rated: $rated, accent: accent)
            Text("How hard was the whole session?")
                .helixType(.caption)
                .foregroundStyle(Color.helix.textSecondary)
        }
    }

    // MARK: - Summary

    private var summary: some View {
        VStack(spacing: 0) {
            line("Working sets", "\(model.completedSets) of \(model.plannedSets)")
            divider
            line("Tonnage", "\(HelixFormat.volume(model.totalVolumeKg)) kg")
            divider
            line("Duration", "\(minutes) min")
            if model.recordCount > 0 {
                divider
                line("Records", "\(model.recordCount)", tint: Color.helix.record)
            }
            if !topMovements.isEmpty {
                divider
                line("Heaviest lift", topMovements)
            }
        }
        .padding(.horizontal, HelixSpace.m)
        .helixGlass(.tile)
    }

    private var divider: some View { Divider().overlay(Color.helix.hairline) }

    private func line(_ label: String, _ value: String, tint: Color = Color.helix.textPrimary) -> some View {
        HStack(spacing: HelixSpace.s) {
            Text(label)
                .helixType(.body)
                .foregroundStyle(Color.helix.textSecondary)
            Spacer(minLength: HelixSpace.s)
            Text(value)
                .helixType(.body).fontWeight(.semibold).helixNumeral()
                .foregroundStyle(tint)
                .multilineTextAlignment(.trailing)
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }

    /// The movement that moved the most weight, named. One line, because the
    /// full breakdown is what "View summary" is for and repeating it here would
    /// be the sheet arguing with the screen it links to.
    private var topMovements: String {
        guard let best = model.exercises.max(by: { $0.volumeKg < $1.volumeKg }), best.volumeKg > 0
        else { return "" }
        return "\(best.name) · \(HelixFormat.volume(best.volumeKg)) kg"
    }

    private var finishButton: some View {
        Button {
            finishTicks += 1
            onFinish(rated ? rpe : nil)
        } label: {
            Text("Finish session")
                .helixType(.body).fontWeight(.semibold)
                .foregroundStyle(Color.helix.textPrimary)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(
                    HelixDomain.train.ramp,
                    in: RoundedRectangle(cornerRadius: HelixCorner.tile, style: .continuous)
                )
        }
        .helixPress(scale: 0.98)
        // §3.4: `.success` on session finished. It is the last thing the app
        // says about this workout and the only haptic on this sheet.
        .sensoryFeedback(.success, trigger: finishTicks)
    }
}

// MARK: - The dial

/// Session RPE, on a dial.
///
/// ── WHY A DIAL AND NOT A SLIDER ─────────────────────────────────────────────
/// A slider is the same gesture as the swipe that logs a set and the drag that
/// pages the deck, and this is the one control on the screen that should not
/// feel like those — it is a considered answer, not a quick one. A dial also
/// puts the value in the MIDDLE of the control it is set by, which is what lets
/// the number be the largest thing on the sheet without a label pointing at it.
///
/// It is adjustable from VoiceOver as well: `accessibilityAdjustableAction` maps
/// swipe-up and swipe-down to the same half-point detents the finger gets.
private struct RPEDial: View {
    @Binding var value: Double
    @Binding var rated: Bool
    let accent: Color

    /// CR-10 below 6 is a warm-up, not a session. The dial covers the range a
    /// finished workout actually lands in and the digits stay readable.
    private static let low = 6.0
    private static let high = 10.0
    /// A three-quarter sweep, opening at the bottom — the shape of every dial
    /// Apple ships, and the gap is where the finger starts and stops rather
    /// than a place the value can hide.
    private static let sweep = 270.0
    private static let start = 135.0

    /// The dial scales with Dynamic Type: the numeral inside it does, and a
    /// fixed frame around growing type is how a gauge ends up with its own
    /// reading spilling over the rim.
    @ScaledMetric(relativeTo: .title) private var diameter: CGFloat = 168

    private var fraction: Double { (value - Self.low) / (Self.high - Self.low) }

    var body: some View {
        ZStack {
            track
            // Nothing is filled until something has been RATED. A dial that
            // arrives showing half a sweep has answered the question for you,
            // and 8 is exactly the answer nobody should be defaulted into.
            if rated { fill }
            reading
        }
        .frame(width: side, height: side)
        .contentShape(Circle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { set(from: $0.location) }
        )
        .sensoryFeedback(.selection, trigger: value)
        .animation(HelixMotion.move, value: value)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Session effort")
        .accessibilityValue(rated ? "RPE \(HelixFormat.rpe(value))" : "Not rated")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: commit(value + 0.5)
            case .decrement: commit(value - 0.5)
            default: break
            }
        }
    }

    private var side: CGFloat { min(diameter, 260) }

    private var stroke: StrokeStyle {
        StrokeStyle(lineWidth: 12, lineCap: .round)
    }

    /// ── WHY `trim` AND A ROTATION, NOT `Path.addArc` ────────────────────────
    /// `addArc` takes its angles in the layer's coordinate space, where Y points
    /// DOWN and `clockwise` therefore means the opposite of what it reads as.
    /// The first version of this dial drew its gap on the right and filled
    /// anticlockwise from twelve o'clock — geometry that is correct in the
    /// textbook and wrong on the screen. `Circle().trim` starts at three
    /// o'clock and runs clockwise, always, and a rotation puts the start where
    /// the design wants it: 135° is the bottom-left, so the gap lands at the
    /// bottom where the finger rests.
    private var track: some View {
        Circle()
            .trim(from: 0, to: Self.sweep / 360)
            .stroke(Color.helix.hairline, style: stroke)
            .rotationEffect(.degrees(Self.start))
            .padding(6)
    }

    private var fill: some View {
        Circle()
            .trim(from: 0, to: Self.sweep / 360 * max(0, min(1, fraction)))
            .stroke(Color.helix.effort(value), style: stroke)
            .rotationEffect(.degrees(Self.start))
            .padding(6)
    }

    /// The value, and only the value.
    ///
    /// It carried a "SESSION RPE" register label under the numeral, and at AX5
    /// that label wrapped to two lines and spilled out through both sides of the
    /// ring. It was redundant anyway: the sheet asks "How hard was the whole
    /// session?" two lines below, and a dial with one number in the middle of it
    /// is not ambiguous about what the number is.
    private var reading: some View {
        Text(rated ? HelixFormat.rpe(value) : "—")
            .helixHero()
            .foregroundStyle(rated ? Color.helix.effort(value) : Color.helix.textTertiary)
    }

    /// Where the finger is, as a value.
    ///
    /// Screen angles run clockwise from east, so the arc's own parameter is the
    /// touch angle rotated back to the opening at the bottom-left. A touch in
    /// the GAP has no value on the dial, so it snaps to whichever end it is
    /// nearer — which is what a physical dial with a stop does, and is better
    /// than the alternative of the value jumping across the whole range.
    private func set(from point: CGPoint) {
        let dx = point.x - side / 2
        let dy = point.y - side / 2
        let degrees = atan2(dy, dx) * 180 / .pi
        var swept = degrees - Self.start
        while swept < 0 { swept += 360 }
        let clamped: Double
        if swept <= Self.sweep {
            clamped = swept / Self.sweep
        } else {
            clamped = swept < (360 + Self.sweep) / 2 ? 1 : 0
        }
        commit(Self.low + clamped * (Self.high - Self.low))
    }

    private func commit(_ raw: Double) {
        // Half points, which is what the CR-10 ladder has and what every RPE in
        // the store is already rounded to.
        let stepped = (raw * 2).rounded() / 2
        value = min(Self.high, max(Self.low, stepped))
        rated = true
    }
}

#if DEBUG
#Preview("Finish") {
    FinishSheet(model: .previewUpperB(logged: true), onFinish: { _ in })
        .environment(AppEnvironment.preview)
}
#endif
