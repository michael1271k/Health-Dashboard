import SwiftUI
import HelixCore
import HelixData
import HelixUI

/// The Today tab — the heart of the app.
///
/// ── NOT THE WEB DASHBOARD IN A NEW FONT (§3.5) ───────────────────────────────
/// · The tiles ARE the widgets: WidgetKit families at their own proportions,
///   one drawing shared with the Home Screen.
/// · Edit mode is the iOS jiggle, entered by long-press, left by Done; the
///   drag is the system's.
/// · Stacks are `TabView(.page)`, swiped vertically, with page dots.
/// · No desktop layout, no trend strip, no sidebar: one column, one surface.
/// · The orb is one number on one scale; the coach and the week sit under the
///   grid as glass cards rather than bands.
struct TodayTabView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.scenePhase) private var scenePhase

    /// A seeded model for the shot loop; the live one is built from the environment.
    var seeded: TodayModel?
    /// The Train tab has the logger; the Workout tile hands off to it.
    var onOpenTrain: () -> Void = {}
    var onOpenReports: () -> Void = {}

    @State private var resolved: TodayModel?

    var body: some View {
        Group {
            if let model = resolved {
                content(model)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .helixScreen(.recover)
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
            VStack(spacing: HelixSpace.m) {
                ReadinessOrbView(battery: model.feed?.snapshot.battery, readiness: model.feed?.readiness) {
                    model.sheet = .tile(.recovery)
                }
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
                    Text(failure).font(.footnote).foregroundStyle(Color.helix.danger)
                }
            }
            .padding(HelixSpace.l)
        }
        .scrollDisabled(false)
        .refreshable { model.refresh() }
        .navigationTitle("Today")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(model.editing ? "Done" : "Edit") {
                    withAnimation(HelixMotion.flick) { model.editing.toggle() }
                }
                .fontWeight(model.editing ? .bold : .regular)
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
