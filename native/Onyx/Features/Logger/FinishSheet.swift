import SwiftUI
import OnyxUI
import OnyxCore

/// How the session ends.
///
/// ── WHY A SHEET AND NOT A CONFIRMATION DIALOG ───────────────────────────────
/// Wave 1 ended a workout with `confirmationDialog("Finish this session?")` —
/// two buttons and a sentence of totals. That is the right control for a
/// destructive action and finishing is not one: it is the moment the session
/// becomes history, the only moment a session RPE can be asked for, and the
/// last thing you see before putting the phone away. A dialog can hold none of
/// that, and a dialog is also the wrong shape for a decision you might want to
/// look at first — you cannot scroll it, and you cannot leave it half open.
///
/// `.presentationDetents([.medium, .large])` gives both: the whole summary as
/// it opens, the dial alone by dragging down, and the same interruptible grab
/// every other sheet in the app has. Which one it ARRIVES at is `detent`.
///
/// ── AND WHAT THE SUMMARY BECAME ─────────────────────────────────────────────
/// It was five label-and-value rows in one glass box — a settings screen wearing
/// a workout's numbers, where the tonnage of a session read with exactly the
/// weight of a preference. A session's figures are not a list; they are a set of
/// readings, each glanceable on its own, which is a grid of tiles.
///
/// The grid also has room for what the rows never carried. `duration`, `avg hr`
/// and `calories` were three editable badges at the TOP of the web deck, asked
/// for throughout a session that had not happened yet; here they are answered at
/// the only moment anyone can answer them — and two of the three are usually not
/// questions at all, because the watch already knows. See `metricTile`.
struct FinishSheet: View {
    let model: LoggerModel
    /// Returns false when there was nothing to finish; the sheet stays up.
    let onFinish: (Double?) -> Bool

    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize

    /// ── WHY IT OPENS LARGE ─────────────────────────────────────────────────
    /// The dial is 168 pt and it is the first thing in the sheet, so at the
    /// `.medium` detent it and its caption ARE the sheet — the six readings
    /// below it sat entirely under the pinned Finish button, on the one screen
    /// whose job is to show you what the session came to. Both detents still
    /// exist and the grab handle still works; this only decides which one it
    /// arrives at, and the answer is the one where the summary is a summary.
    @State private var detent: PresentationDetent = .large
    @State private var rpe: Double = 8
    /// An unrated session stays unrated. `sessionRpe` is nullable in the store
    /// precisely so "I did not say" survives, and a dial that starts at 8 would
    /// otherwise write an 8 for everyone who never touched it.
    @State private var rated = false

    /// The watch's two figures, as they stand on disk when the sheet opens.
    ///
    /// Held in `@State` rather than re-read on every draw because they are also
    /// EDITABLE, and a field bound to a store read fights the person typing into
    /// it — the same reason `NumericField` keeps its own string.
    @State private var avgBpm: Int?
    @State private var calories: Int?
    @State private var bpmMeasured = false
    @State private var caloriesMeasured = false
    @FocusState private var editing: Metric?

    private enum Metric: Hashable { case bpm, calories }

    private var accent: Color { Color.onyx.day(model.day.key) }
    private var minutes: Int { max(0, Int(Date().timeIntervalSince(model.startedAt) / 60)) }

