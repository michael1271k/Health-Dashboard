import SwiftUI
import OnyxUI
import OnyxCore
import OnyxData

/// The Workout tab — the week behind you, the session in front of you, and the
/// door into the logger.
///
/// ── THE LOGGER IS A COVER, NOT THE TAB ──────────────────────────────────────
/// Wave 1 put `LiveLoggerView` at the tab root, which made opening the tab the
/// same thing as starting a workout: the Live Activity appeared on the Lock
/// Screen because you glanced at Thursday's plan. A workout is something you
/// START. This screen shows what the week has been and what the day asks, and
/// one deliberate tap presents the logger as a full-screen cover.
///
/// ── WHY THE MODEL AND THE ACTIVITY LIVE HERE ────────────────────────────────
/// The cover can be dismissed mid-session to check the Pulse tab. If the logger
/// owned its `LoggerModel` and `LiveActivityController`, dismissing it would
/// drop the rest timer and orphan the Lock Screen card — a card nothing can
/// update or end, and a second one on re-open. So both are `@State` on the tab
/// that outlives the cover, and the logger borrows them.
///
/// ── WHAT WAVE 2.8 CHANGED ───────────────────────────────────────────────────
/// The tab used to be ONE tile: a 400 pt plan card with a 88 pt atlas, a phase
/// chip, and seven exercise rows at 44 pt each — a screen that answered "what is
/// today" three times and never answered "how is the week going" or "what should
/// go up". §5.2 re-cuts it into four things of different sizes, in the order you
/// actually ask them: the week, then today, then the lifts that have earned a
/// heavier load, then cardio. The plan rows shrink to 36 pt because they are a
/// reminder, not a document — the logger is where you read a set.
struct WorkoutTabView: View {
    @Environment(AppEnvironment.self) private var environment

    /// Cut is the live block. `@AppStorage` so the toggle survives a relaunch.
    @AppStorage("onyx.phase") private var storedPhase = ProgramPhase.cut.rawValue

    /// Supplied only by the screenshot harness, which cannot depend on which
    /// weekday the shot happens to run on. The app never passes one.
    var seededDay: ProgramDay?
    var seededToday: String?

    @State private var week: WorkoutWeek?
    /// The session this tab is keeping, live or not. Survives the cover being
    /// dismissed — that is the whole reason it lives here.
    @State private var session: LoggerModel?
    /// The session the cover is PRESENTING, which is a different fact: leaving
    /// the logger mid-workout clears this and keeps `session`, so the rest timer
    /// and the Lock Screen card carry on and "Resume workout" has something to
    /// resume.
    @State private var presented: LoggerModel?
    @State private var activity = LiveActivityController()
    @State private var showPhase = false
    @State private var loggingCardio = false
    /// The swap sheet. §5.2 item 3 puts rest and swap on the session card,
    /// which is where the thing being moved actually is — the Pulse tab's
    /// Schedule tile is deleted in the same wave.
    @State private var swapping = false
    /// The session to push once the cover closes on a FINISHED workout.
    ///
    /// ── WHY THE TAB PUSHES IT AND NOT THE FINISH SHEET ──────────────────────
    /// The sheet is inside a full-screen cover that is being torn down in the
    /// same transaction — a push from there lands on a stack that is about to
    /// stop existing. The tab outlives both, so it is the only place that can
    /// put the summary on screen and leave it there.
    @State private var summary: String?
    /// Bumped when a dismissal turns out to have finished the session. The
    /// haptic lived on the finish button, which was torn down in the same
    /// transaction that fired it, so it very likely never played.
    @State private var finishes = 0

    private var phase: ProgramPhase { ProgramPhase(rawValue: storedPhase) ?? .cut }
    private var accent: Color { Color.onyx.accent(.train) }

    /// Today's deck. The harness pins it; the app resolves it through the
    /// schedule rule (plan · per-date swaps · weekday layout), never off the
    /// raw weekday.
    private var today: ProgramDay? { seededDay ?? week?.todayDay }

    /// Where today stands. `.none` until the first read lands, which is the
    /// honest answer — the footer says "Start" and means it.
    private var state: WorkoutWeek.State { week?.snapshot.state ?? .none }

