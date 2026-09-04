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
/// `NavigationStack`, a `.sheet` and a `.safeAreaInset` simply have.
///
/// What is new: the header is a MATERIAL that content scrolls under rather than
/// a strip that content is pushed below; the numbers you type are the largest
/// thing on a row; the rest clock is a floating object with its own depth
/// instead of a figure in the toolbar; and every card is striped by the muscle
/// it trains rather than by the workout it belongs to.
struct LiveLoggerView: View {
    @State private var model: LoggerModel
    @State private var showDistribution = false
    @State private var showPhase = false
    @State private var showFinishConfirm = false
    @State private var isCollapsed = false

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

    /// Presented as a full-screen cover by `TrainTabView`; this is how it leaves.
    @Environment(\.dismiss) private var dismiss

    /// `activity` is BORROWED from the Train tab when the logger is presented as
    /// a cover, so dismissing the cover mid-session keeps the Lock Screen card
    /// alive and updatable. Previews and the harness pass nothing and get their
    /// own.
    init(model: LoggerModel, activity: LiveActivityController? = nil) {
        _model = State(initialValue: model)
        _activity = State(initialValue: activity ?? LiveActivityController())
    }

    private var accent: Color { Color(hex: model.day.accent) }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                if let storeError = model.storeError { storeBanner(storeError) }
                ForEach(model.exercises) { exercise in
                    ExerciseCardView(exercise: exercise, model: model, accent: accent)
                }
                Color.clear.frame(height: 96)   // room for the floating rest bar
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(background)
        // iOS 18's scroll geometry, rather than a `GeometryReader` sentinel view
        // inside the content. The sentinel approach reports a frame that is one
        // layout pass stale, which is exactly the lag that makes a collapsing
        // header feel like it is chasing the scroll.
        .onScrollGeometryChange(for: CGFloat.self) { geometry in
            geometry.contentOffset.y + geometry.contentInsets.top
        } action: { _, offset in
            let collapsed = offset > 52
            if collapsed != isCollapsed {
                withAnimation(HelixMotion.move) { isCollapsed = collapsed }
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) { header }
        .safeAreaInset(edge: .bottom, spacing: 0) { restBar }
        .toolbarVisibility(.hidden, for: .navigationBar)
        .sheet(isPresented: $showDistribution) { MuscleDistributionSheet(model: model) }
        .sheet(isPresented: $showPhase) {
            PhaseSheet(day: model.day, phase: Binding(
                get: { model.phase },
                set: { model.phase = $0 }
            ))
        }
        .confirmationDialog("Finish this session?", isPresented: $showFinishConfirm, titleVisibility: .visible) {
            Button("Finish", role: .destructive) { finish() }
            Button("Keep logging", role: .cancel) {}
        } message: {
            Text("\(model.completedSets) sets · \(HelixFormat.volume(model.totalVolumeKg)) kg. Saved on this device; the upload to Supabase arrives with the sync.")
        }
        .onAppear {
            model.attach()
            activity.start(model: model)
        }
        .onChange(of: model.completedSets) { _, _ in activity.update(model: model) }
        .onChange(of: model.restEndsAt) { _, _ in activity.update(model: model) }
        .onChange(of: model.phase) { _, next in storedPhase = next.rawValue }
    }

