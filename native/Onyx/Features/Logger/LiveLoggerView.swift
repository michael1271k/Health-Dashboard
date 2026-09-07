import SwiftUI
import OnyxUI
import OnyxCore
import OnyxData

/// The Live Logger.
///
/// ── WHAT SURVIVED THE PORT AND WHAT DID NOT ─────────────────────────────────
/// The web deck (`src/components/command-center/`, 7,246 lines) got the data
/// hierarchy right: which workout, what it has accumulated, then the movements
/// in order with their sets. That hierarchy is reproduced exactly. Almost
/// nothing else is.
///
/// What is gone: a sticky header re-implemented in JavaScript, a hand-rolled
/// bottom sheet, a scroll-position memory, an edge-swipe gesture, a
/// pull-to-refresh. All five exist in the web app to imitate behaviour a
/// `NavigationStack`, a `.sheet` and a toolbar simply have.
///
/// ── AND WHAT WAVE 2.4 CHANGED ───────────────────────────────────────────────
/// Wave 1 hid the navigation bar and drew its own: a hero header that collapsed
/// into a compact one, three stat tiles, a floating rest bar with its own ring
/// and its own ± buttons. That is 180 pt of chrome above a set row, all of it
/// re-implementing something the system ships — and re-implementing it worse,
/// because the collapse animated a frame behind the scroll.
///
/// So the bar is the system's bar. The rest clock lives in it, as a capsule in
/// the principal slot, which is exactly where iOS puts a running timer in Phone
/// and in Voice Memos. Everything the header used to hold that is not a number
/// you are reading right now moved into the trailing menu, and what is left on
/// screen is one 44 pt strip of totals and the movement in front of you.
struct LiveLoggerView: View {
    @State private var model: LoggerModel
    @State private var showDistribution = false
    @State private var showPhase = false
    @State private var showFinish = false
    @State private var confirmCancel = false
    /// Bumped when the rest clock reaches zero of its own accord — never when
    /// it is skipped or dragged into the past, both of which cancel the task
    /// below before it fires. §3.4 gives `.success` to "session finished"; a
    /// rest period that has run out is the same kind of event and it is the one
    /// the phone is in your pocket for.
    @State private var restExpiries = 0
    /// The movement you are WORKING ON — not the scroll offset.
    ///
    /// ── WHY THOSE ARE DIFFERENT THINGS NOW ──────────────────────────────────
    /// It used to be bound to `.scrollPosition` of a horizontal pager, so the
    /// two were the same fact by construction: the card on screen was the card
    /// you were on. A vertical list has no such identity — you scroll down to
    /// check what is coming and scroll back, and neither of those is a
    /// statement about which set you are standing in front of.
    ///
    /// So this is the logger's own cursor. Nothing writes it but `init` and
    /// `advanceIfFinished`, and the scroll follows it rather than the reverse.
    /// The one behaviour that depends on it — moving on when a movement is
    /// finished — then cannot be defeated by having scrolled somewhere.
    @State private var focus: String?

    /// `@State`, emphatically not `let`.
    ///
    /// A `View` is a struct that SwiftUI re-initialises on every parent redraw,
    /// so a stored `let` controller is a NEW controller each time — one that has
    /// forgotten the activity it started. The visible symptom is a Live Activity
    /// that appears once, never updates, and is still on the Lock Screen after
    /// the session ends, because nothing holds the handle any more.
    @State private var activity: LiveActivityController

    /// The phase survives a relaunch. Written here rather than in the model
    /// because it is a preference, and `LoggerModel` is a session — it should
    /// not know that a phase outlives the workout it was chosen for.
    @AppStorage("onyx.phase") private var storedPhase = ProgramPhase.cut.rawValue

    /// Presented as a full-screen cover by `WorkoutTabView`; this is how it leaves.
    @Environment(\.dismiss) private var dismiss

