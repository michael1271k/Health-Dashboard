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
/// So the bar is the system's bar. The rest clock lived in it, as a capsule in
/// the principal slot, which is exactly where iOS puts a running timer in Phone
/// and in Voice Memos. Everything the header used to hold that is not a number
/// you are reading right now moved into the trailing menu, and what was left on
/// screen was one 44 pt strip of totals and the movement in front of you.
///
/// ── AND WHAT PHASE 3 MADE IT ────────────────────────────────────────────────
/// The logger is the flagship screen now, and a flagship cannot be a system
/// title over a strip of three numbers. Wave U1 gives it a hero in the day's own
/// colour — the split, the week, and a 34 pt clock you can stop — a segmented
/// control between two faces of one model, and a row of chips where a three-dot
/// menu used to hide four verbs.
///
/// What moved, and where it went:
///   • the 44 pt totals strip → the Live Stats face's `Now` card, with room to
///     say what each number is (`LiveStatsView`);
///   • `Text(startedAt, style: .timer)` in that strip → the hero's clock, which
///     is now pausable and correctable (`LoggerHero`, `TimerSheet`);
///   • the `.principal` rest capsule → under the hero (`LoggerRestCapsule`),
///     because a countdown you watch for ninety seconds is content;
///   • the trailing three-dot `Menu` → `OnyxChipRow`, where "Skip rest" is
///     absent rather than present-and-disabled;
///   • "Muscle distribution" → a card that draws the body, and still opens the
///     sheet it used to be a menu item for.
///
/// The navigation bar keeps exactly what it should: the two ways out.
struct LiveLoggerView: View {
    @State private var model: LoggerModel
    @State private var showDistribution = false
    @State private var showPhase = false
    @State private var showFinish = false
    @State private var showTimer = false
    @State private var confirmCancel = false
    @State private var editingNote = false
    @State private var noteDraft = ""

    /// Which face, and how it got here — the animation travels with it.
    @State private var selection = LoggerFaceSelection()
    /// What the pager is showing. Driven from `selection`; the two are separate
    /// only because `scrollPosition` wants an optional binding of its own.
    @State private var scrolledFace: LoggerFace?
    /// The screen's own width, measured on the stack that spans it.
    ///
    /// A page has to be exactly one screen wide or the face beside it shows down
    /// the edge of the one you are reading. Neither a `GeometryReader` nor
    /// `containerRelativeFrame` gave that number at an accessibility size — both
    /// resolved against a box the chip row had widened — so it is measured where
    /// it is known to be right: the stack the hero spans.
    @State private var pageWidth: CGFloat = 0

    /// The session clock. `LoggerClock` until wave E4 makes `LoggerModel`
    /// conform to `PauseControlling`; at that point this `@State` goes and the
    /// hero, the timer sheet and the Live Activity are handed `model` instead.
    /// Nothing else on this screen changes, which is what the protocol bought.
    @State private var clock: LoggerClock

    /// Records claimed so far. `SeedPrProvider` until E4 lights `LivePrEngine`.
    @State private var prs: SeedPrProvider
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
    ///
    /// `face` and `clock` are the same argument the finish sheet's harness case
    /// makes: a screen with a state nobody can reach is a screen nobody
    /// maintains. Live Stats and a paused session are two of this screen's three
    /// faces, and neither can be photographed by a shot script that can only
    /// launch it. They are ordinary parameters rather than debug flags because
    /// they are ordinary facts — which face is showing, and which clock is
    /// running — and wave E4 hands `clock` the `LoggerModel` itself.
    init(
        model: LoggerModel,
        activity: LiveActivityController? = nil,
        face: LoggerFace = .workout,
        clock: LoggerClock? = nil
    ) {
        _model = State(initialValue: model)
        _activity = State(initialValue: activity ?? LiveActivityController())
        _focus = State(initialValue: model.currentSet?.exercise.id ?? model.exercises.first?.id)
        _selection = State(initialValue: LoggerFaceSelection(face: face))
        _scrolledFace = State(initialValue: face)
        _clock = State(initialValue: clock ?? LoggerClock(startedAt: model.startedAt))
        _prs = State(initialValue: SeedPrProvider(model: model))
    }