    /// A store write that failed, stated rather than swallowed.
    ///
    /// It is a banner and not an alert on purpose: the set is still on screen
    /// and still correct, the outbox will retry, and a modal between you and the
    /// next set would cost more than the failure does. What must never happen is
    /// the failure being invisible — a set that looks logged and is not is the
    /// one outcome this whole data layer exists to prevent.
    private func storeBanner(_ message: String) -> some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text("Not saved locally")
                    .helixText(.compact, weight: .bold, leading: .none)
                Text(message)
                    .helixText(.small)
                    .foregroundStyle(HelixPalette.muted)
                    .lineLimit(3)
            }
        } icon: {
            Image(systemName: "exclamationmark.triangle.fill")
        }
        .foregroundStyle(HelixPalette.oxide)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: HelixRadius.xl, style: .continuous)
                .fill(HelixPalette.oxide.alphaByte(0x1a))
        )
        .overlay(
            RoundedRectangle(cornerRadius: HelixRadius.xl, style: .continuous)
                .strokeBorder(HelixPalette.oxide.alphaByte(0x55), lineWidth: 1)
        )
        .textSelection(.enabled)
    }

    // MARK: - Background

    /// A wash of the day's colour, from the top, over obsidian.
    ///
    /// Flat black behind a dark card set makes every card read as the same
    /// distance away. A single low-frequency gradient gives the stack somewhere
    /// to be — and putting the day's hue in it is the cheapest possible way to
    /// answer "which workout is this" from the corner of an eye.
    private var background: some View {
        ZStack {
            HelixPalette.obsidian
            LinearGradient(
                colors: [accent.opacity(0.13), accent.opacity(0.02), .clear],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: 380)
            .frame(maxHeight: .infinity, alignment: .top)
        }
        .ignoresSafeArea()
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 0) {
            if isCollapsed {
                compactHeader
                    .transition(.move(edge: .top).combined(with: .opacity))
            } else {
                heroHeader
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .frame(maxWidth: .infinity)
        .helixChrome(accent: accent)
    }

    private var heroHeader: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                leaveButton
                VStack(alignment: .leading, spacing: 3) {
                    Text(model.day.label)
                        .helixText(.fluid2XL, weight: .bold, leading: .none)
                        .foregroundStyle(accent)
                    if let sub = model.day.sub {
                        Text(sub.uppercased())
                            .helixText(.micro, weight: .bold, leading: .none)
                            .tracking(1.3)
                            .foregroundStyle(HelixPalette.muted)
                    }
                }
                Spacer(minLength: 8)
                finishButton
            }

            HStack(spacing: 8) {
                phaseChip
                elapsed
                Spacer(minLength: 0)
                distributionButton
                overflowMenu
            }

            statRail
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .padding(.bottom, 12)
    }

    private var compactHeader: some View {
        HStack(spacing: 10) {
            leaveButton
            Text(model.day.label)
                .helixText(.fluidLG, weight: .bold, leading: .none)
                .foregroundStyle(accent)
                .lineLimit(1)

            Spacer(minLength: 4)

            compactStat(HelixFormat.volume(model.totalVolumeKg) + " kg", HelixPalette.ember)
            compactStat("\(model.completedSets) sets", HelixPalette.platinum)
            if model.recordCount > 0 {
                compactStat("\(model.recordCount) PR", HelixPalette.gold)
            }

            finishButton
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    private func compactStat(_ text: String, _ color: Color) -> some View {
        Text(text)
            .helixText(.small, weight: .semibold, leading: .none)
            .helixNumber()
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Capsule().fill(color.alphaByte(0x14)))
    }

    // MARK: - Header parts

    private var finishButton: some View {
        Button { showFinishConfirm = true } label: {
            Label("Finish", systemImage: "checkmark")
                .helixText(.compact, weight: .bold, leading: .none)
                .foregroundStyle(HelixPalette.text)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(
                    Capsule(style: .continuous)
                        .fill(LinearGradient(
                            colors: [HelixPalette.emerald, HelixPalette.emeraldDeep],
                            startPoint: .top, endPoint: .bottom
                        ))
                )
                .shadow(color: HelixPalette.emerald.opacity(0.35), radius: 10, y: 4)
        }
        .helixPress()
    }

    private var phaseChip: some View {
        Button { showPhase = true } label: {
            HStack(spacing: 5) {
                Image(systemName: model.phase == .cut ? "flame.fill" : "leaf.fill")
                    .font(.system(size: 9, weight: .bold))
                Text(model.phase.label.uppercased())
                    .helixText(.micro, weight: .black, leading: .none)
                    .tracking(1.1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 7, weight: .black))
            }
            .foregroundStyle(model.phase == .cut ? HelixPalette.Phase.cut : HelixPalette.Phase.bulk)
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .background(
                Capsule().fill((model.phase == .cut ? HelixPalette.Phase.cut : HelixPalette.Phase.bulk).alphaByte(0x1f))
            )
            .overlay(
                Capsule().strokeBorder(
                    (model.phase == .cut ? HelixPalette.Phase.cut : HelixPalette.Phase.bulk).alphaByte(0x55),
                    lineWidth: 0.75
                )
            )
        }
        .helixPress()
        .accessibilityLabel("Training phase, \(model.phase.label). Tap to change.")
    }

    /// Session duration, counted by the SYSTEM.
    ///
    /// `Text(_:style:.timer)` re-renders itself once a second without the view
    /// tree knowing, so a clock on this screen costs nothing — which is what
    /// makes it affordable to leave running while you type into a field two
    /// rows below it.
    private var elapsed: some View {
        HStack(spacing: 5) {
            Image(systemName: "hourglass")
                .font(.system(size: 10, weight: .bold))
            Text(model.startedAt, style: .timer)
                .helixText(.compact, weight: .semibold, leading: .none)
                .helixNumber()
        }
        .foregroundStyle(HelixPalette.muted)
        .fixedSize()
    }

    /// The body, in miniature. Monochrome at this size on purpose — sixteen
    /// family hues in a 26 pt figure is mud, and the question a thumbnail can
    /// answer is "is this all on one side of me", which shape alone answers.
    private var distributionButton: some View {
        Button { showDistribution = true } label: {
            HStack(spacing: 6) {
                AtlasFigure(
                    side: .front,
                    worked: MuscleCredit.worked(from: model.muscleSets),
                    monochromeTint: accent
                )
                .frame(height: 26)
                Text(HelixFormat.sets(model.muscleSets.values.reduce(0, +)))
                    .helixText(.small, weight: .bold, leading: .none)
                    .helixNumber()
                    .foregroundStyle(HelixPalette.muted)
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .helixRow(radius: HelixRadius.lg)
        }
        .helixPress()
        .accessibilityLabel("Muscle distribution")
    }

    private var overflowMenu: some View {
        Menu {
            Button("Muscle distribution", systemImage: "figure.stand") { showDistribution = true }
            Button("Change phase", systemImage: "arrow.triangle.2.circlepath") { showPhase = true }
            if model.restEndsAt != nil {
                Button("Skip rest", systemImage: "forward.end") { model.stopRest() }
            }
            Divider()
            Button("Finish session", systemImage: "checkmark.circle", role: .destructive) {
                showFinishConfirm = true
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(HelixPalette.muted)
                .frame(width: 32, height: 30)
                .helixRow(radius: HelixRadius.lg)
        }
    }

    // MARK: - Stat rail

    private var statRail: some View {
        HStack(spacing: 8) {
            statTile(
                value: HelixFormat.volume(model.totalVolumeKg), unit: "kg",
                label: "VOLUME", color: HelixPalette.ember
            )
            statTile(
                value: "\(model.completedSets)", unit: "/\(model.plannedSets)",
                label: "SETS", color: accent
            )
            // A permanent gold zero is how gold stops meaning a personal record,
            // so an empty record count is a dash in the muted tone and the gold
            // arrives only when there is something to be gold about.
            statTile(
                value: model.recordCount > 0 ? "\(model.recordCount)" : "—", unit: nil,
                label: "RECORDS",
                color: model.recordCount > 0 ? HelixPalette.gold : HelixPalette.dim
            )
        }
    }

    private func statTile(value: String, unit: String?, label: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .helixText(.label, weight: .semibold, leading: .none)
                .foregroundStyle(HelixPalette.muted)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .helixText(.fluidXL, weight: .bold, leading: .none)
                    .helixNumber()
                    .foregroundStyle(color)
                    .contentTransition(.numericText())
                if let unit {
                    Text(unit)
                        .helixText(.small, weight: .semibold, leading: .none)
                        .foregroundStyle(HelixPalette.dim)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 11)
        .padding(.vertical, 9)
        .background(
            RoundedRectangle(cornerRadius: HelixRadius.xl, style: .continuous)
                .fill(color.alphaByte(0x0f))
        )
        .overlay(
            RoundedRectangle(cornerRadius: HelixRadius.xl, style: .continuous)
                .strokeBorder(color.alphaByte(0x33), lineWidth: 1)
        )
        .animation(HelixMotion.counter, value: value)
    }

    // MARK: - Rest

    @ViewBuilder
    private var restBar: some View {
        if let endsAt = model.restEndsAt {
            RestTimerBar(
                endsAt: endsAt,
                duration: model.restDuration,
                exerciseName: model.restingExercise,
                accent: accent,
                onAdjust: { model.adjustRest(by: $0) },
                onStop: { withAnimation(HelixMotion.drawer) { model.stopRest() } }
            )
            .padding(.bottom, 8)
            // In from the bottom, out to the bottom. A panel that arrives one
            // way and leaves another breaks the spatial contract and reads as
            // two unrelated events.
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .animation(HelixMotion.drawer, value: model.restEndsAt)
        }
    }

    /// Stamp the session finished and take the card off the Lock Screen.
    ///
    /// The upload is deliberately absent: `workout_sets.set_index` is
    /// `set_number` server-side and `workout_sessions.date` has no counterpart
    /// at all, so a PostgREST write today would be a translation layer written
    /// in a view. The row is marked pending and the outbox already holds every
    /// set event, which is the state the sync work picks up from.
    private func finish() {
        model.finish()
        model.stopRest()
        activity.end()
        dismiss()
    }

    /// Leave the logger with the session still live — the rest timer keeps
    /// counting and the Lock Screen card stays, because the workout is not over.
    private var leaveButton: some View {
        Button { dismiss() } label: {
            Image(systemName: "chevron.down")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(HelixPalette.muted)
                .frame(width: 32, height: 30)
                .helixRow(radius: HelixRadius.lg)
        }
        .helixPress()
        .accessibilityLabel("Leave workout")
        .accessibilityHint("The session keeps running. Resume it from the Train tab.")
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