    /// `activity` is BORROWED from the Workout tab when the logger is presented
    /// as a cover, so dismissing the cover mid-session keeps the Lock Screen
    /// card alive and updatable. Previews and the harness pass nothing and get
    /// their own.
    init(model: LoggerModel, activity: LiveActivityController? = nil) {
        _model = State(initialValue: model)
        _activity = State(initialValue: activity ?? LiveActivityController())
        _focus = State(initialValue: model.currentSet?.exercise.id ?? model.exercises.first?.id)
    }

    private var accent: Color { Color.onyx.day(model.day.key) }

    var body: some View {
        VStack(spacing: OnyxSpace.m) {
            if let storeError = model.storeError { banner(storeError) }
            totals
            deck
        }
        .padding(.top, OnyxSpace.s)
        .onyxScreen(.train)
        .foregroundStyle(Color.onyx.textPrimary)
        .navigationTitle(model.day.label)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            leaveItem
            clockItem
            trailingItems
        }
        .sheet(isPresented: $showDistribution) { MuscleDistributionSheet(model: model) }
        .sheet(isPresented: $showPhase) {
            PhaseSheet(day: model.day, phase: Binding(
                get: { model.phase },
                set: { model.phase = $0 }
            ))
        }
        .sheet(isPresented: $showFinish) {
            FinishSheet(model: model, onFinish: finish)
        }
        // ── WHY A CONFIRMATION AND NOT AN UNDO ──────────────────────────────
        // §3.4 prefers undo to a prompt, and this is the exception the rule
        // has: the sets are gone from the log, the projection and the queue in
        // one transaction, and an undo would have to reconstruct events that
        // were deliberately destroyed. One dialog, and the message says exactly
        // what is at stake — which is nothing at all on the session this button
        // is mostly for.
        .confirmationDialog(
            model.completedSets > 0 ? "Discard this workout?" : "Cancel this workout?",
            isPresented: $confirmCancel,
            titleVisibility: .visible
        ) {
            Button(cancelActionTitle, role: .destructive) { cancelWorkout() }
            Button("Keep logging", role: .cancel) {}
        } message: {
            Text(cancelMessage)
        }
        .onAppear {
            model.attach()
            activity.start(model: model)
        }
        .onChange(of: model.completedSets) { _, _ in
            activity.update(model: model)
            advanceIfFinished()
        }
        // A warm-up changes neither `completedSets` nor the rest clock, and
        // `commitEdit` — retyping a load on a logged set — changes none of the
        // three. Both leave the Lock Screen showing a number that is no longer
        // true.
        .onChange(of: model.physicalSets) { _, _ in activity.update(model: model) }
        .onChange(of: model.totalVolumeKg) { _, _ in activity.update(model: model) }
        .onChange(of: model.restEndsAt) { _, _ in activity.update(model: model) }
        // And the record count moves on paths none of the three above touch:
        // demoting a ticked set to a warm-up keeps its tonnage and its physical
        // count and takes its record away.
        .onChange(of: model.recordCount) { _, _ in activity.update(model: model) }
        // ── THE CLOCK HAS TO END ITSELF ─────────────────────────────────────
        // `startRest` set a deadline and only a tap, an adjustment into the
        // past or the next set ever cleared it. So the capsule sat at 0:00
        // until you logged again, the nav title never came back, and the
        // Dynamic Island showed a dead countdown instead of the load. `.task`
        // is cancelled and restarted whenever the deadline moves, which is
        // exactly the ±15 s case.
        .task(id: model.restEndsAt) {
            guard let endsAt = model.restEndsAt else { return }
            try? await Task.sleep(for: .seconds(max(0, endsAt.timeIntervalSinceNow)))
            guard !Task.isCancelled else { return }
            restExpiries += 1
            withAnimation(OnyxMotion.drawer) { model.stopRest() }
        }
        // §3.4: `.success` on the rest clock running out. The capsule vanishing
        // from the navigation bar is the only visual notice, and the phone is
        // face-down on a bench when it happens.
        .sensoryFeedback(.success, trigger: restExpiries)
        .onChange(of: model.phase) { _, next in storedPhase = next.rawValue }
    }

    // MARK: - Toolbar

    /// Leave the logger with the session still live — the rest timer keeps
    /// counting and the Lock Screen card stays, because the workout is not over.
    private var leaveItem: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarLeading) {
            Button { dismiss() } label: { Image(systemName: "chevron.down") }
                .accessibilityLabel("Leave workout")
                .accessibilityHint("The session keeps running. Resume it from the Workout tab.")

            // ── AND WHY LEAVING NEEDED A SIBLING ────────────────────────────
            // The chevron was the only way out, and it leaves the session
            // RUNNING — which is right, and which meant a logger opened on the
            // wrong day, or by a pocket, had no exit that did not end in a
            // workout. Opening the screen still costs nothing (`attach` looks a
            // session up and never creates one), so the button mostly just
            // closes a door; when a set HAS been logged it is the only control
            // in the app that can take it back.
            Button(role: .destructive) { confirmCancel = true } label: {
                Image(systemName: "trash")
            }
            .tint(Color.onyx.danger)
            .accessibilityLabel("Cancel workout")
            .accessibilityHint("Ends the session and discards anything logged in it.")
        }
    }

    /// The rest clock, where iOS puts a running timer: the principal slot.
    ///
    /// It replaces the title rather than sitting beside it, because while you
    /// are resting the remaining seconds ARE what this screen is about — and
    /// the title comes back the moment the clock stops, which is a state change
    /// worth showing rather than a layout to keep stable.
    private var clockItem: some ToolbarContent {
        ToolbarItem(placement: .principal) {
            // `restCountdown`, not `model.restEndsAt` directly — the deadline
            // outlives this view. `.task(id:)` is what clears it, and leaving
            // the logger cancels that task, so a rest started here and left to
            // expire on the Workout tab comes back as a date in the PAST.
            if let countdown = restCountdown(model.restEndsAt) {
                RestCapsule(
                    countdown: countdown,
                    accent: accent,
                    onSkip: { withAnimation(OnyxMotion.drawer) { model.stopRest() } },
                    onAdjust: { model.adjustRest(by: $0) }
                )
                .transition(.scale(scale: 0.8).combined(with: .opacity))
            } else {
                Text(model.day.label)
                    .onyxType(.body).fontWeight(.semibold)
                    .foregroundStyle(Color.onyx.textPrimary)
            }
        }
    }

    private var trailingItems: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            Menu {
                Button("Muscle distribution", systemImage: "figure.stand") { showDistribution = true }
                Button("Change phase", systemImage: "arrow.triangle.2.circlepath") { showPhase = true }
                if model.restEndsAt != nil {
                    Button("Skip rest", systemImage: "forward.end") { model.stopRest() }
                }
            } label: {
                Image(systemName: "ellipsis")
            }
            .accessibilityLabel("More")

            Button("Finish") { showFinish = true }
                .fontWeight(.semibold)
        }
    }

    // MARK: - Totals

    /// One 44 pt strip where three tiles used to be.
    ///
    /// The tiles said VOLUME, SETS and RECORDS in three boxes with three
    /// borders, stacked over a coach line that repeated the same verdict — a
    /// §3.6 defect in the same file as the sets it was pushing off screen.
    /// Three numbers on one line is the same information at a fifth of the
    /// height, and the height is what the logger is short of.
    private var totals: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: OnyxSpace.m) {
                volumeStat; setsStat; records
                Spacer(minLength: 0)
                elapsed
            }
            VStack(alignment: .leading, spacing: OnyxSpace.xs) {
                HStack(spacing: OnyxSpace.m) { volumeStat; setsStat; records }
                elapsed
            }
            // Two by two. At AX5 three totals cannot share a row, and what
            // sharing it produced was "3," over "4" — a tonnage broken across
            // two lines mid-number. One per line was honest and 215 pt tall,
            // which pushed the first set row off the screen; paired, it is two.
            VStack(alignment: .leading, spacing: OnyxSpace.xs) {
                HStack(spacing: OnyxSpace.m) { volumeStat; setsStat }
                HStack(spacing: OnyxSpace.m) { records; elapsed }
            }
            VStack(alignment: .leading, spacing: OnyxSpace.xs) {
                volumeStat; setsStat; records; elapsed
            }
        }
        .padding(.horizontal, OnyxSpace.m)
        .frame(minHeight: 44)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onyxGlass(.row)
        .padding(.horizontal, OnyxSpace.l)
        .accessibilityElement(children: .combine)
    }

    private var volumeStat: some View {
        stat(OnyxFormat.volume(model.totalVolumeKg), "kg", Color.onyx.textPrimary)
    }

    private var setsStat: some View {
        stat("\(model.completedSets)/\(model.plannedSets)", "sets", accent)
    }

    private func stat(_ value: String, _ unit: String, _ color: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(value)
                .onyxType(.body).fontWeight(.semibold).onyxNumeral()
                .foregroundStyle(color)
            Text(unit).onyxType(.caption).foregroundStyle(Color.onyx.textTertiary)
        }
        // A total that wraps is a total that lies: "3,436" broken after the
        // comma reads as 3 on one line and 4 on the next.
        .lineLimit(1)
        .fixedSize()
        .animation(OnyxMotion.counter, value: value)
    }

    /// A permanent gold zero is how gold stops meaning a personal record, so an
    /// empty count is a dash in tertiary ink and the gold arrives only when
    /// there is something to be gold about.
    @ViewBuilder
    private var records: some View {
        if model.recordCount > 0 {
            stat("\(model.recordCount)", "PR", Color.onyx.record)
        } else {
            stat("—", "PR", Color.onyx.textTertiary)
        }
    }

    /// Session duration, counted by the SYSTEM.
    ///
    /// `Text(_:style:.timer)` re-renders itself once a second without the view
    /// tree knowing, so a clock on this screen costs nothing — which is what
    /// makes it affordable to leave running while you type into a field two
    /// rows below it.
    private var elapsed: some View {
        Label {
            Text(model.startedAt, style: .timer).onyxNumeral()
        } icon: {
            Image(systemName: "hourglass")
        }
        .onyxType(.caption)
        .foregroundStyle(Color.onyx.textSecondary)
        .fixedSize()
    }

    // MARK: - The deck

    /// Every movement, on one page, scrolled vertically.
    ///
    /// ── WHY THE PAGER WENT ──────────────────────────────────────────────────
    /// It was a horizontal deck, one movement per page, snapped with
    /// `.viewAligned`. It reads beautifully and it is the wrong shape for this
    /// screen. A workout is not a slideshow you advance through once: you look
    /// ahead at what is coming to decide how hard to go now, you drop back to
    /// the movement before to fix a load you mistyped, and you want to see that
    /// the session is eleven movements long without counting "3 of 11" eleven
    /// times. Every one of those is a scroll in a list and a page-flick hunt in
    /// a deck.
    ///
    /// It also cost the rows a gesture. The card's set rows are swiped
    /// horizontally to log, and a horizontal pager under them meant the two were
    /// competing for the same drag on every row of every card — which is why the
    /// row's own swipe has to abandon itself the moment the finger goes
    /// vertical. Vertical scrolling and horizontal rows do not overlap at all.
    ///
    /// ── AND WHY THE SCROLL FOLLOWS `focus` RATHER THAN REPORTING IT ─────────
    /// `.scrollPosition(id:)` is a two-way binding, which was exactly right when
    /// the position and the current movement were the same fact. They are not
    /// here — see `focus` — so this is a `ScrollViewReader` and a one-way
    /// `scrollTo`. Scrolling to read never moves the cursor, and finishing a
    /// movement still takes you to the next one.
    private var deck: some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical) {
                LazyVStack(spacing: OnyxSpace.m) {
                    ForEach(Array(model.exercises.enumerated()), id: \.element.id) { index, exercise in
                        ExerciseCardView(
                            exercise: exercise, model: model,
                            position: (index, model.exercises.count)
                        )
                        .frame(maxWidth: .infinity)
                        .id(exercise.id)
                    }
                }
                // 12 rather than the 16 the rest of the app uses. The set row
                // inside these cards is within a few points of the width of a
                // phone (see `ExerciseCardView.sets`), and a gutter the row
                // cannot afford is not a gutter — it is an overflow that draws
                // the cards edge to edge and looks like no gutter was asked for.
                .padding(.horizontal, OnyxSpace.m)
                // The last card has to be able to reach the middle of the
                // screen, or finishing the session means logging its final set
                // with the keyboard over it.
                .padding(.bottom, OnyxSpace.xl)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: focus) { _, next in
                guard let next else { return }
                withAnimation(OnyxMotion.move) { proxy.scrollTo(next, anchor: .top) }
            }
            // Resuming mid-session opens on the set you stopped at, not at the
            // top of a workout that is half done. Unanimated on purpose: this is
            // where the screen STARTS, and a scroll you did not ask for on the
            // first frame reads as the app losing its place.
            .task { proxy.scrollTo(focus, anchor: .top) }
        }
    }

    /// Move to the next unfinished movement once this one is done.
    ///
    /// The deck is ordered and the session is ordered, so the card you want
    /// after the last set of an exercise is never ambiguous — and scrolling to
    /// it by hand, past a card you have just filled in, is the one piece of
    /// navigation the screen genuinely knows how to do for you.
    ///
    /// It moves `focus`, which the scroll follows; it never reads where the
    /// scroll happens to BE. Having scrolled down to look at what is coming
    /// must not change what finishing this movement does.
    private func advanceIfFinished() {
        guard let index = model.exercises.firstIndex(where: { $0.id == focus }),
              model.exercises[index].isComplete
        else { return }
        // FORWARD only. `model.currentSet` is the first unticked row in
        // document order, so a session where the first movement was skipped and
        // the third finished would send the deck backwards to card one.
        guard let next = model.exercises[(index + 1)...].first(where: { !$0.isComplete })
                ?? model.currentSet?.exercise,
              next.id != focus
        else { return }
        withAnimation(OnyxMotion.move) { focus = next.id }
    }

    // MARK: - Failures

    /// A store write that failed, stated rather than swallowed.
    ///
    /// It is a banner and not an alert on purpose: the set is still on screen
    /// and still correct, the outbox will retry, and a modal between you and the
    /// next set would cost more than the failure does. What must never happen is
    /// the failure being invisible — a set that looks logged and is not is the
    /// one outcome this whole data layer exists to prevent.
    private func banner(_ message: String) -> some View {
        OnyxBanner(tone: .failure, title: "Not saved locally", message: message)
            .padding(.horizontal, OnyxSpace.l)
    }

    /// Stamp the session finished and take the card off the Lock Screen.
    /// Stamp the session finished — and only then leave.
    ///
    /// `finish` returns false when there is nothing to close: no store row, or
    /// not one working set logged (a session of warm-ups). Ending the activity
    /// and dismissing anyway left the session row open forever, the tab reading
    /// it back as live, and the failure reported to a screen that no longer
    /// existed. Now the sheet stays up and the banner has somewhere to appear.
    /// What the confirmation offers, and what it warns about.
    ///
    /// The two states are genuinely different actions and the dialog says so: a
    /// session with nothing in it has nothing to discard, and telling someone
    /// their sets are about to be deleted when there are none is how a dialog
    /// stops being read.
    private var cancelActionTitle: String {
        model.completedSets > 0 ? "Discard \(model.completedSets) sets" : "Cancel workout"
    }

    private var cancelMessage: String {
        model.completedSets > 0
            ? "The sets logged in this session are deleted here and on the server. This cannot be undone."
            : "Nothing has been logged, so nothing is saved. The session closes and no workout is recorded."
    }

    /// Discard the session and leave.
    ///
    /// The store failing keeps the screen up: `model.cancel` puts the reason in
    /// `storeError`, the banner is already rendering it, and dismissing anyway
    /// would leave the session live with the failure reported to a screen that
    /// no longer exists — the same rule `finish` follows.
    private func cancelWorkout() {
        guard model.cancel() else { return }
        model.stopRest()
        activity.end()
        dismiss()
    }

    private func finish(sessionRpe: Double?) -> Bool {
        guard model.finish(sessionRpe: sessionRpe) else { return false }
        model.stopRest()
        activity.end()
        dismiss()
        return true
    }
}

