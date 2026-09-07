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
    /// The session's elapsed clock, kept beside `session` and for the same
    /// reason: leaving the logger mid-workout tears the cover down, and a clock
    /// that lived in `LiveLoggerView`'s own `@State` went with it. Start at
    /// 10:00, pause at 10:30, leave, come back at 11:30 and the hero read
    /// 1:30:00 — the hour of pause gone, from the number this whole wave exists
    /// to make true. Wave E4 folds it into `LoggerModel`, which is kept here
    /// already, and this property goes with the stand-in.
    @State private var sessionClock: LoggerClock?
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

    @Environment(\.dynamicTypeSize) private var typeSize

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
                doorsRow
                cardioCard
                progressionCard
            }
            .padding(.horizontal, OnyxSpace.l)
            .padding(.top, OnyxSpace.s)
            .padding(.bottom, OnyxSpace.xl)
        }
        .onyxScreen(.train)
        .navigationTitle("Workout")
        .navigationBarTitleDisplayMode(.inline)
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
                LiveLoggerView(model: model, activity: activity, clock: sessionClock)
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

    // MARK: - The doors

    /// Library · History · Trends, as three cells with a number on each.
    ///
    /// ── WHY THEY LEFT THE NAVIGATION BAR ────────────────────────────────────
    /// They were three glyphs in the top-right corner: a book, a clock and a
    /// chart, 24 pt each, side by side, with no labels and nothing to say. Three
    /// unlabelled icons in a row is the pattern iOS uses for ACTIONS on the
    /// thing you are looking at — and these are not actions, they are three
    /// other screens. They also left "Workout" no room for its own title.
    ///
    /// As cells they can carry the one number that makes a door worth opening:
    /// how much is behind it. A door with a number on it is a door you decide
    /// about; a chart glyph is one you tap to find out.
    private var doorsRow: some View {
        Group {
            if typeSize.isAccessibilitySize {
                VStack(spacing: OnyxSpace.grid) { doors }
            } else {
                HStack(spacing: OnyxSpace.grid) { doors }
            }
        }
    }

    @ViewBuilder
    private var doors: some View {
        door("Library", systemImage: "books.vertical", value: liftsTracked, unit: "lifts") {
            ExerciseLibraryView()
        }
        door("History", systemImage: "clock", value: sessionsThisMonth, unit: "this month") {
            HistoryView()
        }
        door("Trends", systemImage: "chart.xyaxis.line", value: weekDelta, unit: "vs last week") {
            TrainingTrendsView()
        }
    }

    private func door<Destination: View>(
        _ title: String, systemImage: String, value: String, unit: String,
        @ViewBuilder destination: @escaping () -> Destination
    ) -> some View {
        NavigationLink(destination: destination) {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: OnyxSpace.xs) {
                    Image(systemName: systemImage)
                        .onyxType(.caption)
                        .foregroundStyle(accent)
                        .accessibilityHidden(true)
                    Text(title)
                        .onyxType(.micro)
                        .foregroundStyle(Color.onyx.textSecondary)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                Text(value)
                    .onyxType(.display).onyxNumeral()
                    .foregroundStyle(Color.onyx.textPrimary)
                    .lineLimit(1).minimumScaleFactor(0.6)
                Text(unit)
                    .onyxType(.micro)
                    .foregroundStyle(Color.onyx.textTertiary)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            // 64 pt of CELL (§W9), which three lines of 11/20/11 fill exactly
            // at `s` padding. `m` made it 83 and the row stopped reading as a
            // strip of doors.
            .frame(minHeight: 64)
            .padding(OnyxSpace.s)
            .onyxGlass(.tile)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .onyxPress(scale: 0.98)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(value) \(unit)")
        .accessibilityAddTraits(.isButton)
    }

    private var liftsTracked: String {
        week.map { "\($0.snapshot.liftsTracked)" } ?? "—"
    }

    private var sessionsThisMonth: String {
        week.map { "\($0.snapshot.sessionsThisMonth)" } ?? "—"
    }

    /// Tonnes, signed. A delta with no sign is a number you have to look up the
    /// other week to read.
    private var weekDelta: String {
        guard let delta = week?.snapshot.weekDeltaKg else { return "—" }
        let tonnes = delta / 1000
        let sign = tonnes > 0 ? "+" : tonnes < 0 ? "−" : ""
        return "\(sign)\(jsToFixed1(abs(tonnes))) t"
    }

    // MARK: - Cardio

    /// The last bout in full, the eight before it as a trail, and the week's
    /// Zone 2 under both.
    ///
    /// ── WHY IT GREW ─────────────────────────────────────────────────────────
    /// It was one 44 pt row: a glyph, the word "Cardio", and a line of
    /// `type · km · min · pace` truncated to whatever fitted. Everything that
    /// makes a bout worth reading — when it was, how hard it was, whether the
    /// week's Zone 2 is on track — was either missing or squeezed out by
    /// `lineLimit(1)`. Cardio is the second half of this tab's subject and it
    /// was the smallest thing on the screen.
    ///
    /// The Zone 2 rail lives INSIDE the card rather than beside it because it
    /// is a fact about the bouts above it; a separate tile would have been a
    /// box repeating the box above (§3.6).
    private var cardioCard: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.s) {
            HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.s) {
                OnyxSectionHeader("Cardio", .body)
                Spacer(minLength: 0)
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
            // The button's own 44 pt box already carries the row's height, so
            // the header does not ask for any of its own.
            .padding(.trailing, -OnyxSpace.m)

            if let bout = week?.snapshot.lastCardio {
                lastBout(bout)
                if trail.count >= 2 {
                    Sparkline(points: trail, color: OnyxDomain.body.accent)
                        .frame(height: 22)
                        .accessibilityHidden(true)
                    Text("last \(trail.count) bouts · minutes")
                        .onyxType(.micro)
                        .foregroundStyle(Color.onyx.textTertiary)
                }
            } else {
                Text("No bouts logged yet.")
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textSecondary)
            }

            Divider().overlay(Color.onyx.hairline)
            zone2Row
        }
        .padding(OnyxSpace.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onyxGlass(.tile)
        .accessibilityElement(children: .contain)
    }

    /// Date · type on one line, then the numbers that describe the effort.
    private func lastBout(_ bout: CardioLogRow) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: OnyxSpace.xs) {
                Image(systemName: CardioKind(bout.kind).symbol)
                    .onyxType(.caption)
                    .foregroundStyle(OnyxDomain.body.accent)
                    .accessibilityHidden(true)
                Text(CardioKind(bout.kind).label)
                    .onyxType(.body)
                    .foregroundStyle(Color.onyx.textPrimary)
                Spacer(minLength: OnyxSpace.s)
                Text(boutWhen(bout))
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textTertiary)
            }
            HStack(spacing: OnyxSpace.m) {
                ForEach(boutFigures(bout), id: \.0) { label, value in
                    VStack(alignment: .leading, spacing: 0) {
                        Text(value)
                            .onyxType(.secondary).onyxNumeral()
                            .foregroundStyle(Color.onyx.textPrimary)
                            .lineLimit(1).minimumScaleFactor(0.7)
                        Text(label)
                            .onyxType(.micro)
                            .foregroundStyle(Color.onyx.textTertiary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Last bout")
        .accessibilityValue(
            ([CardioKind(bout.kind).label, boutWhen(bout)] + boutFigures(bout).map { "\($0.1) \($0.0)" })
                .joined(separator: ", ")
        )
    }

    /// Every figure a logged bout can carry, and only the ones it does. A
    /// reserved slot drawn as an em dash says "we measured nothing"; an absent
    /// one says the bout never had it.
    private func boutFigures(_ bout: CardioLogRow) -> [(String, String)] {
        var out: [(String, String)] = []
        if let m = bout.distanceM, m > 0 { out.append(("km", jsToFixed1(m / 1000))) }
        if let min = bout.durationMin, min > 0 { out.append(("min", jsIntegerString(jsRound(min)))) }
        if let pace = CardioMetrics.paceMinPerKm(distanceM: bout.distanceM, durationMin: bout.durationMin) {
            // `formatPace` returns "8:20 /km" — the label under it names the
            // measure, not the unit, or the row reads "8:20 /km · /km".
            out.append(("pace", CardioMetrics.formatPace(pace)))
        }
        // A heart rate is a whole number: the column is a Double and printed
        // "131.0", which reads as a precision the sensor does not have.
        if let hr = bout.avgHr, hr > 0 { out.append(("avg bpm", jsIntegerString(jsRound(hr)))) }
        return out
    }

    private func boutWhen(_ bout: CardioLogRow) -> String {
        if bout.date == week?.today { return "Today" }
        guard let date = LogicalDay.date(fromISO: bout.date) else { return bout.date }
        return OnyxChart.shortDate(date)
    }

    /// The eight most recent bouts, in minutes. Minutes rather than distance
    /// because Zone 2 — the rail directly under this — is a rule about
    /// duration, and a walk with no distance still counts towards it.
    private var trail: [Double] {
        (week?.snapshot.recentCardio ?? []).compactMap { $0.durationMin }.filter { $0 > 0 }
    }

    /// 36 pt: a label, a count and a rail. Zone 2 is a COUNT of sessions over
    /// the minute floor, never a minute total — `Zone2` says so and the widget
    /// face already draws it that way.
    private var zone2Row: some View {
        let done = week?.snapshot.zone2Done ?? 0
        let target = Zone2.weeklyTarget
        return HStack(spacing: OnyxSpace.s) {
            Text("Zone 2")
                .onyxType(.caption)
                .foregroundStyle(Color.onyx.textSecondary)
            Capsule()
                .fill(Color.onyx.hairline)
                .frame(height: 3)
                .overlay(alignment: .leading) {
                    GeometryReader { geometry in
                        Capsule()
                            .fill(OnyxDomain.body.accent)
                            .frame(
                                width: geometry.size.width * min(Double(done) / Double(max(target, 1)), 1),
                                height: 3
                            )
                    }
                    .frame(height: 3)
                }
            Text("\(done)/\(target)")
                .onyxType(.caption).onyxNumeral()
                .foregroundStyle(done >= target ? Color.onyx.good : Color.onyx.textSecondary)
        }
        .frame(height: 36)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Zone 2 this week")
        .accessibilityValue("\(done) of \(target) sessions")
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
            let model = LoggerModel(
                day: day, phase: phase,
                store: environment.database, userId: environment.userIdString
            )
            session = model
            sessionClock = LoggerClock(startedAt: model.startedAt)
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
                sessionClock = nil
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