    /// Three across, until the type size says otherwise. Six tiles is two clean
    /// rows of three on a phone; at an accessibility size three of them is three
    /// truncated numbers, which is the one thing a reading must never be.
    private var columns: Int {
        if typeSize.isAccessibilitySize { return 1 }
        return typeSize >= .xxLarge ? 2 : 3
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: OnyxSpace.l) {
                    dial
                    summary
                    if !topMovement.isEmpty { heaviest }
                    if let sessionId = model.sessionId { summaryLink(sessionId) }
                }
                .padding(OnyxSpace.l)
            }
            // ── WHY THE BUTTON IS PINNED ────────────────────────────────────
            // It was the last view in the scroll view, and at the `.medium`
            // detent the dial and the caption fill the sheet — so the screen
            // called "Finish" had no visible way to finish, at both type
            // sizes. A primary action never scrolls out of its own sheet.
            .safeAreaInset(edge: .bottom) {
                finishButton
                    .padding(.horizontal, OnyxSpace.l)
                    .padding(.vertical, OnyxSpace.m)
                    .background(.ultraThinMaterial)
            }
            .onyxScreen(.train)
            .navigationTitle("Session")
            .navigationBarTitleDisplayMode(.inline)
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Keep logging") { dismiss() }
                }
                if editing != nil {
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button("Done") { editing = nil }
                    }
                }
            }
            .task { loadMetrics() }
        }
        .presentationDetents([.medium, .large], selection: $detent)
        .presentationDragIndicator(.visible)
        .presentationContentInteraction(.scrolls)
    }

    // MARK: - Effort

    /// The dial, and the WORD it is really asking for.
    ///
    /// ── WHY THE NUMBER STOPPED BEING THE ANSWER ─────────────────────────────
    /// The dial reported `8.5` and nothing else, and a point on a ten-point
    /// ratio scale is not something anyone can calibrate from memory between
    /// sessions — "was last Tuesday an 8 or an 8.5" has no honest answer, which
    /// is how a rating given by feel ends up being given by habit.
    ///
    /// Borg's scale has always carried verbal anchors and they are the part that
    /// makes it reproducible. So the anchor is now the largest thing under the
    /// ring, in the effort colour, and the number keeps its place in the middle
    /// of the control that sets it — the reading you tune AGAINST, not the thing
    /// being asked for. Nothing about what is stored changed: `session_rpe`
    /// still takes the half-point value, which is what the battery, the score
    /// and the weekly export all read.
    private var dial: some View {
        VStack(spacing: OnyxSpace.s) {
            RPEDial(value: $rpe, rated: $rated, accent: accent)

            if rated {
                Text(Cr10.label(rpe) ?? "")
                    .onyxDisplay()
                    .foregroundStyle(Color.onyx.effort(rpe))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .animation(OnyxMotion.fade, value: rpe)
                    .accessibilityHidden(true)
                Button("Clear rating") { rated = false }
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textSecondary)
                    .frame(minHeight: 44)
            } else {
                Text("How hard was the whole session?")
                    .onyxType(.body)
                    .foregroundStyle(Color.onyx.textSecondary)
                    .multilineTextAlignment(.center)
                    .frame(minHeight: 44)
            }
        }
    }

    // MARK: - The session, as readings

    private var summary: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.s) {
            OnyxSectionHeader("The session", .train)
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: OnyxSpace.s), count: columns),
                spacing: OnyxSpace.s
            ) {
                tile("Duration", "timer", "\(minutes)", "min", tint: accent)
                tile("Tonnage", "scalemass", OnyxFormat.volume(model.totalVolumeKg), "kg",
                     tint: Color.onyx.textPrimary)
                tile("Sets", "square.stack.3d.up", "\(model.completedSets)/\(model.plannedSets)", nil,
                     tint: Color.onyx.textPrimary)
                metricTile("Avg HR", "heart", value: $avgBpm, unit: "bpm",
                           measured: bpmMeasured, field: .bpm)
                metricTile("Calories", "flame", value: $calories, unit: "kcal",
                           measured: caloriesMeasured, field: .calories)
                tile("Records", "trophy", model.recordCount > 0 ? "\(model.recordCount)" : "—", nil,
                     tint: model.recordCount > 0 ? Color.onyx.record : Color.onyx.textTertiary)
            }
            provenance
        }
    }

    /// Where the two health figures came from, in one line.
    ///
    /// It matters which. A MEASURED average heart rate is the watch's record of
    /// this session; an estimated one is arithmetic on your own recent history,
    /// and a reading that does not say which it is invites being read as the
    /// first when it is the second.
    private var provenance: some View {
        Text(provenanceText)
            .onyxType(.caption)
            .foregroundStyle(Color.onyx.textTertiary)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var provenanceText: String {
        if avgBpm == nil || calories == nil {
            return "Heart rate and calories fill in from Apple Health once the watch has synced — or type them."
        }
        return bpmMeasured && caloriesMeasured
            ? "Heart rate and calories measured from the watch's own workout."
            : "Estimated from your recent sessions — edit either to correct it."
    }

    /// The movement that moved the most weight, named. One line, because the
    /// full breakdown is what "View summary" is for and repeating it here would
    /// be the sheet arguing with the screen it links to.
    private var heaviest: some View {
        HStack(spacing: OnyxSpace.s) {
            Image(systemName: "medal")
                .onyxType(.caption)
                .foregroundStyle(Color.onyx.textTertiary)
            Text(topMovement)
                .onyxType(.secondary)
                .foregroundStyle(Color.onyx.textSecondary)
                .lineLimit(2)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, OnyxSpace.m)
        .frame(minHeight: 44)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onyxGlass(.row)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Heaviest lift, \(topMovement)")
    }

    private var topMovement: String {
        guard let best = model.exercises.max(by: { $0.volumeKg < $1.volumeKg }), best.volumeKg > 0
        else { return "" }
        return "\(best.name) · \(OnyxFormat.volume(best.volumeKg)) kg"
    }

    private func summaryLink(_ sessionId: String) -> some View {
        NavigationLink {
            SessionDetailView(sessionId: sessionId)
        } label: {
            HStack {
                Text("View summary")
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textTertiary)
            }
            .onyxType(.body)
            .foregroundStyle(Color.onyx.textPrimary)
            .padding(.horizontal, OnyxSpace.m)
            .frame(minHeight: 44)
            .frame(maxWidth: .infinity)
            .onyxGlass(.row)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Tiles

    /// One reading. A tinted wash and a tinted hairline rather than a plain
    /// glass box, so the six read as one family and the eye can find any of
    /// them without reading the labels.
    private func tile(
        _ label: String, _ symbol: String, _ value: String, _ unit: String?, tint: Color
    ) -> some View {
        tileShell(label, symbol, tint: tint) {
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value)
                    .onyxType(.body).fontWeight(.semibold).onyxNumeral()
                    .foregroundStyle(tint)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if let unit {
                    Text(unit)
                        .onyxType(.micro)
                        .foregroundStyle(Color.onyx.textTertiary)
                }
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(unit.map { "\(value) \($0)" } ?? value)
    }

    /// A reading the watch fills in — and that you can correct.
    ///
    /// ── WHY IT IS A FIELD AND NOT A LINE OF TEXT ────────────────────────────
    /// `syncSessionMetrics` reads an `HKWorkout` overlapping the session and
    /// takes the heart-rate average and the active-energy sum from it, which is
    /// better than anything anyone could type — when there is one. There is not
    /// always one: a phone-only session, a watch left on the charger, a workout
    /// that syncs a day late. The web asked for all three of these by hand every
    /// session; this asks for none of them and accepts any of them, which is the
    /// difference a device with a health store gets to make.
    ///
    /// What you type is stamped MEASURED — see `AppDatabase.setSessionMetrics`
    /// — so a later sync cannot quietly replace your answer with an estimate.
    private func metricTile(
        _ label: String, _ symbol: String,
        value: Binding<Int?>, unit: String, measured: Bool, field: Metric
    ) -> some View {
        tileShell(label, symbol, tint: measured ? Color.onyx.good : Color.onyx.textPrimary) {
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                // ── THE FIELD HUGS ITS NUMBER ───────────────────────────────
                // A `TextField` takes every point it is offered, so the unit
                // beside it was pushed to the far edge of the tile and the two
                // read as separate facts — `132` on the left and `bpm` on the
                // right of a 116 pt box. `fixedSize` sizes it to what is typed;
                // the minimum keeps an empty field from collapsing to the width
                // of its own em dash.
                TextField("—", value: value, format: .number)
                    .keyboardType(.numberPad)
                    .onyxType(.body).fontWeight(.semibold).onyxNumeral()
                    .foregroundStyle(value.wrappedValue == nil
                                     ? Color.onyx.textTertiary : Color.onyx.textPrimary)
                    .fixedSize()
                    .frame(minWidth: 34, alignment: .leading)
                    .focused($editing, equals: field)
                    .onChange(of: editing) { previous, _ in
                        // Commit when focus LEAVES this field, not on every
                        // keystroke: a store write per digit is an outbox item
                        // per digit.
                        if previous == field { commitMetrics() }
                    }
                    .accessibilityLabel(label)
                Text(unit)
                    .onyxType(.micro)
                    .foregroundStyle(Color.onyx.textTertiary)
                Spacer(minLength: 0)
            }
        }
        // The TARGET is the tile, not the 34 pt of text inside it. A field you
        // have to hit exactly is a field nobody corrects, and the other four
        // tiles are inert — so the whole box being live is also the only
        // affordance saying which two of the six you can answer.
        .contentShape(.rect)
        .onTapGesture { editing = field }
    }

    private func tileShell<Content: View>(
        _ label: String, _ symbol: String, tint: Color, @ViewBuilder value: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: OnyxSpace.xs) {
            Label(label, systemImage: symbol)
                .onyxMicro()
                .lineLimit(1)
            value()
        }
        .padding(.horizontal, OnyxSpace.m)
        .padding(.vertical, OnyxSpace.s)
        .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous)
                .fill(tint.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous)
                .strokeBorder(tint.opacity(0.20), lineWidth: 0.5)
        )
    }

    // MARK: - The store

    private func loadMetrics() {
        guard let session = model.sessionRow else { return }
        avgBpm = session.avgBpm
        calories = session.caloriesBurned
        bpmMeasured = session.avgBpm != nil && !session.avgBpmEstimated
        caloriesMeasured = session.caloriesBurned != nil && !session.caloriesEstimated
    }

    private func commitMetrics() {
        model.setMetrics(avgBpm: avgBpm, calories: calories)
        if avgBpm != nil { bpmMeasured = true }
        if calories != nil { caloriesMeasured = true }
    }

    private var finishButton: some View {
        Button {
            // A field is still focused when the button is tapped, so its value
            // has not been committed. Dropping focus first is what makes a
            // typed heart rate part of the session being closed rather than of
            // the next sync.
            editing = nil
            commitMetrics()
            _ = onFinish(rated ? rpe : nil)
        } label: {
            Text("Finish session")
                .onyxType(.body).fontWeight(.semibold)
                .foregroundStyle(Color.onyx.textPrimary)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(
                    OnyxDomain.train.ramp,
                    in: RoundedRectangle(cornerRadius: OnyxCorner.tile, style: .continuous)
                )
        }
        .onyxPress(scale: 0.98)
    }
}

