import SwiftUI
import OnyxUI
import OnyxCore
import OnyxData

/// The logger's second face: what the session has become, while it is happening.
///
/// ── WHY THIS IS A FACE AND NOT A SHEET ──────────────────────────────────────
/// Everything here used to be somewhere else and worse. Tonnage, sets and
/// records were a 44 pt strip above the deck — three numbers you read once a set
/// occupying the space of a set row for the whole workout. Muscle distribution
/// was two taps down a three-dot menu. Heart rate and calories only existed
/// after you had already finished. None of it was worth its space on the logging
/// face, and all of it is worth a screen you can flick to between sets.
///
/// ── AND WHY IT BINDS THE SAME MODEL ─────────────────────────────────────────
/// One `LoggerModel`, two faces. A second model fed by the first is a second
/// answer allowed to disagree with it, and the disagreement would show up as the
/// tonnage here differing from the tonnage on the Lock Screen by one set.
///
/// The cards are stat tiles rather than charts, deliberately: none of these
/// questions is "how did this change over time" — that is what the session
/// summary is for — and a sparkline of nine points drawn mid-workout is a
/// decoration with a legend.
struct LiveStatsView: View {
    let model: LoggerModel
    let clock: any PauseControlling
    let prs: any LivePrProviding
    /// Opens the full distribution sheet, which the atlas card is a preview of.
    let onMuscleFocus: () -> Void

    private var accent: Color { Color.onyx.day(model.day.key) }

    @Environment(\.dynamicTypeSize) private var typeSize

    /// Heart rate and calories arrive from the watch's own `HKWorkout`, which
    /// can be a day late — so this is whatever is on disk, re-read when a set
    /// lands rather than on every redraw. `LoggerModel.sessionRow` is a database
    /// query; calling it from a `body` would run it once per frame.
    @State private var session: WorkoutSession?

    var body: some View {
        ScrollView(.vertical) {
            VStack(spacing: OnyxSpace.m) {
                nowCard
                exercisesCard
                muscleCard
                recordsCard
                effortCard
            }
            .padding(.horizontal, OnyxSpace.l)
            .padding(.bottom, OnyxSpace.xl)
        }
        .scrollIndicators(.hidden)
        // Keyed on PHYSICAL sets: a warm-up leaves `completedSets` alone and
        // still changes the session row this card draws.
        .task(id: model.physicalSets) { session = model.sessionRow }
    }

    // MARK: - Now