// MARK: - The rest clock

/// The rest clock, as a capsule in the navigation bar.
///
/// ── WHY `Text(timerInterval:)` AND NOT A `TimelineView` ─────────────────────
/// The Wave 1 bar drove a `TimelineView(.periodic(by: 0.5))` so it could animate
/// a ring. A ring in a 44 pt bar is 20 pt across and says nothing the digits do
/// not, and the schedule woke the view twice a second to say so. `Text` with a
/// timer interval is counted by the SYSTEM — the same mechanism the Live
/// Activity uses, so the bar and the Lock Screen cannot disagree — and it costs
/// this view exactly nothing.
///
/// ── AND WHY THE END INSTANT, NOT A COUNTER ──────────────────────────────────
/// The end is stored and the remaining time derived. A decrementing counter
/// drifts, and worse, it is wrong after a backgrounding — iOS suspends the app
/// between sets routinely, and a counter resumes where it stopped while a
/// deadline is simply late.
///
/// ── AND WHY IT TAKES A RANGE RATHER THAN THE DEADLINE ───────────────────────
/// `Text(timerInterval:)` traps on a range whose end is behind its start —
/// "Fatal error: Range requires lowerBound <= upperBound" — so the check has to
/// happen where the value is still optional, at the call site. `restCountdown`
/// in `Shared/` is that check, and it is shared with the Lock Screen card and
/// the Dynamic Island, which have the same problem for a different reason.
private struct RestCapsule: View {
    let countdown: ClosedRange<Date>
    let accent: Color
    let onSkip: () -> Void
    let onAdjust: (TimeInterval) -> Void