// MARK: - The dial

/// Session RPE, on a dial.
///
/// ── WHY A DIAL AND NOT A SLIDER ─────────────────────────────────────────────
/// A slider is the same gesture as the swipe that logs a set and the drag that
/// scrolls the deck, and this is the one control on the screen that should not
/// feel like those — it is a considered answer, not a quick one. A dial also
/// puts the value in the MIDDLE of the control it is set by, which is what lets
/// the number be the largest thing in the ring without a label pointing at it.
///
/// It is adjustable from VoiceOver as well: `accessibilityAdjustableAction` maps
/// swipe-up and swipe-down to the same half-point detents the finger gets, and
/// speaks the WORD as well as the number, which is what the sheet now shows.
private struct RPEDial: View {
    @Binding var value: Double
    @Binding var rated: Bool
    let accent: Color

    /// CR-10 below 6 is a warm-up, not a session. The dial covers the range a
    /// finished workout actually lands in and the digits stay readable.
    private static let low = 6.0
    private static let high = 10.0
    /// A three-quarter sweep, opening at the bottom — the shape of every dial
    /// Apple ships, and the gap is where the finger starts and stops rather
    /// than a place the value can hide.
    private static let sweep = 270.0
    private static let start = 135.0

    /// The dial scales with Dynamic Type: the numeral inside it does, and a
    /// fixed frame around growing type is how a gauge ends up with its own
    /// reading spilling over the rim.
    @ScaledMetric(relativeTo: .title) private var diameter: CGFloat = 168

