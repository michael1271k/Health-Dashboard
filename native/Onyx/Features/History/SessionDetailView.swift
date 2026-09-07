import SwiftUI
import Charts
import OnyxUI
import OnyxCore
import OnyxData

/// The post-workout page: what one session was, and what it means.
///
/// ── NOT THE WEB REPORT, AND NO LONGER A BARE LEDGER ─────────────────────────
/// `session/[id]/page.tsx` is three bordered bands with a six-cell metric table.
/// Wave 7's native answer was the opposite mistake: a `List` that opened
/// straight into set rows, so the screen you land on after finishing a workout
/// began with "Set 1, 42 kg × 10" and you had to scroll to learn anything.
///
/// §5.4 gives it a shape that answers questions in the order they are asked:
///
///   1. WHICH session — a title band washed in the split's own colour, with the
///      plan, the phase week and the lever resolved FOR THAT DATE.
///   2. WHAT it produced — seven figures, each with a reserved line under it for
///      the change against the previous session of the same split.
///   3. WHETHER it was progress — the split's tonnage as a line, this session's
///      point selected, records marked in gold.
///   4. WHERE it landed — the body, hit-testable, with weighted set counts.
///   5. THE LEDGER — every set, grouped by movement, with the previous session's
///      set beside each and a 40×16 trail of estimated 1RM in the header.
///
/// Records are DETECTED here, not read: `personal_records` is a current-best
/// table, so an old session's trophies would vanish the day they were beaten.
/// `SessionAnalysis` replays the engine against the sets that came before,
/// which is the same question the save path asked on the day.
struct SessionDetailView: View {
    let sessionId: String
    /// Screenshot harness only: open parked on the ledger. Half of this page is
    /// the ledger and a shot of the first screen reviews only the half that
    /// fits, so the shot loop takes two pictures of one screen.
    var startAtLedger = false
    /// Screenshot harness only: open with the atlas sheet already presented. A
    /// shot script can launch a screen and cannot tap a tile.
    var startAtAtlas = false
    /// Screenshot harness only: open straight into the edit deck (§U4.5), for
    /// the same reason — the button that opens it is in a toolbar.
    var startAtEditor = false

    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dynamicTypeSize) private var typeSize

    @State private var page: SessionAnalysis.Page?
    @State private var missing = false
    /// Which cascade this page's numbers were read after — see
    /// `AppEnvironment.rescoreGeneration`. `-1` so the first `.task` always runs.
    @State private var loadedAt = -1
    @State private var showAtlas = false
    /// The session being edited, presented as a full-screen logger deck.
    @State private var editing: LoggerModel?

    private var report: SessionAnalysis.Report? { page?.report }
    private var split: Color { Color.onyx.day(report?.session.dayKey) }

    var body: some View {
        ScrollViewReader { proxy in
            list(scroller: proxy)
        }
    }

    private func list(scroller: ScrollViewProxy) -> some View {
        List {
            if let page {
                band(page).plainRow(edgeToEdge: true)
                metrics(page).plainRow(edgeToEdge: true)
                progression(page).plainRow(edgeToEdge: true)
                if !page.report.muscles.isEmpty { muscles(page.report).plainRow(edgeToEdge: true) }
                ForEach(page.report.exercises) { exercise in
                    ledger(exercise)
                }
                if !page.report.cardio.isEmpty { cardio(page.report.cardio) }
            }
        }
        .listRowBackground(Rectangle().fill(.ultraThinMaterial))
        .listSectionSpacing(OnyxSpace.m)
        .scrollContentBackground(.hidden)
        .onyxScreen(.train)
        .tint(OnyxDomain.train.accent)
        .navigationTitle(report.map { SessionRow.date($0.session.date) } ?? "Session")
        .navigationBarTitleDisplayMode(.inline)
        // ── THE BAR NEEDS A MATERIAL NOW THAT THE LEDGER HAS TITLES ─────────
        // A scrolled `List` passes under a transparent bar, which was tolerable
        // when an exercise header was 13 pt uppercase grey and is not now that
        // it is a 20 pt name on a tinted gradient: the first shot had "Incline
        // DB Press" legible THROUGH the bar, crossing the date. The material is
        // the same one every other floating surface in the app uses, so the
        // bar still reads as glass over the mesh rather than as a solid strip.
        .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
        .toolbar { editItem }
        // ── WHY A FULL-SCREEN COVER AND NOT A PUSH ──────────────────────────
        // The same reason `WorkoutTabView` presents the live deck this way: the
        // logger is a mode, not a destination. It owns the whole screen, it has
        // its own two ways out, and a navigation bar over it would offer a
        // third that means something different from both. `item:` rather than
        // `isPresented:` for the reason that file spends a paragraph on — a
        // cover whose content builder reads `if let model` comes up empty when
        // the flag and the model are set in the same runloop turn.
        .fullScreenCover(item: $editing, onDismiss: { editing = nil }) { model in
            NavigationStack {
                LiveLoggerView(model: model)
            }
            .environment(environment)
            .preferredColorScheme(.dark)
        }
        .overlay {
            if missing {
                ContentUnavailableView("Session not found", systemImage: "questionmark.circle")
            } else if page == nil {
                ProgressView()
            }
        }
        // ── WHY THE ATLAS REPLACED `MuscleDistributionSheet` HERE ───────────
        // §U4.4. The flat sheet draws the front and the back as two half-width
        // figures, which is the right answer inside the LOGGER, where it is a
        // glance between sets. On a finished session it is the page's only
        // picture, and half of a leg day is on a body nobody can hit-test at
        // 150 pt. The logger keeps the flat sheet; this one turns over.
        .sheet(isPresented: $showAtlas) {
            if let report {
                AtlasSheet(
                    sets: Dictionary(uniqueKeysWithValues: report.muscles.map { ($0.muscle, $0.sets) }),
                    physicalSets: report.physicalSets,
                    sessionLabel: shareLabel(report)
                )
            }
        }
        // ── WHY THIS IS `id:`-KEYED AND NOT A ONE-SHOT `.task` ──────────────
        // §U4.5 makes this page's own Edit button rewrite the session it is
        // drawing, and §E1's cascade then rewrites every daily score behind it.
        // A `.task` that ran once left the reader looking at the tonnage they
        // had just corrected. `rescoreGeneration` moves ONCE per cascade — when
        // every day the edit touched agrees — so keying on it reloads at the
        // one instant a reload gives a consistent answer. The guard is
        // `HistoryView`'s: a `.task(id:)` re-runs on any re-identification of
        // the view, not only on the id changing.
        .task(id: environment.rescoreGeneration) {
            guard loadedAt != environment.rescoreGeneration else { return }
            let first = loadedAt < 0
            loadedAt = environment.rescoreGeneration
            let database = environment.database, id = sessionId
            page = await Task.detached(priority: .userInitiated) {
                SessionAnalysis.page(database: database, sessionId: id)
            }.value
            missing = page == nil
            #if DEBUG
            // `else if`, and only on the FIRST load: two modals from one source
            // view drops the second with an "already presenting" warning, and
            // this `.task` re-runs on every cascade — so saving from the editor
            // re-presented the editor over the page the shot was meant to take.
            if first, page != nil {
                if startAtAtlas { showAtlas = true }
                else if startAtEditor { openEditor() }
            }
            #endif
            // `defaultScrollAnchor` is decided at first layout, when the list
            // is still empty — so the harness's ledger shot has to scroll after
            // the page lands.
            if startAtLedger, let first = page?.report.exercises.first {
                try? await Task.sleep(for: .milliseconds(400))
                scroller.scrollTo(first.id, anchor: .top)
            }
        }
    }

    // MARK: - Editing

    /// Re-open this session on the logger's own deck (§U4.5).
    ///
    /// ── WHY THE DECK AND NOT A FORM ─────────────────────────────────────────
    /// Correcting a set is the same act as logging one: the same rep window,
    /// the same steppers, the same options sheet, the same effort ladder, and
    /// the same live record detection that says whether the corrected number
    /// still stands. A second editor would be a second opinion about all of it
    /// — and would be the surface that gets left behind the next time the set
    /// row changes.
    @ToolbarContentBuilder
    private var editItem: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                openEditor()
            } label: {
                Label("Edit session", systemImage: "square.and.pencil")
            }
            .disabled(!canEdit)
            .accessibilityHint(canEdit
                ? "Opens this workout on the logger, where its sets can be corrected."
                : "This session cannot be edited on the phone yet.")
        }
    }

    /// The program day this session was, PLUS whatever it actually contains.
    ///
    /// A session with no `day_key`, or one whose key the program no longer has,
    /// has no deck to fold onto — its sets would come up on a blank screen. The
    /// button is disabled rather than absent, because a control that vanishes on
    /// some sessions is a control nobody learns is there.
    ///
    /// ── WHY THE DECK IS EXTENDED AND NOT JUST LOOKED UP ─────────────────────
    /// The deck is the PROGRAM's list of movements and a session is what was
    /// actually done. Those disagree whenever a machine was taken, a lift was
    /// swapped, or the workout was logged on the web (whose picker is the whole
    /// 60-row catalogue, not the day's six). `restoreLoggedSets` folds a
    /// session's rows onto the deck by name, so a movement the deck does not
    /// carry simply does not appear — the rows are safe, and they are
    /// invisible, which on an EDIT screen means uncorrectable and looks like
    /// the editor lost half the workout.
    ///
    /// So every movement in the report that the day does not already name is
    /// appended as a one-off prescription: its own working-set count, its top
    /// load as the seed, and its rep window when `Ceilings` has one. `movers`
    /// resolves from `MuscleMap` by name in `ProgramExercise.init`, so the card
    /// still gets its muscle bar and the session still gets its muscle credit.
    private func editorDay(_ report: SessionAnalysis.Report) -> ProgramDay? {
        guard let key = report.session.dayKey, var day = Program.onyx5.day(key: key) else { return nil }
        func normalised(_ name: String) -> String {
            ExerciseAliases.canonicalName(name).lowercased()
        }
        let planned = Dictionary(
            day.exercises.map { (normalised($0.name), $0) }, uniquingKeysWith: { first, _ in first }
        )

        // ── PERFORMED ORDER FIRST, THE REST OF THE PLAN AFTER ───────────────
        // The deck opens on `currentSet` — the first movement with an unticked
        // row — and on an edit that is whichever PROGRAMMED lift the session
        // skipped. So a person who tapped Edit to fix set 3 of the incline
        // press landed on a blank chest-press card and had to scroll past every
        // lift they did not do. A session's own order is the order it happened
        // in, which is the order its reader remembers it in.
        var ordered: [ProgramExercise] = []
        for exercise in report.exercises {
            if let existing = planned[normalised(exercise.canonical)] {
                ordered.append(existing)
                continue
            }
            let sets = max(1, Int(exercise.detail.workingSets))
            ordered.append(ProgramExercise(
                exercise.canonical,
                sets: sets,
                // Never nil and never 0: `cutSets == 0` drops the lift from the
                // deck on a cut, which is exactly the disappearance this whole
                // function exists to prevent.
                cutSets: sets,
                wk1Kg: exercise.stats.topKg > 0 ? exercise.stats.topKg : nil,
                // Already the programmed string when the ceilings table knows
                // this lift, and "" when it does not — `repWindow` reads "" as
                // no prescription, which is the truth about an off-plan lift.
                reps: exercise.window ?? "",
                restSec: 90
            ))
        }
        let covered = Set(ordered.map { normalised($0.name) })
        ordered += day.exercises.filter { !covered.contains(normalised($0.name)) }
        day.exercises = ordered
        return day
    }

    /// Whether the button is live.
    ///
    /// ── AND WHY A UNILATERAL SESSION IS NOT EDITABLE YET ────────────────────
    /// The logger has no split concept: `LoggerModel.SetRow` carries no `side`
    /// and no `pairId`, and `snapshot` writes neither. So a session holding L/R
    /// pairs restores as two independent rows — the deck's own tonnage comes out
    /// nearly double (`SessionVolume.sessionVolumeKg` collapses a pair to its
    /// weaker side and the deck does not), amending one side rewrites its
    /// `set_index` to its deck position and splits a pair that shared one set
    /// number, and deleting one side leaves an orphan with a dangling `pair_id`
    /// that every later reader scores as a lone side.
    ///
    /// Refusing is the honest answer while that is true. The summary page still
    /// reads correctly — `SessionDetail.toRows` folds pairs properly — so what
    /// is withheld is the correction, not the record.
    ///
    /// ponytail: a whole-session gate, because one bad row poisons the
    /// aggregates for the whole session. Per-exercise once `SetRow` carries a
    /// side.
    private var canEdit: Bool {
        guard let report, editorDay(report) != nil else { return false }
        return !report.exercises.contains { $0.rows.contains { $0.row.kind == "pair" } }
    }

    /// The phase this session was logged IN, not the one selected today.
    ///
    /// It decides which exercises the deck carries, and a cut deck opened on a
    /// bulk session simply would not contain the wrist curl the session holds —
    /// the rows are safe (nothing deletes what it cannot see) but they would be
    /// invisible and therefore uncorrectable. `PhaseKind` has four cases and
    /// `ProgramPhase` two: a peak and a deload are both run on the cut deck,
    /// which is what those weeks are.
    private var editorPhase: ProgramPhase {
        page?.week?.kind == .bulk ? .bulk : .cut
    }

    private func openEditor() {
        guard canEdit, let report, let day = editorDay(report) else { return }
        let session = report.session
        let model = LoggerModel(
            day: day,
            phase: editorPhase,
            store: environment.database,
            userId: environment.userIdString,
            startedAt: session.startedAt ?? Date()
        )
        model.attach(editing: session)
        // A failed attach leaves no session on the model, and a deck with no
        // session would silently open a NEW one dated today on the first tick.
        // `ensureSession` refuses that, so the worst case is a deck that logs
        // nothing — but putting it on screen at all would be a lie.
        guard model.sessionId != nil else { return }
        editing = model
    }

    // MARK: - 1 · The title band

    /// The split's own colour, bled behind the title and gone by the time the
    /// tags start.
    ///
    /// ── WHY A WASH AND NOT A COLOURED CARD ──────────────────────────────────
    /// A tinted panel makes the glass under it read as a different material and
    /// puts a hard edge across the top of the screen — the "gradient header"
    /// look the whole mandate exists to avoid. A 30 %→0 wash behind transparent
    /// content says the same thing (this is a leg day) and leaves the surface
    /// alone. The title carries the same hue at full strength, which is where
    /// the colour is actually legible.
    private func band(_ page: SessionAnalysis.Page) -> some View {
        let session = page.report.session
        return VStack(alignment: .leading, spacing: OnyxSpace.s) {
            Text(SessionAnalysis.dayLabel(session.dayKey) ?? "Session")
                .onyxType(.hero)
                .foregroundStyle(Color.onyx.dayLabel(session.dayKey))
            Text(meta(page))
                .onyxType(.caption).onyxNumeral()
                .foregroundStyle(Color.onyx.textSecondary)
            tags(page)
        }
        .padding(OnyxSpace.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(alignment: .top) {
            LinearGradient(
                colors: [split.opacity(0.22), .clear],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: 72)
        }
        .onyxGlass(.tile)
        .accessibilityElement(children: .contain)
    }

    private func meta(_ page: SessionAnalysis.Page) -> String {
        let session = page.report.session
        var parts: [String] = []
        // The CAREER number, not the split's — see `Page.careerIndex`. A
        // session that recorded nothing carries no number rather than a zero.
        if let n = page.careerIndex {
            parts.append("#\(n)")
        }
        if let date = LogicalDay.date(fromISO: session.date) {
            parts.append(date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)))
        }
        if let started = session.startedAt {
            parts.append(started.formatted(date: .omitted, time: .shortened))
        }
        return parts.joined(separator: " · ")
    }

    /// Plan · phase week · lever, each resolved for the session's OWN date.
    private func tags(_ page: SessionAnalysis.Page) -> some View {
        // Wrapping, not an `HStack`: at AX5 three capsules on one line become
        // three vertical blobs one letter wide.
        FlowRow(spacing: OnyxSpace.xs) {
            tag(page.planLabel, .train)
            if let week = page.week {
                // `.short` is already "Cut W7" — the number is in it.
                tag(week.short, .fuel)
            }
            if page.maintenance {
                tag("Maintenance", .recover)
            } else if let lever = page.lever {
                tag(lever.label, .fuel)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func tag(_ text: String, _ domain: OnyxDomain) -> some View {
        Text(text)
            .onyxType(.micro)
            .foregroundStyle(domain.accent)
            .padding(.horizontal, OnyxSpace.s)
            .padding(.vertical, 3)
            .background(domain.accent.opacity(0.16), in: .capsule)
    }

    // MARK: - 2 · The metric grid

    /// Seven figures in two rows, each with a reserved line under it.
    ///
    /// ── WHY THE SECOND LINE IS ALWAYS THERE ─────────────────────────────────
    /// §3.6: "every number has a unit and a reserved delta line". A delta that
    /// appears only when there is one to show makes the whole grid change height
    /// between two sessions, and a cell that is silent about its comparison is
    /// indistinguishable from one that has none. So the line is always drawn:
    /// the change when there is a previous session of this split, and "first of
    /// this split" when there is not.
    private func metrics(_ page: SessionAnalysis.Page) -> some View {
        let report = page.report
        return VStack(spacing: OnyxSpace.grid) {
            LazyVGrid(columns: columns(3), spacing: OnyxSpace.grid) {
                cell("Volume", OnyxFormat.volume(report.tonnageKg), "kg",
                     sub: delta(page.tonnageDelta, unit: "kg", higherIsBetter: true))
                cell("Duration", report.session.durationMin.map { jsIntegerString(jsRound($0)) } ?? "—", "min",
                     sub: delta(page.durationDelta, unit: "min", higherIsBetter: nil))
                cell("Sets", "\(report.sets)", nil, sub: composition(report) ?? delta(page.setsDelta.map(Double.init), unit: "", higherIsBetter: true))
            }
            LazyVGrid(columns: columns(4), spacing: OnyxSpace.grid) {
                cell("Difficulty", report.session.sessionRpe.map { "\(OnyxFormat.rpe($0))/10" } ?? "—", nil,
                     sub: .init(report.session.sessionRpe.map { Effort.rpeLabel($0) } ?? "not rated", Color.onyx.textTertiary))
                cell("Records", "\(report.prCount)", nil,
                     sub: recordsDelta(page),
                     tint: report.prCount > 0 ? Color.onyx.record : nil)
                cell("Avg HR", page.avgBpm.map { jsIntegerString($0) } ?? "—", page.avgBpm == nil ? nil : "bpm",
                     sub: .init("no data", Color.onyx.textTertiary))
                cell("Calories", page.calories.map { jsIntegerString($0.kcal) } ?? "—",
                     page.calories == nil ? nil : "kcal",
                     sub: .init(basis(page.calories), Color.onyx.textTertiary),
                     estimated: page.calories != nil)
            }
        }
    }

    /// Three or four across until the type says otherwise, then ONE.
    ///
    /// Two columns at AX5 was tried and is worse than one: a half-width cell at
    /// that size holds "5,1…" and "DURAT…", so the grid keeps its shape and
    /// loses every value in it. A tall column of seven legible cells is what the
    /// setting was turned on for.
    private func columns(_ count: Int) -> [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: OnyxSpace.grid),
              count: typeSize.isAccessibilitySize ? 1 : count)
    }

    private struct Sub {
        let text: String
        let color: Color
        init(_ text: String, _ color: Color) { self.text = text; self.color = color }
    }

    private func cell(_ label: String, _ value: String, _ unit: String?, sub: Sub, tint: Color? = nil, estimated: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .onyxMicro()
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value)
                    .onyxType(.display).onyxNumeral()
                    .foregroundStyle(tint ?? Color.onyx.textPrimary)
                    .lineLimit(1).minimumScaleFactor(0.7)
                if let unit {
                    Text(unit)
                        .onyxType(.caption)
                        .foregroundStyle(Color.onyx.textTertiary)
                }
                // The web report's `calc` superscript: this figure was not
                // measured. It is the difference between "you burned 340 kcal"
                // and "340 kcal is what a session this long costs someone your
                // weight", and only one of those is a fact.
                if estimated {
                    Text("calc")
                        .onyxType(.micro)
                        .foregroundStyle(Color.onyx.textTertiary)
                        .baselineOffset(6)
                }
            }
            Text(sub.text)
                .onyxType(.caption).onyxNumeral()
                .foregroundStyle(sub.color)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(OnyxSpace.s)
        .onyxGlass(.row)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label), \(value) \(unit ?? ""), \(sub.text)")
    }

    /// A signed change, in the colour of what it means — or the honest absence.
    ///
    /// `higherIsBetter: nil` for duration: a session that took twelve minutes
    /// less is not worse and not better, it is shorter, and painting it red
    /// would be the app inventing a verdict it does not hold.
    private func delta(_ value: Double?, unit: String, higherIsBetter: Bool?) -> Sub {
        guard let value else { return Sub("first of this split", Color.onyx.textTertiary) }
        guard abs(value) >= 0.5 else { return Sub("level", Color.onyx.textTertiary) }
        let sign = value > 0 ? "+" : "−"
        let text = "\(sign)\(OnyxFormat.volume(abs(value)))\(unit.isEmpty ? "" : " \(unit)")"
        guard let higherIsBetter else { return Sub(text, Color.onyx.textSecondary) }
        return Sub(text, (value > 0) == higherIsBetter ? Color.onyx.good : Color.onyx.textSecondary)
    }

    /// `3 warm-up · 1 drop` — what the set count is made of.
    ///
    /// It takes the sub-line from the delta when there is anything to say,
    /// because a total of 17 that includes three warm-ups and a drop set is a
    /// number the reader will otherwise mistrust, and mistrust costs more than
    /// a comparison does.
    private func composition(_ report: SessionAnalysis.Report) -> Sub? {
        var counts: [String: Int] = [:]
        for exercise in report.exercises {
            for set in exercise.detail.sets where !SetTags.isWorkingSet(set.setType) {
                counts[set.setType, default: 0] += 1
            }
        }
        let entries = SetTags.composition(counts)
        guard !entries.isEmpty else { return nil }
        return Sub(entries.map { "\($0.count) \($0.full.lowercased())" }.joined(separator: " · "), Color.onyx.textTertiary)
    }

    private func basis(_ estimate: CalorieEstimate?) -> String {
        switch estimate?.basis {
        case .personalMedian: "your median"
        case .metFormula: "estimated"
        case nil: "no weight"
        }
    }

    /// Records against the previous session of this split. It is the reserved
    /// delta line doing its job: "9" alone is a number, "9, +2" is a session.
    private func recordsDelta(_ page: SessionAnalysis.Page) -> Sub {
        guard let previous = page.previous else { return Sub("first of split", Color.onyx.textTertiary) }
        let change = page.report.prCount - previous.prCount
        if change == 0 { return Sub("same as last", Color.onyx.textTertiary) }
        return Sub(change > 0 ? "+\(change)" : "−\(-change)",
                   change > 0 ? Color.onyx.record : Color.onyx.textSecondary)
    }

    // MARK: - 3 · Progression

    private func progression(_ page: SessionAnalysis.Page) -> some View {
        OnyxChartCard(
            "Progression", domain: .train,
            headline: "\(OnyxFormat.volume(page.report.tonnageKg)) kg",
            caption: page.verdict,
            // Only when the window holds one. A legend for a state nothing is
            // in is a line of chrome explaining nothing.
            legend: page.split.contains(where: \.isMaintenance)
                ? AnyView(MaintenanceLegend(symbol: .point)) : nil
        ) {
            if page.split.count >= 2 {
                SplitVolumeChart(points: page.split, current: page.report.session.id, tint: split)
            } else {
                OnyxChartEmpty("One session on this split so far. The line starts at two.")
            }
        }
    }

    // MARK: - 4 · Muscle focus

    /// ── THE WHOLE CARD OPENS THE ATLAS, NOT JUST THE 96 pt FIGURE ───────────
    /// The figure was the only tap target on it, which made the one control on
    /// the card the smallest thing on it — and left the ranked list beside it,
    /// which is the part the reader is actually looking at, inert. A tile whose
    /// content is a summary of a bigger view should open the bigger view from
    /// anywhere on it; the figure keeps its own press animation because it is
    /// what the sheet zooms out of.
    ///
    /// Nested buttons is the trap here: a `Button` inside a `Button` gets a
    /// touch neither of them handles cleanly, so the inner one is gone and the
    /// figure is now just a picture inside the card's own control.
    private func muscles(_ report: SessionAnalysis.Report) -> some View {
        let total = report.muscles.reduce(0) { $0 + $1.sets }
        return Button {
            showAtlas = true
        } label: {
            VStack(alignment: .leading, spacing: OnyxSpace.s) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Muscle focus").onyxMicro()
                    Spacer(minLength: OnyxSpace.s)
                    Text("\(OnyxFormat.sets(total)) weighted sets")
                        .onyxType(.caption).onyxNumeral()
                        .foregroundStyle(Color.onyx.textSecondary)
                    Image(systemName: "chevron.right")
                        .onyxType(.caption)
                        .foregroundStyle(Color.onyx.textTertiary)
                }
                HStack(alignment: .center, spacing: OnyxSpace.m) {
                    AtlasFigure(side: .front, worked: MuscleCredit.worked(
                        from: Dictionary(uniqueKeysWithValues: report.muscles.map { ($0.muscle, $0.sets) })
                    ))
                    .frame(height: 96)

                    VStack(alignment: .leading, spacing: OnyxSpace.s) {
                        ramp(report.muscles, total: total)
                        legend(report.muscles)
                    }
                }
            }
            .padding(OnyxSpace.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .onyxGlass(.tile)
            // AFTER the glass, so the whole tile is hit-testable and not just
            // the text inside it — and `onyxPress` scales the label, so the
            // shape follows the scale rather than the finger losing the target
            // at the moment it lands.
            .contentShape(RoundedRectangle(cornerRadius: OnyxCorner.tile, style: .continuous))
        }
        .buttonStyle(.plain)
        .onyxPress()
        // `.combine` and NO `accessibilityLabel`: the label it builds is the
        // legend — "Muscle focus, 27 weighted sets, Lats 4.5, Upper back
        // 4.5…" — and a hand-written one would silence the ranking that used
        // to be readable when the card was not a control.
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the body you can turn over")
    }

    /// One bar, split by share. It is the legend's numbers as a length, which
    /// is the comparison the reader is actually making.
    private func ramp(_ rows: [(muscle: LandmarkMuscle, sets: Double)], total: Double) -> some View {
        GeometryReader { proxy in
            HStack(spacing: 1) {
                ForEach(Array(rows.enumerated()), id: \.element.muscle) { i, row in
                    Rectangle()
                        .fill(Color.onyx.muscle(row.muscle, step: i, of: rows.count))
                        .frame(width: total > 0 ? max(2, proxy.size.width * row.sets / total) : 0)
                }
            }
            .clipShape(Capsule())
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }

    /// The four biggest, named. The rest are one row, because a legend of
    /// sixteen entries is a table nobody reads standing up — the sheet behind
    /// the figure is where the full ranking lives.
    private func legend(_ rows: [(muscle: LandmarkMuscle, sets: Double)]) -> some View {
        VStack(alignment: .leading, spacing: OnyxSpace.xs) {
            ForEach(Array(rows.prefix(4).enumerated()), id: \.element.muscle) { i, row in
                HStack(spacing: OnyxSpace.xs) {
                    Circle()
                        .fill(Color.onyx.muscle(row.muscle, step: i, of: rows.count))
                        .frame(width: 6, height: 6)
                    Text(row.muscle.displayName)
                        .onyxType(.caption)
                        .foregroundStyle(Color.onyx.textSecondary)
                        .lineLimit(1)
                    Spacer(minLength: OnyxSpace.xs)
                    Text(OnyxFormat.sets(row.sets))
                        .onyxType(.caption).onyxNumeral()
                        .foregroundStyle(Color.onyx.textPrimary)
                }
                .accessibilityElement(children: .combine)
            }
            if rows.count > 4 {
                Text("+\(rows.count - 4) more")
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textTertiary)
            }
        }
    }

    // MARK: - 5 · The ledger

    /// ── ONE CARD PER MOVEMENT, NOT THREE STACKED SURFACES ───────────────────
    /// This was a `Section`: a tinted header row, a separate dark card of sets,
    /// and a loose row of capsules floating under it. Three surfaces for one
    /// subject — and the capsules, which are the movement's OWN totals, sat
    /// below its sets, where they read as belonging to whatever came next.
    ///
    /// The header, the readings and the evidence are now one card: the tinted
    /// band says what the movement was and what it produced, the rows under it
    /// are the sets it produced it with. Which also gives the page the one
    /// thing the `Section` shape could not — a single edge per movement to
    /// scroll past, rather than a header, a gap, a card, a gap and a tag row.
    private func ledger(_ ex: SessionAnalysis.ExerciseReport) -> some View {
        let family = Self.family(ex.canonical)
        return VStack(alignment: .leading, spacing: 0) {
            ledgerHeader(ex, family: family)
            ForEach(Array(ex.rows.enumerated()), id: \.offset) { index, row in
                if index > 0 {
                    Divider()
                        .overlay(Color.onyx.hairline)
                        // Inset to the value column, the way a `List` insets a
                        // separator: a rule that runs under the badge column
                        // cuts the ordinals off from their own sets.
                        .padding(.leading, OnyxSpace.l)
                }
                SetRow(row: row, timed: ex.timed, tint: family)
            }
        }
        .onyxGlass(.tile)
        .id(ex.id)
        .plainRow(edgeToEdge: true)
    }

    /// The header IS the exercise's report: what the movement is FOR, what was
    /// prescribed, how much of it landed on the ceiling, what it produced, and
    /// the trail of estimated 1RM behind it. The rows underneath are the
    /// evidence.
    ///
    /// Three lines, in the order the questions are asked: which movement, which
    /// muscles, what came out of it.
    private func ledgerHeader(_ ex: SessionAnalysis.ExerciseReport, family: Color) -> some View {
        let domain = MuscleGroup.forExercise(ex.canonical).domain
        return VStack(alignment: .leading, spacing: OnyxSpace.xs) {
            HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.s) {
                // ── THE MOVEMENT'S OWN NAME, AT THE SIZE OF A TITLE ────────
                // It was 13 pt and uppercased by the `List`'s own header style
                // — the same treatment as the word "Cardio" two sections down,
                // which is a heading and not a subject. This section IS the
                // movement: the name is what the reader is looking for when
                // they scroll, and `SessionAnalysis.displayName` is what makes
                // it "Incline DB Press" rather than `helix5-incline-db-press`
                // on a session this phone logged.
                Text(ex.canonical)
                    .onyxType(.display)
                    .textCase(nil)
                    .foregroundStyle(Color.onyx.textPrimary)
                    // One line, until one line cannot hold it: at AX5 on a
                    // 375 pt phone "Incline DB Press" scaled to its floor and
                    // still came out "Incline DB Pr…", and a movement whose
                    // name is cut off is a card about nothing.
                    .lineLimit(typeSize.isAccessibilitySize ? 3 : 1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: OnyxSpace.xs)
                // 40×16, no axis, no label: it is there to say "this has been
                // going up" in the space a number would take. Blank under two
                // sessions — `Sparkline`'s own empty caption is written for a
                // widget face and truncates to "not en…" at this width — and
                // blank at the accessibility sizes, where 40 pt of unlabelled
                // decoration is 40 pt the name needs.
                if ex.spark.count >= 2, !typeSize.isAccessibilitySize {
                    Sparkline(points: ex.spark, color: domain.accent, zeroBased: false)
                        .frame(width: 40, height: 16)
                        .accessibilityHidden(true)
                }
            }
            // ── WHAT THE MOVEMENT IS FOR, AND WHAT WAS ASKED OF IT ─────────
            // `FlowRow` and no `Spacer`: the prescription used to be pushed to
            // the far edge by one, and a `Spacer` cannot wrap — at AX5 the
            // chips and the window then divided a 375 pt line four ways. Here
            // the line simply becomes two when it has to, which is what a flow
            // layout is for, and the reading stays beside the muscles it was
            // set for.
            FlowRow(spacing: OnyxSpace.xs) {
                ForEach(movers(ex.canonical), id: \.name) { mover in
                    muscleChip(mover, family: family)
                }
                if let window = ex.window {
                    Text("\(ex.atCeiling)/\(Int(ex.detail.workingSets)) @ \(window)")
                        .onyxType(.micro).onyxNumeral()
                        .foregroundStyle(Color.onyx.textTertiary)
                        .padding(.vertical, 2)
                }
            }
            // ── THE MOVEMENT'S OWN TOTALS, IN ITS OWN HEADER ───────────────
            // §U4.3 put these five capsules in the section FOOTER, under the
            // sets — where the top set, the tonnage and the average effort read
            // as a caption on the rows rather than as the movement's summary,
            // and the one tinted verdict on the row was the furthest thing on
            // the card from the name it judges. They are the header's job.
            //
            // The rep TOTAL left with the move: it is the only one of the five
            // the reader can add up from the rows immediately below it, and
            // four capsules fit one line on a 375 pt phone where five did not.
            MetaTagRow(tags: headerTags(ex, domain: domain))
        }
        .padding(.horizontal, OnyxSpace.l)
        .padding(.vertical, OnyxSpace.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        // ── A WASH IN THE MUSCLE'S OWN HUE, NOT THE DOMAIN'S ───────────────
        // `MuscleGroup.domain` collapses sixteen landmarks onto four accents,
        // so a chest day and a shoulder day drew the identical bar. The atlas,
        // the ramp and the legend on this same page are all already keyed on
        // `Color.onyx.muscle`, and this is the fourth surface answering the
        // same question — it takes the same colour or it is decoration.
        //
        // A 22 %→0 gradient behind glass rather than a tinted panel, for the
        // reason the title band states: a filled colour block makes the
        // material under it read as a different surface and puts a hard edge
        // across the page.
        //
        // No glass and no clip of its own any more: the band is the top of one
        // card now, and a second material inside the card's own would be the
        // "translucent surface on a translucent surface" `OnyxGlass` warns
        // about. The card clips it.
        .background {
            LinearGradient(
                colors: [family.opacity(0.28), family.opacity(0.04)],
                startPoint: .leading, endPoint: .trailing
            )
        }
        // A leading rule in the muscle's hue: the one thing that survives the
        // gradient being nearly invisible on a pale family, and what makes a
        // scrolled ledger scannable by colour.
        .overlay(alignment: .leading) { family.frame(width: 3) }
    }

    /// Primary and assisting movers, deduped, capped at what a 375 pt line
    /// holds. `MuscleMap` is the same source the atlas, the ramp and the legend
    /// on this page read, so a lift's chips and its share of the body cannot
    /// disagree.
    ///
    /// The secondaries exclude anything already trained DIRECTLY, for the
    /// reason `ExerciseDetailView` states: several map tokens fold onto one
    /// landmark, so a wide-grip row would otherwise print "Upper back" twice —
    /// once as a primary and once as an assist — and read as double credit that
    /// `MuscleCredit` never gives.
    private func movers(_ canonical: String) -> [Mover] {
        // At AX5 a chip is a line, so three of them is three lines of "also
        // worked" above the numbers the reader came for. The primaries are what
        // the movement IS; the assists are the first thing to go.
        let limit = typeSize.isAccessibilitySize ? 1 : 3
        var seen = Set<LandmarkMuscle>()
        var out: [Mover] = []
        for muscle in MuscleMap.primaryLandmarks(canonical) where seen.insert(muscle).inserted {
            out.append(Mover(name: muscle.displayName, primary: true))
        }
        for muscle in MuscleMap.secondaryLandmarks(canonical) where seen.insert(muscle).inserted {
            guard out.count < limit else { break }
            out.append(Mover(name: muscle.displayName, primary: false))
        }
        return out
    }

    private struct Mover {
        let name: String
        let primary: Bool
    }

    /// ── ONE HUE, TWO WEIGHTS ────────────────────────────────────────────────
    /// The primary chip wears the movement's own muscle colour — the same
    /// `Color.onyx.muscle` value the card's rule, wash, sparkline family and the
    /// atlas below all take. An assist is the SAME colour at less than full
    /// strength, not a second colour: a distinct hue for "also worked" would be
    /// a fifth accent nobody designed, and the difference the reader needs is
    /// how much this movement is about that muscle, which is a weight.
    private func muscleChip(_ mover: Mover, family: Color) -> some View {
        HStack(spacing: OnyxSpace.xs) {
            Circle()
                .fill(family.opacity(mover.primary ? 1 : 0.5))
                .frame(width: 6, height: 6)
            Text(mover.name)
                // `.onyxType(.micro)`, never `onyxMicro()`: this is a name, and
                // the register role would set "Upper back" as UPPER BACK.
                .onyxType(.micro)
                .textCase(nil)
                .foregroundStyle(mover.primary ? family : family.opacity(0.7))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .padding(.horizontal, OnyxSpace.s)
        .padding(.vertical, 2)
        .background(family.opacity(mover.primary ? 0.16 : 0.08), in: .capsule)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(mover.primary ? "\(mover.name), primary" : "\(mover.name), assisting")
    }

    /// The hue of the movement's FIRST primary mover — the same key
    /// `Color.onyx.muscle` uses everywhere else on this page. Falls back to the
    /// six-group accent when the map has no answer, which is honest: an
    /// unmapped movement has no family to be tinted by.
    private static func family(_ canonical: String) -> Color {
        guard let landmark = MuscleMap.primaryLandmarks(canonical).first else {
            return MuscleGroup.forExercise(canonical).domain.accent
        }
        return Color.onyx.muscle(landmark)
    }

    /// The readings that used to be one grey sentence (§U4.3), now the third
    /// line of the movement's own header.
    ///
    /// Two carry colour and the rest are facts. The COMPARISON — this
    /// movement's tonnage against the last time it was trained — is the one
    /// reading here that holds a verdict; `higherIsBetter` is unambiguous in a
    /// way it is not for duration, because more work on the same lift is more
    /// work. The CUE is the other, and it is an instruction rather than a
    /// reading, which is why it goes last and in the domain's own accent.
    private func headerTags(_ ex: SessionAnalysis.ExerciseReport, domain: OnyxDomain) -> [MetaTagRow.Tag] {
        var tags: [MetaTagRow.Tag] = []
        // ── THE VERDICT LEADS ───────────────────────────────────────────────
        // Five capsules do not fit 402 pt, so one wraps — and it was this one,
        // alone on a second line, at the far left, where the only tinted item
        // on the row reads as an orphan rather than as the conclusion. It is
        // also the one item here that answers "was this any good"; the other
        // four are totals the reader can find in the rows above. First on the
        // line is where the eye starts.
        if let prev = ex.prevDate, let date = LogicalDay.date(fromISO: prev) {
            let previous = previousVolume(ex)
            // No arrow when there is nothing to compare against — an unmarked
            // "vs 30 Aug" is a date, and a green triangle over a number nobody
            // computed would be a verdict invented for a shape.
            let direction: (String, Color)? = previous.map { was in
                let delta = ex.detail.volumeKg - was
                if abs(delta) < 0.5 { return ("equal", Color.onyx.textTertiary) }
                return delta > 0
                    ? ("arrowtriangle.up.fill", Color.onyx.good)
                    : ("arrowtriangle.down.fill", Color.onyx.textSecondary)
            }
            tags.append(.init(
                "vs \(OnyxChart.shortDate(date))",
                symbol: direction?.0,
                tint: direction?.1
            ))
        }
        tags.append(.init("Top " + SetFormat.format(weightKg: ex.stats.topKg, reps: ex.stats.topReps, timed: ex.timed)))
        tags.append(.init("\(OnyxFormat.volume(ex.detail.volumeKg)) kg"))
        if let rpe = ex.stats.avgRpe { tags.append(.init("RPE \(jsToFixed1(rpe))")) }
        if let cue = ex.cue { tags.append(.init(cue.short, tint: domain.accent)) }
        return tags
    }

    /// This movement's tonnage on the session before this one.
    ///
    /// ── FROM `previousSets`, NOT FROM THE `prev` COLUMNS ────────────────────
    /// It was rebuilt from `RowWithPrev.prev`, and `SessionDetail.rowsWithPrev`
    /// attaches those POSITIONALLY — indexed by this session's numbered rows.
    /// Any previous set past that count is never attached and was silently
    /// dropped. Four sets of 100 × 10 last time and three this time summed to
    /// 3000 against 3000, so the one capsule on the row that carries a verdict
    /// said "equal" on a lift whose tonnage had fallen a quarter — and cutting
    /// a set is exactly when the reader wants the arrow.
    ///
    /// `sessionVolumeKg`, not a sum of w × r: it collapses a unilateral pair to
    /// its weaker side and skips a ghost, and `ex.detail.volumeKg` — the figure
    /// this is compared AGAINST — is that same function.
    private func previousVolume(_ ex: SessionAnalysis.ExerciseReport) -> Double? {
        guard !ex.previousSets.isEmpty else { return nil }
        return SessionVolume.sessionVolumeKg(ex.previousSets.map {
            VolumeSet(weightKg: $0.weightKg, reps: $0.reps, side: $0.side, pairId: $0.pairId, setType: $0.setType)
        })
    }

    /// What the atlas's share sheet calls this session.
    private func shareLabel(_ report: SessionAnalysis.Report) -> String {
        let day = SessionAnalysis.dayLabel(report.session.dayKey) ?? "Session"
        guard let date = LogicalDay.date(fromISO: report.session.date) else { return day }
        return "\(day) · \(date.formatted(.dateTime.day().month(.abbreviated)))"
    }

    // MARK: - 6 · Cardio

    private func cardio(_ rows: [CardioLogRow]) -> some View {
        Section {
            ForEach(rows, id: \.id) { c in
                LabeledContent(CardioKind(c.kind).label) {
                    Text(cardioText(c)).onyxNumeral().foregroundStyle(Color.onyx.textPrimary)
                }
                .frame(minHeight: 44)
            }
        } header: {
            OnyxSectionHeader("Cardio", .body)
        }
    }

    private func cardioText(_ c: CardioLogRow) -> String {
        var parts: [String] = []
        if let m = c.distanceM { parts.append("\(jsToFixed1(m / 1000)) km") }
        if let min = c.durationMin { parts.append("\(jsIntegerString(jsRound(min))) min") }
        if let pace = CardioMetrics.paceMinPerKm(distanceM: c.distanceM, durationMin: c.durationMin) {
            parts.append(CardioMetrics.formatPace(pace))
        }
        if let pct = c.inclinePct { parts.append("\(jsIntegerString(pct))%") }
        return parts.isEmpty ? "—" : parts.joined(separator: " · ")
    }
}