    var body: some View {
        ScrollView {
            VStack(spacing: OnyxSpace.l) {
                weekPanel
                if let day = today { sessionCard(day) } else { restCard }
                progressionCard
                cardioRow
            }
            .padding(.horizontal, OnyxSpace.l)
            .padding(.top, OnyxSpace.s)
            .padding(.bottom, OnyxSpace.xl)
        }
        .onyxScreen(.train)
        .navigationTitle("Workout")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                // The library, the ledger and the charts are sub-screens of
                // training, not extra tabs. Five is where iOS stops giving you
                // a tab bar and starts giving you a "More" list.
                NavigationLink {
                    ExerciseLibraryView()
                } label: {
                    Label("Exercises", systemImage: "books.vertical")
                }
                NavigationLink {
                    HistoryView()
                } label: {
                    Label("History", systemImage: "clock")
                }
                NavigationLink {
                    TrainingTrendsView()
                } label: {
                    Label("Trends", systemImage: "chart.xyaxis.line")
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { footer }
        .navigationDestination(item: $summary) { id in
            SessionDetailView(sessionId: id)
        }
        // ── WHY `item:` AND NOT `isPresented:` ──────────────────────────────
        // The boolean form evaluated `if let session` inside its own content
        // builder, so a cover presented in the same runloop turn as the model
        // being assigned came up with NOTHING in it — a full-screen black
        // rectangle with no way back except the gesture. Presenting by item
        // makes the model's existence the precondition of the cover, and the
        // empty case stops being representable.
        .fullScreenCover(item: $presented, onDismiss: reload) { model in
            NavigationStack {
                LiveLoggerView(model: model, activity: activity)
            }
            .preferredColorScheme(.dark)
        }
        .sheet(isPresented: $showPhase) {
            if let day = today {
                PhaseSheet(day: day, phase: Binding(
                    get: { phase },
                    set: { storedPhase = $0.rawValue }
                ))
            }
        }
        .sheet(isPresented: $loggingCardio) {
            if let week {
                CardioLogSheet(userId: week.userId, date: week.today, onSave: week.addCardio)
            }
        }
        // Re-read on dismissal: a swap rewrites today's day key, which changes
        // the card, the week panel and the progression queue at once.
        .sheet(isPresented: $swapping, onDismiss: { Task { await week?.refresh() } }) {
            if let week {
                // The undo lives INSIDE the sheet: undoing a swap clears TWO
                // dates (memory `swap-day-semantics`) and the sentence saying
                // which is the whole reason it is safe to offer.
                SwapSheetDoor(date: week.today)
            }
        }
        .task {
            if week == nil {
                week = WorkoutWeek(
                    database: environment.database, userId: environment.userIdString,
                    phase: phase, seededToday: seededToday, seededDayKey: seededDay?.key
                )
            }
            await week?.refresh()
        }
        .onChange(of: storedPhase) { _, next in
            week?.setPhase(ProgramPhase(rawValue: next) ?? .cut)
        }
        // §3.4: `.success` on session finished.
        .sensoryFeedback(.success, trigger: finishes)
    }

    // MARK: - This week

    /// Seven days, at a glance, in the colour of what they train.
    ///
    /// ── WHY A ROW OF DAYS AND NOT A BAR CHART OF TONNAGE ────────────────────
    /// The question this panel answers is "am I on the plan", and the plan is
    /// stated in SESSIONS, not kilograms. A filled cell is a session that
    /// happened, a hollow ring is one the plan is still expecting, and a grey
    /// dot is a rest day — three states you can count without reading a number.
    /// The tonnage is trailing in the header, where a supporting figure belongs.
    private var weekPanel: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.s) {
            // Label beside the tally until the tally alone is a line wide. At
            // AX5 an `HStack` broke "THIS WEEK" and "12,510 kg" across four
            // lines between them.
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.s) {
                    Text("This week").onyxMicro()
                    Spacer(minLength: OnyxSpace.s)
                    tally
                }
                VStack(alignment: .leading, spacing: OnyxSpace.xs) {
                    Text("This week").onyxMicro()
                    tally
                }
            }
            HStack(spacing: OnyxSpace.xs) {
                ForEach(week?.snapshot.cells ?? []) { cell in
                    dayCell(cell)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .padding(OnyxSpace.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onyxGlass(.tile)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("This week")
    }

    @ViewBuilder
    private var tally: some View {
        if let snapshot = week?.snapshot, week?.loaded == true {
            HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.xs) {
                Text("\(snapshot.sessionsLogged)/\(snapshot.sessionTarget)")
                    .onyxType(.caption).onyxNumeral()
                    .foregroundStyle(Color.onyx.textPrimary)
                Text("· \(OnyxFormat.volume(snapshot.weekTonnageKg)) kg")
                    .onyxType(.caption).onyxNumeral()
                    .foregroundStyle(Color.onyx.textSecondary)
            }
            .lineLimit(1)
        }
    }

    @ViewBuilder
    private func dayCell(_ cell: WorkoutWeek.DayCell) -> some View {
        let mark = dayMark(cell)
        if let id = cell.sessionId {
            NavigationLink { SessionDetailView(sessionId: id) } label: { mark }
                .buttonStyle(.plain)
                .onyxPress()
        } else {
            mark
        }
    }

    private func dayMark(_ cell: WorkoutWeek.DayCell) -> some View {
        let tint = Color.onyx.day(cell.dayKey)
        return VStack(spacing: OnyxSpace.xs) {
            Text(cell.initial)
                .onyxType(.micro)
                .textCase(.uppercase)
                // Today's letter is the one thing in the row that is not
                // tertiary, so the eye lands on it before it counts anything.
                .foregroundStyle(cell.isToday ? Color.onyx.textPrimary : Color.onyx.textTertiary)
            ZStack {
                if cell.isToday {
                    Circle().strokeBorder(Color.onyx.hairline, lineWidth: 1).frame(width: 32, height: 32)
                }
                if cell.isRest {
                    Circle().fill(Color.onyx.textTertiary).frame(width: 6, height: 6)
                } else if cell.isLogged {
                    Circle().fill(tint).frame(width: 22, height: 22)
                } else {
                    Circle().strokeBorder(tint.opacity(cell.isFuture ? 0.55 : 0.9), lineWidth: 2)
                        .frame(width: 22, height: 22)
                }
            }
            .frame(height: 32)
            // A bout draws under the day rather than beside it: cardio is a
            // second thing that happened on the date, not a second kind of day.
            Circle()
                .fill(cell.hasCardio ? OnyxDomain.body.accent : .clear)
                .frame(width: 4, height: 4)
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: 36)
        .contentShape(.rect)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(cellLabel(cell))
    }

    private func cellLabel(_ cell: WorkoutWeek.DayCell) -> String {
        let day = LogicalDay.date(fromISO: cell.date)?.formatted(.dateTime.weekday(.wide).day().month()) ?? cell.date
        let state = cell.isRest ? "rest" : cell.isLogged ? "logged, \(cell.label ?? "session")" : "planned, \(cell.label ?? "session")"
        return "\(day), \(state)\(cell.hasCardio ? ", cardio" : "")"
    }

    // MARK: - Today's session

    @ViewBuilder
    private func sessionCard(_ day: ProgramDay) -> some View {
        if case let .done(id, sets, volumeKg, minutes, prCount) = state {
            // ── LOGGED: THE TILE COLLAPSES ──────────────────────────────────
            // A finished day does not need its prescription read back to it.
            // What it needs is the four numbers it produced and a way into the
            // page that explains them.
            NavigationLink { SessionDetailView(sessionId: id) } label: {
                VStack(alignment: .leading, spacing: OnyxSpace.xs) {
                    HStack(spacing: OnyxSpace.s) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Color.onyx.good)
                        Text(day.label)
                            .onyxDisplay()
                            .foregroundStyle(Color.onyx.dayLabel(day.key))
                        Spacer(minLength: OnyxSpace.s)
                        Image(systemName: "chevron.right")
                            .onyxType(.caption)
                            .foregroundStyle(Color.onyx.textTertiary)
                    }
                    Text(doneSummary(sets: sets, volumeKg: volumeKg, minutes: minutes, prCount: prCount))
                        .onyxType(.secondary).onyxNumeral()
                        .foregroundStyle(Color.onyx.textSecondary)
                }
                .padding(OnyxSpace.m)
                .frame(maxWidth: .infinity, alignment: .leading)
                .onyxGlass(.tile)
            }
            .buttonStyle(.plain)
            .onyxPress(scale: 0.98)
            .accessibilityHint("Opens the session summary")
        } else {
            planCard(day)
        }
    }

    private func planCard(_ day: ProgramDay) -> some View {
        let exercises = day.exercises(for: phase)
        return VStack(alignment: .leading, spacing: OnyxSpace.m) {
            HStack(alignment: .top, spacing: OnyxSpace.m) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(day.label)
                        .onyxDisplay()
                        .foregroundStyle(Color.onyx.dayLabel(day.key))
                    Text("\(exercises.count) exercises · \(day.plannedSets(for: phase)) sets")
                        .onyxType(.caption).onyxNumeral()
                        .foregroundStyle(Color.onyx.textSecondary)
                }
                Spacer(minLength: OnyxSpace.s)
                // 44 pt, not 88: the figure on this card says WHERE, and where
                // is legible at a thumbnail. The 96 pt hit-tested one lives on
                // the session page, which is the screen about the landing.
                AtlasFigure(side: .front, worked: worked(day), monochromeTint: accent)
                    .frame(height: 44)
                    .accessibilityHidden(true)
            }

            VStack(spacing: 2) {
                ForEach(exercises) { exercise in
                    HStack(spacing: OnyxSpace.s) {
                        Text(exercise.name)
                            .onyxType(.secondary)
                            .lineLimit(1)
                        Spacer(minLength: OnyxSpace.s)
                        Text("\(exercise.sets(for: phase)) × \(exercise.reps)")
                            .onyxType(.secondary).onyxNumeral()
                            .foregroundStyle(Color.onyx.textSecondary)
                    }
                    .frame(minHeight: 36)
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .padding(OnyxSpace.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onyxGlass(.tile)
        .foregroundStyle(Color.onyx.textPrimary)
        .contextMenu { dayMenu }
    }

    /// Long-press the card: the three things you can do to a DAY, as against
    /// the one thing the footer does (start the session). A `contextMenu`
    /// rather than three buttons on the tile — these are rare, and a tile that
    /// carries its rare actions on its face is the tile §5.2 shrank.
    @ViewBuilder
    private var dayMenu: some View {
        Button("Change phase", systemImage: "arrow.triangle.2.circlepath") { showPhase = true }
        Button("Take a rest day…", systemImage: "moon.zzz") { swapping = true }
        Button("Swap this day…", systemImage: "arrow.triangle.swap") { swapping = true }
    }

    private func doneSummary(sets: Int, volumeKg: Double, minutes: Double?, prCount: Int) -> String {
        var parts = ["\(OnyxFormat.volume(volumeKg)) kg", "\(sets) sets"]
        if prCount > 0 { parts.append("\(prCount) PR") }
        if let minutes, minutes > 0 { parts.append("\(jsIntegerString(jsRound(minutes))) min") }
        return parts.joined(separator: " · ")
    }

    private var restCard: some View {
        VStack(spacing: OnyxSpace.s) {
            Image(systemName: "figure.walk")
                .onyxType(.hero)
                .imageScale(.large)
                .foregroundStyle(accent)
            Text("Zone-2 rest")
                .onyxDisplay()
            Text("Nothing is scheduled today. A walk, and back tomorrow.")
                .onyxType(.secondary)
                .foregroundStyle(Color.onyx.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(OnyxSpace.xl)
        .onyxGlass(.tile)
        .foregroundStyle(Color.onyx.textPrimary)
        // A rest day is exactly the day you want to PLACE a session on, so it
        // carries the same menu rather than being the one card you cannot act
        // on.
        .contextMenu {
            Button("Place a workout here…", systemImage: "arrow.triangle.swap") { swapping = true }
        }
    }

    /// Landmark → 0…1 for the day's prescription, so the figure shows where the
    /// session will land before a set is logged.
    private func worked(_ day: ProgramDay) -> [LandmarkMuscle: Double] {
        MuscleCredit.worked(from: MuscleCredit.weightedSets(
            day.exercises(for: phase).map { .init(physicalSets: $0.sets(for: phase), movers: $0.movers) }
        ))
    }

    // MARK: - Ready to progress

    /// Double progression, stated as an instruction.
    ///
    /// ── WHY IT IS ABSENT MOST DAYS, AND THAT IS THE POINT ───────────────────
    /// The rule is the program's own: every working set at the ceiling, at ONE
    /// load, at RPE ≤ 8.5, in TWO consecutive sessions. That fires rarely — which
    /// is what makes the box worth reading when it appears. A panel that is
    /// always there, always saying "keep going", is a panel nobody looks at.
    @ViewBuilder
    private var progressionCard: some View {
        let rows = week?.snapshot.progression ?? []
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: OnyxSpace.s) {
                Text("Ready to progress").onyxMicro()
                VStack(spacing: 0) {
                    ForEach(rows) { row in
                        HStack(spacing: OnyxSpace.s) {
                            Text(row.name)
                                .onyxType(.body)
                                .lineLimit(1)
                                .foregroundStyle(Color.onyx.textPrimary)
                            Spacer(minLength: OnyxSpace.s)
                            Text(row.detail)
                                .onyxType(.secondary).onyxNumeral()
                                // Green is the verdict "go"; gold is "nearly",
                                // which is the record colour doing the one other
                                // job it is allowed — pointing at a threshold.
                                .foregroundStyle(row.ready ? Color.onyx.good : Color.onyx.record)
                        }
                        .frame(minHeight: 44)
                        .accessibilityElement(children: .combine)
                        if row.id != rows.last?.id {
                            Divider().overlay(Color.onyx.hairline)
                        }
                    }
                }
            }
            .padding(OnyxSpace.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .onyxGlass(.tile)
        }
    }

    // MARK: - Cardio

    /// One row, because cardio is one fact on a training day.
    ///
    /// It moved here from the Pulse tab (§5.7 deletes it there): a bout is
    /// training, and it belongs beside the session it was done around rather
    /// than beside your sleep.
    private var cardioRow: some View {
        HStack(spacing: OnyxSpace.m) {
            Image(systemName: cardioSymbol)
                .foregroundStyle(OnyxDomain.body.accent)
                .frame(width: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text("Cardio")
                    .onyxType(.body)
                    .foregroundStyle(Color.onyx.textPrimary)
                Text(cardioDetail)
                    .onyxType(.caption).onyxNumeral()
                    .foregroundStyle(Color.onyx.textSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: OnyxSpace.s)
            Button { loggingCardio = true } label: {
                Image(systemName: "plus")
                    .onyxType(.body).fontWeight(.semibold)
                    .foregroundStyle(OnyxDomain.body.accent)
                    .frame(width: 44, height: 44)
                    .contentShape(.rect)
            }
            .onyxPress()
            .accessibilityLabel("Log cardio")
        }
        .padding(.leading, OnyxSpace.m)
        .frame(minHeight: 44)
        .onyxGlass(.tile)
        .accessibilityElement(children: .contain)
    }

    private var cardioSymbol: String {
        CardioKind(week?.snapshot.lastCardio?.kind ?? "walk").symbol
    }

    private var cardioDetail: String {
        guard let bout = week?.snapshot.lastCardio else { return "No bouts logged" }
        var parts: [String] = [CardioKind(bout.kind).label]
        if let m = bout.distanceM { parts.append("\(jsToFixed1(m / 1000)) km") }
        if let min = bout.durationMin { parts.append("\(jsIntegerString(jsRound(min))) min") }
        if let pace = CardioMetrics.paceMinPerKm(distanceM: bout.distanceM, durationMin: bout.durationMin) {
            parts.append(CardioMetrics.formatPace(pace))
        }
        if bout.date != week?.today, let date = LogicalDay.date(fromISO: bout.date) {
            parts.append(OnyxChart.shortDate(date))
        }
        return parts.joined(separator: " · ")
    }

    // MARK: - The door

    @ViewBuilder
    private var footer: some View {
        if today != nil {
            Group {
                switch state {
                case .done:
                    // The card above already links to the summary; a second CTA
                    // for the same destination is a box repeating the box above.
                    doneStrip
                case let .live(sets, volumeKg):
                    startButton(title: "Resume workout", detail: liveSummary(sets: sets, volumeKg: volumeKg), icon: "play.fill")
                case .none:
                    startButton(title: "Start workout", detail: nil, icon: "figure.strengthtraining.traditional")
                }
            }
            .padding(.horizontal, OnyxSpace.l)
            .padding(.vertical, OnyxSpace.s)
            .frame(maxWidth: .infinity)
            .background(alignment: .top) {
                Rectangle().fill(.regularMaterial).ignoresSafeArea()
            }
            .overlay(alignment: .top) {
                Color.onyx.hairline.frame(height: 0.5)
            }
        }
    }

    private var doneStrip: some View {
        HStack(spacing: OnyxSpace.s) {
            Image(systemName: "checkmark.seal.fill")
                .foregroundStyle(Color.onyx.good)
            Text("Session complete")
                .onyxType(.body)
                .foregroundStyle(Color.onyx.textPrimary)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, minHeight: 44)
        .accessibilityElement(children: .combine)
    }

    private func startButton(title: String, detail: String?, icon: String) -> some View {
        Button(action: start) {
            HStack(spacing: OnyxSpace.m) {
                Image(systemName: icon)
                    .onyxType(.display)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .onyxType(.body).fontWeight(.semibold)
                        .minimumScaleFactor(0.8)
                    if let detail {
                        Text(detail)
                            .onyxType(.caption).onyxNumeral()
                            .opacity(0.85)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .onyxType(.caption).fontWeight(.bold)
                    .opacity(0.7)
            }
            .foregroundStyle(Color.onyx.textPrimary)
            .padding(.horizontal, OnyxSpace.l)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(
                OnyxDomain.train.ramp,
                in: RoundedRectangle(cornerRadius: OnyxCorner.tile, style: .continuous)
            )
        }
        .onyxPress(scale: 0.98)
        .accessibilityHint("Opens the logger and starts the Live Activity")
    }

    private func liveSummary(sets: Int, volumeKg: Double) -> String {
        "\(sets) sets · \(OnyxFormat.volume(volumeKg)) kg"
    }

    // MARK: - Actions

    private func start() {
        guard let day = today else { return }
        if session == nil || session?.day.key != day.key {
            // A card carries its workout's name in `attributes`, which is fixed
            // for the life of the activity — so a new session feeding the old
            // activity would update a Lock Screen that still says yesterday.
            if session != nil { activity.end() }
            session = LoggerModel(
                day: day, phase: phase,
                store: environment.database, userId: environment.userIdString
            )
        }
        presented = session
    }

    /// Re-read on every dismissal. Finishing a session changes the week panel,
    /// the card, the progression box and the Library's stats at once, and they
    /// all come from the same read — so there is one place that can be stale
    /// and one call that fixes it.
    private func reload() {
        let wasDone = isDone
        Task {
            await week?.refresh()
            // The workout ENDED during this cover. Close the kept model, play
            // the one `.success` §3.4 gives a finished session, and put the
            // summary on screen — the page is built synchronously from GRDB, so
            // it is complete the moment it appears.
            if !wasDone, case let .done(id, _, _, _, _) = state {
                session = nil
                finishes += 1
                summary = id
            }
        }
    }

    private var isDone: Bool {
        if case .done = state { return true }
        return false
    }
}

#if DEBUG
#Preview("Workout") {
    NavigationStack {
        WorkoutTabView(seededDay: Program.onyx5.day(key: "cb_b"))
    }
    .environment(AppEnvironment.preview)
    .preferredColorScheme(.dark)
}
#endif