    var body: some View {
        Button(action: onSkip) {
            HStack(spacing: OnyxSpace.xs) {
                Image(systemName: "timer")
                Text(timerInterval: countdown, countsDown: true)
                    .onyxNumeral()
                    // Reserved, so the capsule does not resize as the digits
                    // fall from 1:00 to 59.
                    .frame(minWidth: 42)
            }
            .onyxType(.caption).fontWeight(.semibold)
            .foregroundStyle(accent)
            .padding(.horizontal, OnyxSpace.s)
            .padding(.vertical, OnyxSpace.xs)
            .background(Capsule().fill(accent.opacity(0.18)))
            .overlay(Capsule().strokeBorder(accent.opacity(0.45), lineWidth: 0.5))
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button("Add 15 seconds", systemImage: "plus") { onAdjust(15) }
            Button("Take 15 seconds off", systemImage: "minus") { onAdjust(-15) }
            Button("Skip rest", systemImage: "forward.end") { onSkip() }
        }
        .accessibilityLabel("Resting")
        .accessibilityHint("Tap to skip. Long press to add or remove fifteen seconds.")
    }
}

// MARK: - Previews

#if DEBUG
#Preview("Live Logger — Upper B, cut, mid-session") {
    NavigationStack {
        LiveLoggerView(model: .previewUpperB(logged: true))
    }
    .preferredColorScheme(.dark)
}
#endif

#if DEBUG
#Preview("Live Logger — Legs & Core A, bulk, fresh") {
    NavigationStack {
        LiveLoggerView(model: LoggerModel(
            day: Program.onyx5.day(key: "legs_a")!, phase: .bulk
        ))
    }
    .preferredColorScheme(.dark)
}
#endif