// MARK: - The progression chart

/// Session tonnage across every session of one split, with records in gold.
///
/// ── WHY TONNAGE AND NOT ESTIMATED 1RM ───────────────────────────────────────
/// A session's est-1RM is a per-EXERCISE reading and the ledger already draws
/// it, one sparkline per movement. What a split's line answers is a different
/// question — is the day as a whole carrying more work than it did — and the
/// only figure that survives an exercise being swapped in or out is the
/// session's own tonnage.
private struct SplitVolumeChart: View {
    let points: [SessionAnalysis.SplitPoint]
    let current: String
    let tint: Color

    @State private var selected: Date?

    private var dated: [(date: Date, point: SessionAnalysis.SplitPoint)] {
        points.compactMap { p in OnyxChart.date(p.date).map { (date: $0, point: p) } }
    }

    private var yDomain: ClosedRange<Double> {
        let (lo, hi) = ChartScale.niceDomain(points.map { Optional($0.tonnageKg) })
        return lo...hi
    }

    var body: some View {
        Chart {
            ForEach(dated, id: \.point.id) { entry in
                AreaMark(x: .value("Date", entry.date), y: .value("kg", entry.point.tonnageKg))
                    .foregroundStyle(
                        LinearGradient(colors: [tint.opacity(0.28), .clear], startPoint: .top, endPoint: .bottom)
                    )
                LineMark(x: .value("Date", entry.date), y: .value("kg", entry.point.tonnageKg))
                    .foregroundStyle(tint)
                    .interpolationMethod(.monotone)
                // Gold is a record and nothing else, so a point wears it only
                // when that session actually set one. The session being read
                // gets the accent ring instead — "you are here" is not a verdict.
                //
                // ── AND A MAINTENANCE WEEK IS DRAWN HOLLOW ──────────────────
                // The line DROPS on these weeks by design; that is what a
                // maintenance week is. Filled like every other point, the dip
                // reads as a session that went badly, and the chart's own
                // verdict sentence then argues with the plan. Hollow says "this
                // was meant to be lighter" without adding a colour — status
                // hues stay reserved, and gold still means only one thing.
                PointMark(x: .value("Date", entry.date), y: .value("kg", entry.point.tonnageKg))
                    .foregroundStyle(pointColor(entry.point))
                    .symbolSize(entry.point.sessionId == current ? 90 : 28)
                    .symbol {
                        let side: CGFloat = entry.point.sessionId == current ? 11 : 7
                        if entry.point.isMaintenance {
                            Circle()
                                .strokeBorder(pointColor(entry.point), lineWidth: 1.5)
                                .frame(width: side, height: side)
                        } else {
                            Circle()
                                .fill(pointColor(entry.point))
                                .frame(width: side, height: side)
                        }
                    }
            }
            if let picked = nearest(selected), let entry = dated.first(where: { $0.date == picked }) {
                RuleMark(x: .value("Selected", picked))
                    .foregroundStyle(Color.onyx.textTertiary)
                    .annotation(position: .top, spacing: 0, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        OnyxCallout(
                            OnyxChart.shortDate(picked),
                            lines: callout(entry.point),
                            footnote: entry.point.isMaintenance ? "Maintenance week" : nil
                        )
                    }
            }
        }
        .chartYScale(domain: yDomain)
        // Both bounds labelled (§3.5): a tight domain with only the middle
        // ticks named lets a 2 % rise read as a doubling.
        .chartYAxis {
            AxisMarks(position: .trailing, values: [yDomain.lowerBound, yDomain.upperBound]) { _ in
                AxisGridLine().foregroundStyle(Color.onyx.hairline)
                AxisValueLabel()
                    .font(OnyxChart.axisFont)
                    .foregroundStyle(Color.onyx.textTertiary)
            }
        }
        .chartXSelection(value: $selected)
        .onyxChart(.train)
        .accessibilityLabel("Session volume across this split")
    }

