import SwiftUI
import HelixUI
import HelixCore
import HelixData

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
    /// Which card the deck is on. Bound to `.scrollPosition`, so writing it
    /// scrolls and scrolling writes it.
    ///
    /// ── SEEDED IN `init`, NOT IN `onAppear` ─────────────────────────────────
    /// Writing it after the first layout asks a `LazyHStack` to scroll to a
    /// page it has not built yet, and what `viewAligned` then settles on is a
    /// position part way between two cards — the deck opened with the current
    /// movement hanging off the leading edge and the next one over the top of
    /// it. Seeded here, the first layout already knows where it is going.
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
    @AppStorage("helix.phase") private var storedPhase = ProgramPhase.cut.rawValue

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

    private var accent: Color { Color.helix.day(model.day.key) }

    var body: some View {
        VStack(spacing: HelixSpace.m) {
            if let storeError = model.storeError { banner(storeError) }
            totals
            deck
        }
        .padding(.top, HelixSpace.s)
        .helixScreen(.train)
        .foregroundStyle(Color.helix.textPrimary)
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
            withAnimation(HelixMotion.drawer) { model.stopRest() }
        }
        .onChange(of: model.phase) { _, next in storedPhase = next.rawValue }
    }

    // MARK: - Toolbar

    /// Leave the logger with the session still live — the rest timer keeps
    /// counting and the Lock Screen card stays, because the workout is not over.
    private var leaveItem: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button { dismiss() } label: { Image(systemName: "chevron.down") }
                .accessibilityLabel("Leave workout")
                .accessibilityHint("The session keeps running. Resume it from the Workout tab.")
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
            if let endsAt = model.restEndsAt {
                RestCapsule(
                    endsAt: endsAt,
                    accent: accent,
                    onSkip: { withAnimation(HelixMotion.drawer) { model.stopRest() } },
                    onAdjust: { model.adjustRest(by: $0) }
                )
                .transition(.scale(scale: 0.8).combined(with: .opacity))
            } else {
                Text(model.day.label)
                    .helixType(.body).fontWeight(.semibold)
                    .foregroundStyle(Color.helix.textPrimary)
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
            HStack(spacing: HelixSpace.m) {
                volumeStat; setsStat; records
                Spacer(minLength: 0)
                elapsed
            }
            VStack(alignment: .leading, spacing: HelixSpace.xs) {
                HStack(spacing: HelixSpace.m) { volumeStat; setsStat; records }
                elapsed
            }
            // Two by two. At AX5 three totals cannot share a row, and what
            // sharing it produced was "3," over "4" — a tonnage broken across
            // two lines mid-number. One per line was honest and 215 pt tall,
            // which pushed the first set row off the screen; paired, it is two.
            VStack(alignment: .leading, spacing: HelixSpace.xs) {
                HStack(spacing: HelixSpace.m) { volumeStat; setsStat }
                HStack(spacing: HelixSpace.m) { records; elapsed }
            }
            VStack(alignment: .leading, spacing: HelixSpace.xs) {
                volumeStat; setsStat; records; elapsed
            }
        }
        .padding(.horizontal, HelixSpace.m)
        .frame(minHeight: 44)
        .frame(maxWidth: .infinity, alignment: .leading)
        .helixGlass(.row)
        .padding(.horizontal, HelixSpace.l)
        .accessibilityElement(children: .combine)
    }

    private var volumeStat: some View {
        stat(HelixFormat.volume(model.totalVolumeKg), "kg", Color.helix.textPrimary)
    }

    private var setsStat: some View {
        stat("\(model.completedSets)/\(model.plannedSets)", "sets", accent)
    }

    private func stat(_ value: String, _ unit: String, _ color: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(value)
                .helixType(.body).fontWeight(.semibold).helixNumeral()
                .foregroundStyle(color)
            Text(unit).helixType(.caption).foregroundStyle(Color.helix.textTertiary)
        }
        // A total that wraps is a total that lies: "3,436" broken after the
        // comma reads as 3 on one line and 4 on the next.
        .lineLimit(1)
        .fixedSize()
        .animation(HelixMotion.counter, value: value)
    }

    /// A permanent gold zero is how gold stops meaning a personal record, so an
    /// empty count is a dash in tertiary ink and the gold arrives only when
    /// there is something to be gold about.
    @ViewBuilder
    private var records: some View {
        if model.recordCount > 0 {
            stat("\(model.recordCount)", "PR", Color.helix.record)
        } else {
            stat("—", "PR", Color.helix.textTertiary)
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
            Text(model.startedAt, style: .timer).helixNumeral()
        } icon: {
            Image(systemName: "hourglass")
        }
        .helixType(.caption)
        .foregroundStyle(Color.helix.textSecondary)
        .fixedSize()
    }

    // MARK: - The deck

    /// One movement at a time.
    ///
    /// `scrollTargetBehavior(.viewAligned)` is the whole paging mechanism: no
    /// `TabView`, no page index to keep in step with a model, no gesture code.
    /// The 0.96 on the neighbours is `scrollTransition`, which reads the card's
    /// live position during the drag rather than snapping between two states —
    /// so the card you are pulling in grows under your thumb the whole way,
    /// which is the difference between a deck and a slideshow.
    private var deck: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 0) {
                ForEach(Array(model.exercises.enumerated()), id: \.element.id) { index, exercise in
                    ScrollView(.vertical) {
                        ExerciseCardView(
                            exercise: exercise, model: model,
                            position: (index, model.exercises.count)
                        )
                        .frame(maxWidth: .infinity)
                    }
                    .scrollBounceBehavior(.basedOnSize)
                    .scrollIndicators(.hidden)
                    // ── THE GUTTER IS THE PAGE'S, NOT THE CONTAINER'S ───────
                    // Neither `safeAreaPadding` nor `contentMargins` works
                    // here: both inset the container while `.scrollPosition`
                    // aligns to the scroll view's own BOUNDS, so every card the
                    // deck moved to landed 16 pt off its leading edge with the
                    // next one over the top of it. Padding the PAGE and then
                    // sizing the padded result to the container leaves nothing
                    // that can disagree — and it has to be out here rather than
                    // on the card, or the `fixedSize` chips inside push
                    // straight back through it.
                    .padding(.horizontal, HelixSpace.l)
                    .containerRelativeFrame(.horizontal)
                    .scrollTransition(.interactive, axis: .horizontal) { content, phase in
                        content
                            .scaleEffect(phase.isIdentity ? 1 : 0.96)
                            .opacity(phase.isIdentity ? 1 : 0.8)
                    }
                    .id(exercise.id)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.viewAligned)
        .scrollPosition(id: $focus)
        .scrollIndicators(.hidden)
    }

    /// Move to the next unfinished movement once this one is done.
    ///
    /// The deck is ordered and the session is ordered, so the card you want
    /// after the last set of an exercise is never ambiguous. Doing it by hand
    /// means a horizontal drag between every movement, which is the one gesture
    /// the set rows have taken over.
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
        withAnimation(HelixMotion.move) { focus = next.id }
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
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text("Not saved locally").helixType(.secondary).fontWeight(.semibold)
                Text(message)
                    .helixType(.caption)
                    .foregroundStyle(Color.helix.textSecondary)
                    .lineLimit(3)
            }
        } icon: {
            Image(systemName: "exclamationmark.triangle.fill")
        }
        .foregroundStyle(Color.helix.danger)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(HelixSpace.m)
        .helixGlass(.row)
        .padding(.horizontal, HelixSpace.l)
        .textSelection(.enabled)
    }

    /// Stamp the session finished and take the card off the Lock Screen.
    /// Stamp the session finished — and only then leave.
    ///
    /// `finish` returns false when there is nothing to close: no store row, or
    /// not one working set logged (a session of warm-ups). Ending the activity
    /// and dismissing anyway left the session row open forever, the tab reading
    /// it back as live, and the failure reported to a screen that no longer
    /// existed. Now the sheet stays up and the banner has somewhere to appear.
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
private struct RestCapsule: View {
    let endsAt: Date
    let accent: Color
    let onSkip: () -> Void
    let onAdjust: (TimeInterval) -> Void

    var body: some View {
        Button(action: onSkip) {
            HStack(spacing: HelixSpace.xs) {
                Image(systemName: "timer")
                Text(timerInterval: Date()...endsAt, countsDown: true)
                    .helixNumeral()
                    // Reserved, so the capsule does not resize as the digits
                    // fall from 1:00 to 59.
                    .frame(minWidth: 42)
            }
            .helixType(.caption).fontWeight(.semibold)
            .foregroundStyle(accent)
            .padding(.horizontal, HelixSpace.s)
            .padding(.vertical, HelixSpace.xs)
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
            day: Program.helix5.day(key: "legs_a")!, phase: .bulk
        ))
    }
    .preferredColorScheme(.dark)
}
#endif