    private var accent: Color { Color.onyx.day(model.day.key) }

    var body: some View {
        VStack(spacing: OnyxSpace.m) {
            LoggerHero(
                day: model.day,
                clock: clock,
                selection: $selection,
                onTimer: { showTimer = true }
            )
            if let storeError = model.storeError { banner(storeError) }
            restCapsule
            OnyxChipRow(chips, pinned: finishChip)
            faces
        }
        .frame(maxWidth: .infinity)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { pageWidth = $0 }
        // One place, so the capsule arriving, the "Skip rest" chip arriving and
        // the deck sliding down for both are ONE movement rather than three
        // that start together and end apart.
        .animation(OnyxMotion.drawer, value: model.restEndsAt)
        .onyxScreen(.train)
        .foregroundStyle(Color.onyx.textPrimary)
        // The hero says which workout this is, in 28 pt and in the day's own
        // colour. A system title repeating it in 17 pt grey is the same fact
        // twice, and the bar's material over the mesh is a second surface where
        // the design has one.
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar { leaveItem }
        .sheet(isPresented: $showTimer) { TimerSheet(clock: clock, accent: accent) }
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
        // The note is a fast action rather than a row in the set options sheet:
        // it is about the MOVEMENT, and it was two taps down a sheet that is
        // about one set of it.
        .alert("Note", isPresented: $editingNote) {
            TextField("What happened on this lift?", text: $noteDraft)
            Button("Save") { noteTarget?.note = noteDraft }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(noteTarget?.name ?? "")
        }
        .onAppear {
            model.attach()
            activity.start(model: model, clock: clock)
        }
        .onChange(of: model.completedSets) { _, _ in
            activity.update(model: model, clock: clock)
            advanceIfFinished()
        }
        // The Lock Screen mirrors the pause. A card counting a session up while
        // the phone in your hand says it is stopped is the two surfaces
        // disagreeing about the number that becomes `duration_min`.
        .onChange(of: clock.pausedAt) { _, _ in activity.update(model: model, clock: clock) }
        .onChange(of: clock.startedAt) { _, _ in activity.update(model: model, clock: clock) }
        // A warm-up changes neither `completedSets` nor the rest clock, and
        // `commitEdit` — retyping a load on a logged set — changes none of the
        // three. Both leave the Lock Screen showing a number that is no longer
        // true.
        .onChange(of: model.physicalSets) { _, _ in activity.update(model: model, clock: clock) }
        .onChange(of: model.totalVolumeKg) { _, _ in activity.update(model: model, clock: clock) }
        .onChange(of: model.restEndsAt) { _, _ in activity.update(model: model, clock: clock) }
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

    // MARK: - Fast actions

    /// Muscle focus · Phase · Skip rest · Note · Finish.
    ///
    /// ── WHY A ROW AND NOT THE MENU IT REPLACES ──────────────────────────────
    /// These were behind `Menu { … }` in the toolbar: two taps and a system
    /// popover — over the deck the popover was about — to skip a rest. A menu is
    /// the right shape for a long, cold list. These are four verbs used every
    /// session with wet hands.
    ///
    /// "Skip rest" is ABSENT rather than disabled when nothing is resting, and
    /// the row springs closed around the gap. A control that is present and does
    /// nothing is a control you have to read before you can ignore it.
    private var chips: [OnyxChip] {
        var out: [OnyxChip] = [
            OnyxChip(title: "Muscle focus", systemImage: "figure.stand") { showDistribution = true },
            OnyxChip(title: "Phase", systemImage: "arrow.triangle.2.circlepath") { showPhase = true },
        ]
        if model.restEndsAt != nil {
            out.append(OnyxChip(title: "Skip rest", systemImage: "forward.end", tint: accent) {
                withAnimation(OnyxMotion.drawer) { model.stopRest() }
            })
        }
        out.append(OnyxChip(title: "Note", systemImage: "square.and.pencil") {
            noteDraft = noteTarget?.note ?? ""
            editingNote = true
        })
        return out
    }

    /// The one chip that ends the screen, so the one that is filled — and the
    /// one that is pinned out of the scroll. With "Skip rest" present, a
    /// five-chip row runs past 402 pt and Finish was the half off the edge.
    private var finishChip: OnyxChip {
        OnyxChip(title: "Finish", systemImage: "checkmark", tint: accent, isProminent: true) {
            showFinish = true
        }
    }

    /// The movement a note would be about: the one you are standing in front of,
    /// or the last one when the session is finished and there is no current set.
    private var noteTarget: LoggerModel.ExerciseState? {
        model.currentSet?.exercise ?? model.exercises.last
    }

    // MARK: - Rest

    @ViewBuilder
    private var restCapsule: some View {
        // `restCountdown`, not `model.restEndsAt` directly — the deadline
        // outlives this view. `.task(id:)` is what clears it, and leaving the
        // logger cancels that task, so a rest started here and left to expire on
        // the Workout tab comes back as a date in the PAST, which
        // `Text(timerInterval:)` traps on.
        if let countdown = restCountdown(model.restEndsAt) {
            LoggerRestCapsule(
                countdown: countdown,
                accent: accent,
                onSkip: { withAnimation(OnyxMotion.drawer) { model.stopRest() } },
                onAdjust: { model.adjustRest(by: $0) }
            )
            .frame(maxWidth: .infinity)
            .transition(.scale(scale: 0.9).combined(with: .opacity))
        }
    }

    // MARK: - The two faces

    /// One model, two pages, one slide.
    ///
    /// ── WHY BOTH PAGES STAY IN THE TREE ─────────────────────────────────────
    /// The deck is a `ScrollView` and you are eleven movements into it. A face
    /// switch that rebuilt it would return you to the top of a workout that is
    /// half done — the exact failure `focus` exists to prevent on the other
    /// axis. Two children of an `HStack` at an offset are both alive, so the
    /// scroll offset is simply never lost. The deck's own `LazyVStack` is what
    /// keeps the offscreen cost to nothing.
    ///
    /// The spring comes from the SELECTION, so the pill in the hero and the page
    /// under it move on one animation: damping 1.0 when a segment was tapped,
    /// 0.8 when the pill was thrown.
    private var faces: some View {
        // ── WHY A SCROLL VIEW NOBODY CAN SCROLL ─────────────────────────────
        // The first cut measured the page width with a `GeometryReader` and slid
        // an `HStack` by that much. It was right at the default text size and
        // wrong at AX5: a `GeometryReader` is only as wide as its parent lets it
        // be, the chip row's pinned chip widened that parent past the screen,
        // and the Live Stats page came into view down the right-hand edge of the
        // deck — and `containerRelativeFrame` resolved against the same widened
        // box. So the width is measured once, on the stack the hero spans, which
        // is demonstrably the screen; both pages take it and nothing else can.
        //
        // Scrolling is off because the deck's set rows are swiped horizontally
        // to log (wave U2 retires that; until then it is live), and a pager
        // underneath would compete for the same finger on every row of every
        // card. The gesture lives on the segmented control's pill instead.
        // `scrollPosition` still moves it, and it moves on the ambient
        // animation — which is how the pill and the page ride one spring.
        ScrollView(.horizontal) {
            HStack(spacing: 0) {
                deck
                    .frame(width: max(pageWidth, 1))
                    .id(LoggerFace.workout)
                    .accessibilityHidden(selection.face != .workout)
                LiveStatsView(
                    model: model,
                    clock: clock,
                    prs: prs,
                    onMuscleFocus: { showDistribution = true }
                )
                .frame(width: max(pageWidth, 1))
                .id(LoggerFace.stats)
                .accessibilityHidden(selection.face != .stats)
            }
            // A plain `HStack`, not a lazy one: both faces stay built, which is
            // what keeps the deck's scroll offset across a switch.
            .scrollTargetLayout()
        }
        .scrollDisabled(true)
        .scrollIndicators(.hidden)
        .scrollPosition(id: $scrolledFace, anchor: .leading)
        .onChange(of: selection.face) { _, next in
            withAnimation(selection.animation) { scrolledFace = next }
        }
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