    private func nearest(_ date: Date?) -> Date? {
        guard let date else { return nil }
        return dated.map(\.date).min { abs($0.timeIntervalSince(date)) < abs($1.timeIntervalSince(date)) }
    }

    private func callout(_ point: SessionAnalysis.SplitPoint) -> [OnyxCallout.Line] {
        var lines = [OnyxCallout.Line("", "\(OnyxFormat.volume(point.tonnageKg)) kg")]
        if point.prCount > 0 {
            lines.append(OnyxCallout.Line("", "\(point.prCount) PR", color: Color.onyx.record))
        }
        return lines
    }

    private func pointColor(_ point: SessionAnalysis.SplitPoint) -> Color {
        point.prCount > 0 ? Color.onyx.record : tint
    }
}

// MARK: - The set row

/// One ledger row: the set as performed, the records it won, the RPE, and the
/// same set from the previous session. A unilateral pair is one row.
struct SetRow: View {
    let row: RowWithPrev
    let timed: Bool
    /// The movement's muscle hue — what a record row is washed in. Defaulted so
    /// the row keeps working anywhere it is dropped without a family to take.
    var tint: Color = Color.onyx.record

    @Environment(\.dynamicTypeSize) private var typeSize
    /// The record / failure glyph's side — see `markSymbol`.
    @ScaledMetric(relativeTo: .footnote) private var markSide: CGFloat = 14