    /// The three clocks, the count, and the tonnage.
    private var nowCard: some View {
        card("Now") {
            VStack(alignment: .leading, spacing: OnyxSpace.m) {
                // Three clocks share a row until they cannot. At AX5 the labels
                // broke to "ELA / PSE / D" — a register caption spelled down the
                // page in three-letter pieces — so the row becomes a column,
                // the same trade the totals strip made before it.
                // Progress and tonnage FIRST. Elapsed is already the largest
                // thing in the hero, 230 pt up and visible at the same moment;
                // a card whose headline is a number the reader can see twice
                // has spent its best line saying nothing new.
                setsProgress
                tonnage

                if typeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: OnyxSpace.s) { clocks }
                } else {
                    HStack(alignment: .top, spacing: OnyxSpace.m) { clocks }
                }
            }
        }
    }

    @ViewBuilder
    private var clocks: some View {
        timeCell(
            "Elapsed",
            running: !clock.isPaused,
            origin: clock.timerOrigin,
            frozen: clock.elapsed(),
            tint: clock.isPaused ? Color.onyx.textTertiary : Color.onyx.textPrimary
        )
        // Only once there is a pause to report. Most sessions have none, and a
        // permanent 0:00 is a third of this row spent on a number that is zero.
        if clock.isPaused || clock.pausedTotal >= 1 {
            timeCell(
                "Paused",
                running: clock.isPaused,
                // Shifted back by what is already banked, the same trick
                // `timerOrigin` plays. Counting from `pausedAt` alone dropped
                // every earlier pause while this one ran and handed them back
                // on resume, so the cell jumped backwards and then forwards.
                origin: clock.pausedAt?.addingTimeInterval(-clock.pausedTotal),
                frozen: clock.pausedTotal,
                tint: Color.onyx.textSecondary
            )
        }
        restCell
    }

    /// A clock cell that counts itself when it is the one running.
    ///
    /// `Text(_:style:.timer)` costs this view nothing per second; a frozen
    /// reading is plain text. Which of the two a cell is depends on the state,
    /// so both are here and only one is ever drawn.
    private func timeCell(
        _ label: String, running: Bool, origin: Date?, frozen: TimeInterval, tint: Color
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Group {
                if running, let origin {
                    Text(origin, style: .timer)
                } else {
                    Text(Clock.format(frozen))
                }
            }
            .onyxType(.display).onyxNumeral()
            .foregroundStyle(tint)
            .lineLimit(1)
            .minimumScaleFactor(0.6)

            Text(label).onyxMicro()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
        .accessibilityValue(Clock.format(running ? (origin.map { -$0.timeIntervalSinceNow } ?? frozen) : frozen))
    }

    /// Rest is the one clock that counts DOWN, and it is absent rather than zero
    /// when nothing is resting — a 0:00 in a cell reads as a timer that has
    /// finished, which is a different fact from no timer.
    @ViewBuilder
    private var restCell: some View {
        VStack(alignment: .leading, spacing: 2) {
            Group {
                if let countdown = restCountdown(model.restEndsAt) {
                    Text(timerInterval: countdown, countsDown: true)
                } else {
                    Text("—")
                }
            }
            .onyxType(.display).onyxNumeral()
            .foregroundStyle(model.restEndsAt == nil ? Color.onyx.textSecondary : accent)
            .lineLimit(1)
            .minimumScaleFactor(0.6)

            Text("Rest").onyxMicro()
        }
        // The LABEL dims with the value, not just the value. A live figure over
        // a live caption beside a dash over a live caption reads as missing
        // data; a whole column at half strength reads as switched off, which is
        // what "not resting" is.
        .opacity(model.restEndsAt == nil ? 0.45 : 1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var setsProgress: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.s) {
            HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.xs) {
                Text("\(model.completedSets)")
                    .onyxType(.body).fontWeight(.semibold).onyxNumeral()
                    .foregroundStyle(accent)
                Text("of \(model.plannedSets) sets")
                    .onyxType(.body)
                    .foregroundStyle(Color.onyx.textSecondary)
                Spacer(minLength: 0)
                if model.physicalSets > model.completedSets {
                    // Warm-ups. They are real work and they are not the count
                    // the programme prescribed, so they are stated beside it
                    // rather than folded into it.
                    Text("+\(model.physicalSets - model.completedSets) warm-up")
                        .onyxType(.caption)
                        .foregroundStyle(Color.onyx.textTertiary)
                        .lineLimit(1)
                }
            }
            OnyxProgressBar(fraction: setsFraction, tint: accent)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Sets")
        .accessibilityValue("\(model.completedSets) of \(model.plannedSets)")
    }

    private var setsFraction: Double {
        guard model.plannedSets > 0 else { return 0 }
        return min(1, Double(model.completedSets) / Double(model.plannedSets))
    }

    @ViewBuilder
    private var tonnage: some View {
        let figure = HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.s) {
            Text(OnyxFormat.volume(model.totalVolumeKg))
                .onyxType(.hero).onyxNumeral()
                .foregroundStyle(Color.onyx.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text("kg").onyxMicro()
        }
        // The delta is a sentence, and at an accessibility size a sentence does
        // not share a line with a hero figure — it sets the card's MINIMUM
        // width instead, and a card wider than the page overflows it in both
        // directions because a vertical scroll view will not scroll sideways to
        // rescue it. Under the figure at those sizes; beside it otherwise.
        if typeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: OnyxSpace.xs) {
                figure
                tonnageDelta
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Tonnage")
        } else {
            HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.s) {
                figure
                Spacer(minLength: OnyxSpace.s)
                tonnageDelta
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Tonnage")
        }
    }

    /// Against what the seed says this session was last time.
    ///
    /// ── AND WHY BEHIND IS NOT RED ───────────────────────────────────────────
    /// You are behind the seed for the whole workout and level with it on the
    /// last set, by construction. A danger colour on a number that is red 95 %
    /// of the time is a colour that means nothing by the third session.
    @ViewBuilder
    private var tonnageDelta: some View {
        let seed = seedTonnage
        if seed > 0 {
            let delta = model.totalVolumeKg - seed
            let ahead = delta >= 0
            // Two different sentences rather than one signed number. "−306 kg"
            // is true and reads as a verdict; "306 kg to last" is the same fact
            // as a distance, which is what it is for the whole session.
            Text(ahead
                 ? "▲ \(OnyxFormat.volume(delta)) kg over last \(model.day.label)"
                 : "\(OnyxFormat.volume(-delta)) kg to last \(model.day.label)")
                .onyxType(.caption).fontWeight(.semibold).onyxNumeral()
                .foregroundStyle(ahead ? Color.onyx.good : Color.onyx.textTertiary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.horizontal, OnyxSpace.s)
                .padding(.vertical, OnyxSpace.xs)
                .onyxGlass(.row)
        }
    }

    /// What the deck was SEEDED with, as tonnage.
    ///
    /// Today the seed is `plan.wk1Kg × repWindow.floor` per prescribed set —
    /// `LoggerModel.seedRows` and `previousLabel` are the same two numbers, so
    /// this genuinely is "what the previous column says". Wave E4's `SessionSeed`
    /// replaces that seed with the last real non-maintenance session of this day,
    /// matched by canonical name; when it lands, THIS is the property that
    /// re-points at it, and the chip starts comparing against a session that
    /// happened.
    private var seedTonnage: Double {
        model.exercises.reduce(0) { total, exercise in
            guard let kg = exercise.plan.wk1Kg,
                  let window = exercise.plan.repWindow
            else { return total }
            return total + kg * Double(window.floor) * Double(exercise.plan.sets(for: model.phase))
        }
    }

    // MARK: - Exercises

    private var exercisesCard: some View {
        // "Exercises" left the second line unexplained — top set, last set, or
        // working weight? The card's own register label is the cheapest place
        // to answer it once for every row.
        card("Top set by exercise") {
            VStack(spacing: 0) {
                ForEach(model.exercises) { exercise in
                    exerciseRow(exercise)
                    if exercise.id != model.exercises.last?.id {
                        Divider().overlay(Color.onyx.hairline)
                    }
                }
            }
        }
    }

    private func exerciseRow(_ exercise: LoggerModel.ExerciseState) -> some View {
        HStack(alignment: .center, spacing: OnyxSpace.m) {
            VStack(alignment: .leading, spacing: 1) {
                Text(exercise.name)
                    .onyxType(.body)
                    .foregroundStyle(exercise.isComplete ? Color.onyx.textSecondary : Color.onyx.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text(topSetLabel(exercise))
                    .onyxType(.caption).onyxNumeral()
                    .foregroundStyle(Color.onyx.textTertiary)
                    .lineLimit(1)
            }
            Spacer(minLength: OnyxSpace.s)
            progressionChip(exercise)
            setDots(exercise)
        }
        .frame(minHeight: 40)
        .padding(.vertical, OnyxSpace.xs)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(exercise.name)
        .accessibilityValue("\(exercise.workingSets) of \(exercise.plan.sets(for: model.phase)) sets. \(topSetLabel(exercise))")
    }

    /// The heaviest set ticked so far — the one number that says how the
    /// movement is going without reading four rows of it.
    private func topSetLabel(_ exercise: LoggerModel.ExerciseState) -> String {
        let done = exercise.rows.filter { $0.isDone && $0.kind != .ghost }
        guard let top = done.max(by: { lhs, rhs in
            let l = (lhs.weightKg ?? 0, lhs.reps ?? 0)
            let r = (rhs.weightKg ?? 0, rhs.reps ?? 0)
            return l < r
        }), let kg = top.weightKg, let reps = top.reps else {
            // Nothing ticked yet. The question a row like that is actually
            // asking is "what am I meant to do", so it answers with the
            // prescription rather than with a dash — and a rep window carries
            // no kilograms, so it can never be misread as a set you logged.
            if let window = exercise.plan.repWindow {
                return "@ \(window.floor)–\(window.ceiling)"
            }
            return exercise.plan.reps
        }
        return "\(OnyxFormat.kg(kg)) kg × \(reps)"
    }

    /// Done against prescribed, as marks rather than a fraction.
    ///
    /// Four dots are read at a glance and "3/4" is read as arithmetic. Above
    /// eight the dots stop being countable and the fraction is the better
    /// answer, so the row falls back to it rather than drawing a bar code.
    @ViewBuilder
    private func setDots(_ exercise: LoggerModel.ExerciseState) -> some View {
        let planned = max(exercise.plan.sets(for: model.phase), exercise.rows.count)
        let done = exercise.workingSets
        if planned > 8 {
            Text("\(done)/\(planned)")
                .onyxType(.caption).fontWeight(.semibold).onyxNumeral()
                .foregroundStyle(Color.onyx.textSecondary)
                .fixedSize()
        } else {
            HStack(spacing: 4) {
                ForEach(0..<planned, id: \.self) { index in
                    // A ring at 7 pt in an 8 % hairline is invisible on this
                    // ground; an unfilled dot is a FILLED one in tertiary ink,
                    // which is legible and still unmistakably not done.
                    Circle()
                        .fill(index < done ? accent : Color.onyx.textTertiary.opacity(0.35))
                        .frame(width: 8, height: 8)
                }
            }
            .animation(OnyxMotion.move, value: done)
            .accessibilityHidden(true)
        }
    }

    /// `▲ +2.5` when the ladder says raise it, `1 more` when one more session at
    /// the ceiling would.
    ///
    /// ── WHAT IT CAN SEE TODAY ───────────────────────────────────────────────
    /// `Ceilings.progressionVerdict` grades the last TWO sessions and only this
    /// one is in memory, so the reachable verdicts are `one-more` and `no`.
    /// Wave E4's `SessionSeed` puts the previous non-maintenance session in front
    /// of it, and `.ready` — the `▲ +2.5` — starts firing without this view
    /// changing: it is the ARRAY that gains an element.
    @ViewBuilder
    private func progressionChip(_ exercise: LoggerModel.ExerciseState) -> some View {
        let sets = exercise.rows
            .filter { $0.isDone && $0.kind == .normal }
            .compactMap { row -> WorkingSet? in
                guard let kg = row.weightKg, let reps = row.reps else { return nil }
                return WorkingSet(weightKg: kg, reps: Double(reps))
            }
        let verdict = Ceilings.progressionVerdict(
            [sets], ceiling: exercise.plan.repWindow.map { Double($0.ceiling) }
        )
        switch verdict.state {
        case .ready:
            chip(
                verdict.suggestKg.map { "▲ \(OnyxFormat.kg($0)) kg" } ?? "▲ Ready",
                Color.onyx.good
            )
        case .oneMore:
            chip("1 more", accent)
        case .no:
            EmptyView()
        }
    }

    private func chip(_ text: String, _ tint: Color) -> some View {
        Text(text)
            .onyxType(.caption).fontWeight(.semibold).onyxNumeral()
            .foregroundStyle(tint)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.horizontal, OnyxSpace.s)
            .padding(.vertical, 2)
            .background(Capsule().fill(tint.opacity(0.16)))
    }

    // MARK: - Muscle focus

    /// The body, filled in as the session lands on it.
    ///
    /// It replaces "Muscle distribution" in the three-dot menu, and it is a
    /// PREVIEW: the ranked legend and the two totals still live in the sheet,
    /// which this card opens. What the card has to answer on its own is the
    /// question the menu item was buried under — "is all of this on one side of
    /// me" — and a body answers that without being read.
    private var muscleCard: some View {
        card("Muscle focus", accessory: "Distribution", action: onMuscleFocus) {
            let sets = model.muscleSets
            VStack(spacing: OnyxSpace.s) {
                if sets.isEmpty {
                    Text("Tick a set and the body fills in.")
                        .onyxType(.caption)
                        .foregroundStyle(Color.onyx.textTertiary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, OnyxSpace.m)
                } else {
                    AtlasFigure(worked: MuscleCredit.worked(from: sets))
                        .frame(maxWidth: .infinity)
                        .frame(height: 170)
                        .accessibilityHidden(true)
                    topMuscles(sets)
                }
            }
        }
    }

    /// The three that carried it, in words — the figure says WHERE and this says
    /// how much, which is the half a shape cannot carry.
    private func topMuscles(_ sets: [LandmarkMuscle: Double]) -> some View {
        let ranked = LandmarkMuscle.allCases
            .compactMap { muscle -> (LandmarkMuscle, Double)? in
                guard let value = sets[muscle], value > 0 else { return nil }
                return (muscle, value)
            }
            // Ties break on the landmark's own order, so the row cannot
            // reshuffle under the reader between two ticks.
            .sorted { $0.1 > $1.1 }
            .prefix(3)
        return HStack(spacing: OnyxSpace.m) {
            ForEach(Array(ranked), id: \.0) { muscle, value in
                HStack(spacing: OnyxSpace.xs) {
                    Circle()
                        .fill(Color.onyx.muscle(muscle))
                        .frame(width: 7, height: 7)
                    Text(muscle.displayName)
                        .foregroundStyle(Color.onyx.textSecondary)
                        .lineLimit(1)
                    Text(OnyxFormat.sets(value))
                        .fontWeight(.semibold).onyxNumeral()
                        .foregroundStyle(Color.onyx.textPrimary)
                }
                .onyxType(.caption)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Heaviest muscles")
    }

    // MARK: - Records

    private var recordsCard: some View {
        card("Records") {
            let records = prs.livePrs
            if records.isEmpty {
                Text("No records yet. A set that beats your best lights up here and on the Lock Screen.")
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textTertiary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(spacing: 0) {
                    ForEach(records) { record in
                        recordRow(record)
                        if record.id != records.last?.id {
                            Divider().overlay(Color.onyx.hairline)
                        }
                    }
                }
            }
        }
    }

    private func recordRow(_ record: LivePrRecord) -> some View {
        HStack(spacing: OnyxSpace.m) {
            Image(systemName: "trophy.fill")
                .imageScale(.small)
                .foregroundStyle(Color.onyx.record)
            VStack(alignment: .leading, spacing: 1) {
                Text(record.exercise)
                    .onyxType(.body)
                    .foregroundStyle(Color.onyx.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text("\(record.axis.displayName) · \(record.setLabel)")
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textTertiary)
                    .lineLimit(1)
            }
            Spacer(minLength: OnyxSpace.s)
            VStack(alignment: .trailing, spacing: 1) {
                Text(mark(record.mark.value, record.axis))
                    .onyxType(.body).fontWeight(.semibold).onyxNumeral()
                    .foregroundStyle(Color.onyx.record)
                // The mark it beat. A trophy without the old number is a
                // congratulation; with it, it is a measurement.
                Text("was \(mark(record.mark.previous, record.axis))")
                    .onyxType(.caption).onyxNumeral()
                    .foregroundStyle(Color.onyx.textTertiary)
            }
            // No `layoutPriority`: a priority-1 column takes its ideal width
            // first and the name gets the remainder, which at AX5 is an
            // ellipsis where the lift should be. Both columns carry
            // `lineLimit(1)` and a scale factor, so they divide and both shrink.
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }

    private func mark(_ value: Double, _ axis: PrAxis) -> String {
        let unit = axis.unit
        let number = axis == .reps ? OnyxFormat.sets(value) : OnyxFormat.kg(value)
        return unit.isEmpty ? number : "\(number) \(unit)"
    }

    // MARK: - Effort

    /// Heart rate and calories, and where they came from.
    ///
    /// Both are POST-HOC: the watch writes its own `HKWorkout` and the sync
    /// folds it in, which can be a day later. Live wrist heart rate is Phase 4
    /// (decision 1), so this card's honest job today is to say whether the two
    /// numbers are measured, estimated, or not there yet — and to never present
    /// an estimate as a reading.
    private var effortCard: some View {
        card("Effort") {
            VStack(alignment: .leading, spacing: OnyxSpace.m) {
                HStack(spacing: OnyxSpace.m) {
                    effortCell(
                        "Avg HR", "heart.fill",
                        value: session?.avgBpm.map { "\($0)" },
                        unit: "bpm",
                        tint: Color.onyx.danger
                    )
                    effortCell(
                        "Calories", "flame.fill",
                        value: session?.caloriesBurned.map { "\($0)" },
                        unit: "kcal",
                        tint: Color.onyx.calories
                    )
                }
                Text(provenance)
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textTertiary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func effortCell(
        _ label: String, _ symbol: String, value: String?, unit: String, tint: Color
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.xs) {
                Image(systemName: symbol)
                    .imageScale(.small)
                    .foregroundStyle(value == nil ? Color.onyx.textTertiary : tint)
                Text(value ?? "—")
                    .onyxType(.display).fontWeight(.semibold).onyxNumeral()
                    .foregroundStyle(value == nil ? Color.onyx.textTertiary : Color.onyx.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(unit).onyxMicro()
            }
            Text(label).onyxMicro()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
        .accessibilityValue(value.map { "\($0) \(unit)" } ?? "Not recorded yet")
    }

    private var provenance: String {
        guard let session, session.avgBpm != nil || session.caloriesBurned != nil else {
            return "Fills in from Apple Health once the watch has synced this workout."
        }
        let measured = !session.avgBpmEstimated && !session.caloriesEstimated
        return measured
            ? "Measured from the watch's own workout."
            : "Estimated from your recent sessions. The finish sheet lets you correct either."
    }

    // MARK: - Card chrome

    /// One tile, with a register label and an optional way in.
    private func card<Content: View>(
        _ title: String,
        accessory: String? = nil,
        action: (() -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: OnyxSpace.s) {
            HStack {
                Text(title).onyxMicro()
                Spacer(minLength: OnyxSpace.s)
                if let accessory, let action {
                    Button(action: action) {
                        HStack(spacing: 2) {
                            Text(accessory)
                            Image(systemName: "chevron.right").imageScale(.small)
                        }
                        .onyxType(.caption).fontWeight(.semibold)
                        .foregroundStyle(accent)
                        .contentShape(Rectangle())
                    }
                    .onyxPress()
                }
            }
            content()
        }
        .padding(OnyxSpace.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onyxGlass(.tile)
    }
}


#if DEBUG
#Preview("Live Stats") {
    let model = LoggerModel.previewUpperB(logged: true)
    return LiveStatsView(
        model: model,
        clock: LoggerClock(startedAt: Date().addingTimeInterval(-22 * 60)),
        prs: SeedPrProvider(model: model),
        onMuscleFocus: {}
    )
    .onyxScreen(.train)
    .foregroundStyle(Color.onyx.textPrimary)
    .preferredColorScheme(.dark)
}
#endif
