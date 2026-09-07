import OnyxCore
import OnyxData
import OnyxUI
import SwiftUI
import WatchKit

/// The set in front of you. This is the app.
///
/// ── ONE SCREEN, AND NO PAGER ────────────────────────────────────────────────
/// The first design here was a three-page `TabView(.verticalPage)` — SET, RPE,
/// REST — and it could not have worked. `.digitalCrownRotation` is delivered to
/// the FOCUSED view, and a vertical pager claims Crown focus for paging: the
/// load binding and the container would have been two consumers of one focus,
/// and the result on device is either the page sliding when you meant to add a
/// plate or the Crown going dead. Apple's own Workout app binds the Crown to no
/// value on any page of its pager, for exactly this reason.
///
/// So: a `NavigationStack`, one screen, and rest is a `fullScreenCover` — a
/// STATE you are in rather than a page you can visit. Two of three pages were
/// dead 90% of the time anyway, which teaches a reader that swiping is a
/// lottery.
///
/// ── THE CROWN MEANS WHATEVER HAS THE RING ───────────────────────────────────
/// Multiple meanings for the Crown are fine. Meanings bound to which PAGE you
/// are on are not, because the page is invisible while you are staring at the
/// numeral. Tap the kilograms, the focus ring moves there, the Crown drives
/// kilograms. Tap the reps, the ring moves, the Crown drives reps. One control,
/// one visible answer to "what will this change", no modes to remember.
///
/// ── AND THERE IS NO STEPPER ─────────────────────────────────────────────────
/// A `−`/`+` pair is the direct port of the phone's `SetRowView.stepper` and it
/// is the loudest tell that a watch app used to be a phone app. Two 32 pt ends
/// cost 64 of the 146 pt this screen actually has at 40 mm — 44% of the width —
/// to do worse, with more noise, what one Crown turn does eyes-free. The Crown
/// is the only adjuster and the tick is the only button.
struct SetView: View {

    @Environment(WatchModel.self) private var model
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced

    /// Which value the Crown drives. See the type header.
    private enum Field: Hashable { case load, reps }
    @FocusState private var field: Field?