    /// ── WHY THE ROW HAS TWO SHAPES ──────────────────────────────────────────
    /// Four things compete for one line: the badge, `42kg × 10`, what the set
    /// beat last time and an effort word. At AX5 "Very hard" alone claimed
    /// ~40 % of the width, the value was squeezed to nothing and
    /// character-wrapped one glyph per line — `4` / `2k` / `g` / `×` / `1` /
    /// `0` — because a `Text` given less than one glyph of width still draws at
    /// its intrinsic size. One set took 500 pt and said nothing.
    ///
    /// `minimumScaleFactor` cannot fix it: the row does not need smaller type,
    /// it needs a second line. So at the accessibility sizes the previous set
    /// and the effort word each get their own, and the value never wraps.
    ///
    /// ── AND WHY IT IS 30 pt TALL AND NOT 44 ─────────────────────────────────
    /// 44 is the tap target, and on THIS screen nothing in the row is tappable:
    /// the ledger is read, not operated (the Edit button in the bar is how a
    /// set is corrected). Four sets at 44 plus a two-line stack pushed one
    /// movement past a phone's height, so the reader scrolled a screen per
    /// exercise. The vertical padding is `xs` and the height floor is the
    /// badge's — which is what "compact" means when the row is a list of
    /// numbers rather than a row of controls.
    var body: some View {
        HStack(alignment: typeSize.isAccessibilitySize ? .top : .center, spacing: OnyxSpace.s) {
            badge
            VStack(alignment: .leading, spacing: 2) {
                if typeSize.isAccessibilitySize {
                    valueLine
                    if let previous { previousLine(previous) }
                    if let effort { effort }
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.s) {
                        valueLine
                        if let previous { previousLine(previous) }
                    }
                }
            }
            if !typeSize.isAccessibilitySize {
                Spacer(minLength: OnyxSpace.xs)
                if let effort { effort }
            }
        }
        .padding(.horizontal, OnyxSpace.l)
        .padding(.vertical, OnyxSpace.xs)
        // The frame BEFORE the wash. A `.background` applied first sizes itself
        // to the CONTENT, so a record row's tint stopped short of the row's own
        // height and drew as a pale stripe with a dark margin under it.
        .frame(maxWidth: .infinity, minHeight: 30, alignment: .leading)
        // ── A RECORD ROW IS WASHED IN THE MOVEMENT'S OWN COLOUR ─────────────
        // It was a 2 pt gold inset on the leading edge, which is invisible on a
        // scrolled page and says nothing about WHICH lift set the record. The
        // trophy in the badge is the gold — the one place it appears in the
        // ledger, so scanning for it still finds records and nothing else — and
        // the row behind it takes the same hue as the card's rule and wash, so
        // a record reads as this movement's record.
        .background(isRecord ? tint.opacity(0.14) : Color.clear)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
    }

    /// The set, and the mark it earned.
    private var valueLine: some View {
        HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.s) {
            value
            mark
        }
    }

    /// Never wrapped, and never scaled below legibility: it is the row.
    private var value: some View {
        Text(current)
            .onyxType(.body).onyxNumeral()
            .foregroundStyle(Color.onyx.textPrimary)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// ── WHAT THE SET WAS, IN ONE GLYPH ──────────────────────────────────────
    /// The record used to be up to two gold capsules spelling the AXES —
    /// "Weight", "1RM" — which is the widest possible way to say the narrowest
    /// thing: it made a record row 90 pt wider than a normal one on a 375 pt
    /// phone, and the logger deck hit the identical wall and answered it the
    /// identical way (`ExerciseCardView`: "the trophy now lives in the badge").
    /// The axes survive where they cost nothing — in what VoiceOver reads.
    ///
    /// Failure is the same kind of fact and gets the same treatment: an `F`
    /// beside the set, with the word still in the effort column, because the
    /// glyph is the glance and the word is the reading.
    ///
    /// A record wins the slot when a set is both, which the last rep of a PR
    /// often is: of the two, "this has never been done before" is the one worth
    /// a mark.
    @ViewBuilder
    private var mark: some View {
        if isRecord {
            markSymbol("trophy.fill", Color.onyx.record)
        } else if isFailure {
            // `f.circle.fill` and not a `Text("F")`: it is the F IN a badge the
            // brief asks for, it is the same kind of object as the trophy it
            // shares a slot with, and being a symbol it takes the same one
            // sizing rule instead of a second one.
            markSymbol("f.circle.fill", Color.onyx.danger)
        }
    }

    /// Scaled, and then capped.
    ///
    /// A symbol frozen in points is invisible beside a 40 pt value at AX5, and
    /// one that scales freely is 38 pt of decoration on a row whose numbers are
    /// the point — and it pushed the value into its own scale factor. So it
    /// grows with the text and stops at the height of the badge on the other
    /// side of the row.
    private func markSymbol(_ name: String, _ tint: Color) -> some View {
        Image(systemName: name)
            .resizable()
            .scaledToFit()
            .frame(width: min(markSide, 22), height: min(markSide, 22))
            .foregroundStyle(tint)
    }

    /// The same set, last time. Inline rather than on a line of its own — two
    /// columns that both carry `lineLimit(1)` and a scale factor divide the row
    /// between them, and a second line per set was half the ledger's height
    /// spent on a comparison the reader glances at.
    private func previousLine(_ text: String) -> some View {
        Text("prev \(text)")
            .onyxType(.caption).onyxNumeral()
            .foregroundStyle(Color.onyx.textTertiary)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }

    /// The set's number, in the disc the logger's own deck draws it in — `W`
    /// for a warm-up, the ordinal for everything else.
    ///
    /// ── AND WHY IT IS NOT THE THING THAT CHANGES ────────────────────────────
    /// The trophy went in here first, as it does on the deck. On the deck that
    /// is right: the badge shows the ordinal only until the set is LOGGED, so
    /// nothing is lost when the tick becomes a trophy. Every set on this page
    /// is logged, so the same rule read `W · 🏆 · 2 · 🏆` down a card whose own
    /// header says `1/3` — and the two rows the reader most wants to place were
    /// the two with no number left on them. The number stays; the mark sits
    /// beside the value, where the approved layout puts it.
    private var badge: some View {
        ZStack {
            Circle().fill(Color.onyx.hairline.opacity(0.6))
            Text(ordinal)
                .onyxType(.caption).fontWeight(.bold).onyxNumeral()
                .foregroundStyle(Color.onyx.textTertiary)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
        // The disc is the row's left margin and its height floor; it must not
        // grow with the type size or it takes the width from the value beside
        // it — and `minimumScaleFactor` alone does not hold at AX5, where a
        // scaled 13 pt caption is still half again the size of the box and drew
        // straight over the value. What is written here is spoken by the row
        // (see `spoken`), so capping the badge's own type costs nothing.
        .dynamicTypeSize(...DynamicTypeSize.large)
        .frame(width: 22, height: 22)
        // An unlabelled glyph over a `Shape` is not an accessibility element.
        .accessibilityHidden(true)
    }

    /// What VoiceOver hears, built by hand rather than combined: the row's
    /// visible text no longer names the record axes, and "65 kg × 10" alone
    /// would make the session's best set sound like every other one.
    private var spoken: String {
        var parts = [row.row.num.map { "Set \($0)" } ?? "Warm-up set", current]
        if !axes.isEmpty { parts.append("\(axes.joined(separator: ", ")) record") }
        if let previous { parts.append("previously \(previous)") }
        if let rpe { parts.append(Effort.rpeLabel(rpe)) }
        return parts.joined(separator: ", ")
    }

    @ViewBuilder
    private var effort: (some View)? {
        if let rpe {
            Text(Effort.rpeLabel(rpe))
                .onyxType(.caption)
                .foregroundStyle(Color.onyx.effort(rpe))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
    }

    private var ordinal: String { row.row.num.map(String.init) ?? "W" }

    private var lead: DetailSet? { row.row.set ?? row.row.left ?? row.row.right }

    private var isRecord: Bool { !axes.isEmpty }

    /// The top of `RpeLadder` — "missed or form broke". The badge says it with
    /// an `F` and the effort column keeps the word, because the badge is a
    /// glance and the word is the reading: an `F` alone is a grade.
    ///
    /// A record beats it in the badge. A set can be both — the last rep of a
    /// PR is often the one that failed — and of the two facts, "this has never
    /// been done before" is the one worth a gold disc.
    private var isFailure: Bool { (rpe ?? 0) >= 10 }

    private var current: String {
        if row.row.kind == "pair" {
            return [row.row.left.map { "L " + fmt($0.weightKg, $0.reps) }, row.row.right.map { "R " + fmt($0.weightKg, $0.reps) }]
                .compactMap { $0 }.joined(separator: " · ")
        }
        return lead.map { fmt($0.weightKg, $0.reps) } ?? "—"
    }

    private var previous: String? {
        guard row.row.num != nil, let p = row.prev else { return nil }
        if row.row.kind == "pair", let r = row.prevRight {
            return "L \(fmt(p.weightKg, p.reps)) · R \(fmt(r.weightKg, r.reps))"
        }
        return fmt(p.weightKg, p.reps)
    }

    private var axes: [String] {
        var out: [String] = []
        for a in [row.row.set, row.row.left, row.row.right].compactMap({ $0?.prAxes }).flatMap({ $0 }) {
            let label = PrAxis(rawValue: a).map { PrEngine.axisLabel($0, timed: timed) } ?? a
            if !out.contains(label) { out.append(label) }
        }
        return out
    }

    private var rpe: Double? {
        [row.row.set, row.row.left, row.row.right].compactMap { $0?.rpe }.max()
    }

    private func fmt(_ kg: Double, _ reps: Double) -> String {
        SetFormat.format(weightKg: kg, reps: reps, timed: timed)
    }
}

// MARK: - Cards inside a List

extension View {
    /// A card that happens to live in a `List`: no inset, no row material, no
    /// separator. The `List` is here for the LEDGER — a real list of sets with
    /// real section headers — and these four panels ride above it rather than
    /// forcing the whole page into a `ScrollView` of hand-drawn rows.
    ///
    /// Internal rather than private since Wave 2.9: Pulse is the same shape —
    /// a real `List` of vitals with tiles riding above and below it.
    /// `edgeToEdge` drops the side gutter, which §U4.1 asks of the session
    /// page: the 16 pt inset plus the tile's own 12 pt of padding put 28 pt
    /// between the screen edge and a number, and the metric grid is three
    /// columns wide on a 375 pt phone. Flush to the edge with 16 pt inside is
    /// the same 16 pt of breathing room around the content and 24 pt more of it
    /// per row. Pulse draws the same tiles and keeps its gutter — the default
    /// is the old behaviour, so this is one screen's decision rather than the
    /// design system's.
    func plainRow(edgeToEdge: Bool = false) -> some View {
        let gutter = edgeToEdge ? 0 : OnyxSpace.l
        return Section {
            self
                .listRowInsets(EdgeInsets(top: 0, leading: gutter, bottom: 0, trailing: gutter))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
        }
    }
}

#if DEBUG
#Preview("Session") { HistoryPreviews.view("session") }
#endif
