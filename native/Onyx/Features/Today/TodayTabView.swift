import SwiftUI
import OnyxCore
import OnyxData
import OnyxUI

/// The Today tab — the heart of the app.
///
/// ── NOT THE WEB DASHBOARD IN A NEW FONT (§3.6) ───────────────────────────────
/// · The tiles ARE the widgets: WidgetKit families at their own proportions,
///   one drawing shared with the Home Screen.
/// · Edit mode is the iOS jiggle, entered by long-press and left by Done. There
///   is no Edit BUTTON: a permanent control for a mode you enter by touching the
///   thing you want to edit is the web app's affordance, not the phone's.
/// · Stacks are `TabView(.page)`, swiped vertically, with page dots.
/// · No desktop layout, no trend strip, no sidebar: one column, one surface.
/// · The screen opens on one row — score, battery, today's session — and the
///   verdict is said once, in the coach card, rather than twice.
struct TodayTabView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.scenePhase) private var scenePhase

    /// A seeded model for the shot loop; the live one is built from the environment.
    var seeded: TodayModel?
    /// The Workout tab has the logger; the Workout tile hands off to it.
    var onOpenTrain: () -> Void = {}
    var onOpenReports: () -> Void = {}
    /// The Now strip is a summary of Pulse, so tapping it goes there.
    var onOpenPulse: () -> Void = {}

    @State private var resolved: TodayModel?
    /// Bumped when a PULL finishes — the only sync §3.4 gives a haptic, because
    /// it is the only one the user is waiting on.
    @State private var pulls = 0

    var body: some View {
        Group {
            if let model = resolved {
                content(model)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .onyxScreen(.recover)
        .task {
            if resolved == nil {
                resolved = seeded ?? TodayModel(database: environment.database, userId: environment.userIdString)
            }
            await resolved?.observe()
        }
    }

    private func content(_ model: TodayModel) -> some View {
        @Bindable var model = model
        return ScrollView {
            VStack(spacing: OnyxSpace.m) {
                NowStrip(
                    score: model.feed?.snapshot.score,
                    battery: model.feed?.snapshot.battery,
                    workout: model.feed?.snapshot.workout,
                    status: environment.sync,
                    onOpen: onOpenPulse
                )
                if let feed = model.feed, feed.weeklySummaryReady {
                    WeeklySummaryCTA(weekStart: feed.lastWeekStart, onOpen: onOpenReports)
                }
                DashboardGrid(model: model) { open($0, model) }
                if model.editing { WidgetGallery(model: model) }
                if let feed = model.feed {
                    InsightCoachView(readiness: feed.readiness, insights: feed.insights)
                    WeekSoFarView(week: feed.weekSoFar)
                }
                if let failure = model.failure {
                    Text(failure).onyxType(.caption).foregroundStyle(Color.onyx.danger)
                }
            }
            .padding(OnyxSpace.l)
        }
        .scrollDisabled(false)
        // §5.1: the hairline is the sync's whole visual budget. It sits at the
        // top of the CONTENT, not in the nav bar, because a bar that changes
        // height when a sync starts moves the screen under the reader's thumb.
        .overlay(alignment: .top) { syncHairline }
        .animation(OnyxMotion.fade, value: environment.sync.phase)
        .refreshable {
            await environment.syncNow(reason: .pull)
            model.refresh()
            pulls += 1
        }
        // §3.4 gives sync TWO haptics, and a pull that failed must not feel like
        // one that worked. The phase is read at the moment the pull lands.
        .sensoryFeedback(trigger: pulls) { _, _ in
            if case .failed = environment.sync.phase { return .error }
            return .success
        }
        .navigationTitle("Onyx")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                NavigationLink {
                    HistoryView()
                } label: {
                    Image(systemName: "calendar")
                }
                .accessibilityLabel("History")
            }
            ToolbarItem(placement: .primaryAction) {
                if model.editing {
                    Button("Done") {
                        withAnimation(OnyxMotion.flick) { model.editing = false }
                    }
                    .fontWeight(.bold)
                } else {
                    // The mark, not a control: it is the wordmark's other half
                    // and the one place the ring appears at app scale.
                    OnyxMark(size: 18, opacity: 1)
                        .accessibilityHidden(true)
                }
            }
        }
        .sheet(item: $model.sheet) { which in
            switch which {
            case .tile(let id): DomainSheet(id: id, entry: model.entry, onStartWorkout: onOpenTrain)
            case .stack(let slotId): StackEditSheet(slotId: slotId, model: model)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            model.isActive = phase == .active
            if phase == .active { model.refresh() }
        }
    }

    /// 1 pt of Lunar while a sync runs, and nothing at all when one is not.
    /// A track that is always drawn is a progress bar claiming to be at zero.
    @ViewBuilder
    private var syncHairline: some View {
        if environment.sync.phase == .running {
            Rectangle()
                .fill(OnyxDomain.recover.ramp)
                .frame(height: 1)
                .transition(.opacity)
                .accessibilityHidden(true)
        }
    }

    /// Three states for the Workout tile, every one about today: a training
    /// day opens the logger, a logged or rest day opens the sheet.
    private func open(_ id: WidgetId, _ model: TodayModel) {
        if id == .train, let w = model.feed?.snapshot.workout, !w.isRestDay, !w.logged {
            onOpenTrain()
        } else {
            model.sheet = .tile(id)
        }
    }
}