    var body: some View {
        @Bindable var model = model

        Group {
            if !model.holdsPencil {
                MirrorView()
            } else if let cursor = model.cursor {
                logger(cursor, model: model)
            } else {
                FinishView()
            }
        }
        .containerBackground(WatchInk.ground, for: .navigation)
        .navigationTitle(model.day?.label ?? "Onyx")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if model.sessionId != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink { DeckView() } label: { Image(systemName: "list.bullet") }
                        .tint(WatchInk.secondary)
                }
            }
        }
        .onAppear { if field == nil { field = .load } }
    }

    // MARK: - The logger

    @ViewBuilder
    private func logger(_ cursor: WatchModel.Cursor, model: WatchModel) -> some View {
        @Bindable var model = model

        // ── A SCROLLVIEW FROM COMMIT ONE ────────────────────────────────────
        // Not because the content is long — at default text size it fits — but
        // because at Larger Text and Bold Text it does not, and a fixed VStack
        // clips silently on watchOS with no warning and no diagnostic. Scrolling
        // is the difference between "the tick moved down" and "the tick is
        // drawn off the display".
        //
        // The tick itself is pinned with `.safeAreaInset`, NOT pushed down with
        // a `Spacer()` — a Spacer inside a ScrollView collapses to zero, which
        // is the trap that jams every element to the top the moment this is
        // wrapped.
        ScrollView {
            VStack(alignment: .leading, spacing: OnyxSpace.s) {
                Text(cursor.movement.plan.name)
                    // Two lines, not the phone's three: at 146 pt with Bold Text
                    // on, "Incline Dumbbell Press" truncates on one and there is
                    // no room for three.
                    .font(WatchType.name)
                    .foregroundStyle(WatchInk.primary)
                    .lineLimit(2)
                    .allowsTightening(true)

                Text("Set \(cursor.setNumber) of \(cursor.movement.plannedSets)")
                    .font(WatchType.label)
                    .foregroundStyle(WatchInk.secondary)

                loadRow(model: model)
                repsRow(model: model)

                // The one line from the phone's card worth its width here. It is
                // the number the next set is actually chosen from — worth more,
                // on a wrist, than the movement's own name.
                if let last = model.lastTime {
                    Text("last · \(last)")
                        .font(WatchType.label)
                        .foregroundStyle(WatchInk.secondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .safeAreaInset(edge: .bottom) { tick }
        .dimmedWhenLuminanceReduced()
    }

    // MARK: - The two values

    private func loadRow(model: WatchModel) -> some View {
        @Bindable var model = model

        return ValueRow(
            value: Deck.fmtKg(model.load),
            unit: "kg",
            font: WatchType.hero,
            isFocused: field == .load
        )
        .focusable(!isLuminanceReduced)
        .focused($field, equals: .load)
        // ── ONE DETENT IS 1.25 kg ───────────────────────────────────────────
        // `Ceilings.loadSteps` is `[2.5, 1.25]` and `loadStepFineKg` is 1.25 —
        // the plate stack's own two steps, pinned by `TrainingGoldenTests`, and
        // its comment says the constants live there "so both clients agree
        // before either draws a control". This is that control.
        //
        // NOT `Deck.fineStep` (0.25): that is the snap grid a hand-TYPED load is
        // rounded to, not a UI step, and at 0.25 per detent one plate is ten
        // clicks.
        .digitalCrownRotation(
            $model.load,
            from: 0, through: 500, by: Ceilings.loadStepFineKg,
            sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true
        )
        .onTapGesture { field = .load }
        // ── VOICEOVER TAKES THE CROWN ───────────────────────────────────────
        // `.digitalCrownRotation` is invisible to VoiceOver, and VoiceOver
        // claims the Crown for its own navigation — so a load whose only input
        // is the Crown is a load a VoiceOver user cannot change at all. This is
        // the same mutation, reachable by swipe.
        .accessibilityElement()
        .accessibilityLabel("Load")
        .accessibilityValue("\(Deck.fmtKg(model.load)) kilograms")
        .accessibilityAdjustableAction { direction in
            let step = direction == .increment ? Ceilings.loadStepFineKg : -Ceilings.loadStepFineKg
            model.load = Deck.nudgeLoad(model.load, step)
        }
    }

    private func repsRow(model: WatchModel) -> some View {
        @Bindable var model = model

        return ValueRow(
            value: "\(model.reps)",
            unit: "reps",
            font: WatchType.value,
            isFocused: field == .reps
        )
        .focusable(!isLuminanceReduced)
        .focused($field, equals: .reps)
        .digitalCrownRotation(
            Binding(
                get: { Double(model.reps) },
                set: { model.reps = max(1, Int($0.rounded())) }
            ),
            from: 1, through: 50, by: 1,
            sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true
        )
        .onTapGesture { field = .reps }
        .accessibilityElement()
        .accessibilityLabel("Reps")
        .accessibilityValue("\(model.reps)")
        .accessibilityAdjustableAction { direction in
            model.reps = max(1, model.reps + (direction == .increment ? 1 : -1))
        }
    }

    // MARK: - The one button

    private var tick: some View {
        Button {
            if model.commitSet() {
                WKInterfaceDevice.current().play(.success)
            } else {
                WKInterfaceDevice.current().play(.failure)
            }
        } label: {
            Label("Log set", systemImage: "checkmark")
                .font(WatchType.value)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(WatchInk.commit)
        .foregroundStyle(WatchInk.onCommit)
        // ── THE CHEAPEST WAY TO BEAT HEVY, IN ONE MODIFIER ──────────────────
        // Double-pinch logs the set. Hevy's advantage over a phone is not
        // needing your phone; this app's advantage over Hevy is not needing your
        // hand — which matters most at the exact moment your hands are chalked,
        // gloved or still on the bar.
        .handGestureShortcut(.primaryAction)
        // A full-width accent at full brightness for three minutes of rest is
        // an OLED power cost and a burn-in risk. Hidden rather than dimmed: a
        // button drawn as pressable that needs a wake-tap first is a button
        // that should not be drawn.
        .opacity(isLuminanceReduced ? 0 : 1)
        .disabled(isLuminanceReduced)
    }
}

// MARK: - A focusable number

/// A value the Crown can drive, with the ring that says so.
///
/// The ring is the entire legibility argument for one Crown with two meanings
/// (see `SetView`'s header) — so it is drawn as a real border rather than a
/// tint, and it is the thing that changes when focus moves.
private struct ValueRow: View {
    let value: String
    let unit: String
    let font: Font
    let isFocused: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.xs) {
            Text(value)
                .font(font)
                .foregroundStyle(WatchInk.primary)
                // Six characters at hero size — `137.25` is reachable on the
                // 1.25 grid — is ~130 pt of the 146 available at 40 mm.
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(unit)
                .font(WatchType.label)
                .foregroundStyle(WatchInk.secondary)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, OnyxSpace.s)
        .padding(.vertical, OnyxSpace.xs)
        // `containerRelativeFrame`, never a hardcoded `.frame(width:)`:
        // watchOS does not clip an over-wide child and does not warn — it draws
        // it off the display.
        .containerRelativeFrame(.horizontal)
        .background(
            RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous)
                .fill(isFocused ? WatchInk.fillActive : WatchInk.fill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous)
                .strokeBorder(isFocused ? WatchInk.commit : .clear, lineWidth: 2)
        )
    }
}