    private var fraction: Double { (value - Self.low) / (Self.high - Self.low) }

    var body: some View {
        ZStack {
            track
            // Nothing is filled until something has been RATED. A dial that
            // arrives showing half a sweep has answered the question for you,
            // and 8 is exactly the answer nobody should be defaulted into.
            if rated { fill }
            reading
        }
        .frame(width: side, height: side)
        .contentShape(Circle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { set(from: $0.location) }
        )
        .sensoryFeedback(.selection, trigger: value)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Session effort")
        .accessibilityValue(
            rated ? "\(OnyxFormat.rpe(value)), \(Cr10.label(value) ?? "")" : "Not rated"
        )
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: commit(value + 0.5)
            case .decrement: commit(value - 0.5)
            default: break
            }
        }
    }

    private var side: CGFloat { min(diameter, 260) }

    private var stroke: StrokeStyle {
        StrokeStyle(lineWidth: 12, lineCap: .round)
    }

    /// ── WHY `trim` AND A ROTATION, NOT `Path.addArc` ────────────────────────
    /// `addArc` takes its angles in the layer's coordinate space, where Y points
    /// DOWN and `clockwise` therefore means the opposite of what it reads as.
    /// The first version of this dial drew its gap on the right and filled
    /// anticlockwise from twelve o'clock — geometry that is correct in the
    /// textbook and wrong on the screen. `Circle().trim` starts at three
    /// o'clock and runs clockwise, always, and a rotation puts the start where
    /// the design wants it: 135° is the bottom-left, so the gap lands at the
    /// bottom where the finger rests.
    private var track: some View {
        Circle()
            .trim(from: 0, to: Self.sweep / 360)
            .stroke(Color.onyx.hairline, style: stroke)
            .rotationEffect(.degrees(Self.start))
            .padding(6)
    }

    private var fill: some View {
        Circle()
            // A floor, not a fraction: RPE 6 is the bottom of the scale and
            // `trim(0, 0)` draws nothing, which is what UNRATED looks like.
            .trim(from: 0, to: Self.sweep / 360 * max(0.02, min(1, fraction)))
            .stroke(Color.onyx.effort(value), style: stroke)
            .rotationEffect(.degrees(Self.start))
            .padding(6)
    }

    /// The value, and only the value.
    ///
    /// It carried a "SESSION RPE" register label under the numeral, and at AX5
    /// that label wrapped to two lines and spilled out through both sides of the
    /// ring. The word that replaced it lives OUTSIDE the ring for the same
    /// reason: a gauge has room for one reading, and the one that belongs in the
    /// middle of a control is the one the control sets.
    private var reading: some View {
        Text(rated ? OnyxFormat.rpe(value) : "—")
            .onyxHero()
            .foregroundStyle(rated ? Color.onyx.effort(value) : Color.onyx.textTertiary)
    }

    /// Where the finger is, as a value.
    ///
    /// Screen angles run clockwise from east, so the arc's own parameter is the
    /// touch angle rotated back to the opening at the bottom-left. A touch in
    /// the GAP has no value on the dial, so it snaps to whichever end it is
    /// nearer — which is what a physical dial with a stop does, and is better
    /// than the alternative of the value jumping across the whole range.
    private func set(from point: CGPoint) {
        let dx = point.x - side / 2
        let dy = point.y - side / 2
        // A touch near the middle has no angle worth reading — `atan2` of two
        // numbers close to zero swings wildly, so tapping the numeral itself
        // would set a value at random. The hole is the reading's own space.
        guard (dx * dx + dy * dy).squareRoot() > side * 0.28 else { return }
        let degrees = atan2(dy, dx) * 180 / .pi
        var swept = degrees - Self.start
        while swept < 0 { swept += 360 }
        let clamped: Double
        if swept <= Self.sweep {
            clamped = swept / Self.sweep
        } else {
            clamped = swept < (360 + Self.sweep) / 2 ? 1 : 0
        }
        commit(Self.low + clamped * (Self.high - Self.low))
    }

    private func commit(_ raw: Double) {
        // Half points, which is what the CR-10 ladder has and what every RPE in
        // the store is already rounded to.
        value = min(Self.high, max(Self.low, Cr10.normalise(raw)))
        rated = true
    }
}

#if DEBUG
#Preview("Finish") {
    FinishSheet(model: .previewUpperB(logged: true), onFinish: { _ in true })
        .environment(AppEnvironment.preview)
}
#endif
