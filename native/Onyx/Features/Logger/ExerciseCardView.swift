import SwiftUI
import OnyxUI
import OnyxCore

/// One movement, and the sets you are logging into it — a single page of the
/// deck.
///
/// ── WHAT THE WEB CARD WAS, AND WHAT THIS IS INSTEAD ─────────────────────────
/// `ExerciseCard.tsx` is 1,435 lines and `SetEditorRow.tsx` another 832, and
/// most of that is a six-column HTML table fighting a 390 pt screen: SET,
/// PREVIOUS, KG, REPS, RPE, ✓, each one narrower than a thumb. The data
/// hierarchy is right and the layout is a spreadsheet.
///
/// ── ONE VERTICAL SCROLL, AND NO CHEVRONS ────────────────────────────────────
/// Wave 1 stacked every movement in one vertical scroll, each card with its own
/// expand chevron — so the screen you logged into was a list of eleven
/// accordions and the set in front of you was wherever you last left the
/// scroll. Wave 2.4 answered that by making the cards a horizontal DECK, one
/// page per movement, which fixed the accordions and cost the ability to look
/// ahead; §U puts the vertical scroll back and leaves the chevrons out, because
/// it was never the scrolling that was wrong. See `LiveLoggerView.deck`.
///
/// A card is therefore always open, always full height, and prints its position
/// in the header — `3 of 11` is what a scroll bar cannot say.
///
/// The row is the other half. It is 44 pt — the platform's own minimum, not a
/// number chosen here — and the tick button is gone: you log a set by pushing
/// it to the right, which is the gesture your thumb is already making and does
/// not require finding a 40 pt target while your hands shake.
struct ExerciseCardView: View {
    @Bindable var exercise: LoggerModel.ExerciseState
    let model: LoggerModel
    /// Where this movement sits in the deck, for the "3 of 11" register.
    let position: (index: Int, total: Int)

    @State private var editingNote = false
    @State private var noteDraft = ""

    @Environment(\.dynamicTypeSize) private var typeSize

    /// The muscle this movement is FOR — its first primary mover, which is what
    /// gives the card its rail colour. A card striped in the day's accent tells
    /// you which workout you are in, which you know; striped by muscle it tells
    /// you what the next twenty minutes are for.
    private var rail: Color {
        guard let token = exercise.plan.movers.primary.first,
              let muscle = LandmarkMuscle.from(token: token)
        else { return Color.onyx.day(model.day.key) }
        return Color.onyx.muscle(muscle)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider().overlay(Color.onyx.hairline)
            sets
        }
        .background(alignment: .leading) {
            // The rail, and the faintest wash of it across the card. A flat
            // stripe reads as decoration; a stripe whose colour bleeds two
            // millimetres into the surface reads as the card being MADE of that
            // material, which is the thing that makes a deck feel sorted rather
            // than striped.
            LinearGradient(colors: [rail.opacity(0.10), .clear], startPoint: .leading, endPoint: .trailing)
                .frame(width: 120)
        }
        .onyxGlass(.tile)
        .overlay(alignment: .leading) {
            UnevenRoundedRectangle(
                topLeadingRadius: OnyxCorner.tile, bottomLeadingRadius: OnyxCorner.tile,
                bottomTrailingRadius: 0, topTrailingRadius: 0, style: .continuous
            )
            .fill(rail)
            .frame(width: 3)
        }
        .clipShape(RoundedRectangle(cornerRadius: OnyxCorner.tile, style: .continuous))
        .animation(OnyxMotion.move, value: exercise.rows.count)
        .alert("Note", isPresented: $editingNote) {
            TextField("What happened on this lift?", text: $noteDraft)
            Button("Save") { exercise.note = noteDraft }
            Button("Cancel", role: .cancel) {}
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.s) {
            HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.s) {
                Text(exercise.name)
                    .onyxDisplay()
                    .foregroundStyle(Color.onyx.textPrimary)
                    // At AX5 "Single Arm Cable Cross-over" ran to five lines and
                    // pushed every set off the card. Three lines and a little
                    // optical shrink keeps the whole name AND the work it names.
                    .lineLimit(3)
                    .minimumScaleFactor(0.7)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: OnyxSpace.xs)
                Text("\(position.index + 1) of \(position.total)")
                    .onyxMicro()
                    .layoutPriority(1)
            }

            HStack(spacing: OnyxSpace.s) {
                repWindow
                // At an accessibility size a "Compound" chip and a "per arm"
                // chip cannot share a line with the rep window, and what they
                // truncated to was "…–…" and "per a…" — two chips saying
                // nothing, in the space of two that said something. They are
                // metadata; the rep window is the prescription.
                if !typeSize.isAccessibilitySize {
                    if exercise.plan.isCompound { tag("Compound", Color.onyx.textSecondary) }
                    if let note = exercise.plan.note { tag(note, rail) }
                }
                Spacer(minLength: 0)
                progress
            }
            .lineLimit(1)

            if !exercise.note.isEmpty {
                Text(exercise.note)
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(OnyxSpace.m)
    }

    @ViewBuilder
    private var progress: some View {
        if exercise.isComplete {
            Label("Done", systemImage: "checkmark.seal.fill")
                .onyxType(.caption).fontWeight(.semibold)
                .foregroundStyle(Color.onyx.good)
                .transition(.scale.combined(with: .opacity))
        } else {
            Text("\(exercise.workingSets)/\(exercise.plan.sets(for: model.phase))")
                .onyxType(.caption).fontWeight(.semibold).onyxNumeral()
                .foregroundStyle(Color.onyx.textSecondary)
        }
    }

    /// The double-progression window, with the CEILING called out.
    ///
    /// The floor is where the set starts and the ceiling is the thing you are
    /// trying to reach — "increase load only when ALL work sets hit the ceiling
    /// at RPE ≤ 8.5". Printing both in the same colour makes the rule invisible.
    @ViewBuilder
    private var repWindow: some View {
        if let window = exercise.plan.repWindow {
            HStack(spacing: 1) {
                Text("\(window.floor)").foregroundStyle(Color.onyx.textSecondary)
                Text("–").foregroundStyle(Color.onyx.textTertiary)
                Text("\(window.ceiling)").foregroundStyle(Color.onyx.accent(.train))
            }
            .onyxType(.caption).fontWeight(.semibold).onyxNumeral()
            .fixedSize()
            .padding(.horizontal, OnyxSpace.s)
            .padding(.vertical, OnyxSpace.xs)
            .onyxGlass(.row)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Rep window \(window.floor) to \(window.ceiling)")
        } else {
            tag(exercise.plan.reps, Color.onyx.textSecondary)
        }
    }

    private func tag(_ text: String, _ color: Color) -> some View {
        Text(text)
            .onyxType(.caption)
            .foregroundStyle(color)
            .fixedSize()
            .padding(.horizontal, OnyxSpace.s)
            .padding(.vertical, OnyxSpace.xs)
            .onyxGlass(.row)
    }

    // MARK: - Sets

    /// ── WHY THIS IS NOT A `ScrollView` ──────────────────────────────────────
    /// It was, and a scroll view takes every point of height it is offered — so
    /// a two-set movement drew a card with 900 pt of nothing under the last row,
    /// which is §3.6's "no tile taller than its content" in the file that was
    /// supposed to fix it. The card hugs its rows; the DECK PAGE around it is
    /// the scroll view, so a movement with eight sets still scrolls and one with
    /// two is two rows tall.
    private var sets: some View {
        VStack(spacing: OnyxSpace.xs) {
                columnHeaders
                ForEach(Array(exercise.rows.enumerated()), id: \.element.id) { index, row in
                    SetRowView(
                        row: row,
                        ordinal: index + 1,
                        rail: rail,
                        onLog: { model.toggleDone(row, in: exercise) },
                        onCommit: { model.commitEdit(row, in: exercise) },
                        onKind: { model.setKind($0, on: row, in: exercise) },
                        onQuality: { model.setQuality($0, on: row, in: exercise) },
                        onDuplicate: { withAnimation(OnyxMotion.move) { model.duplicate(row, in: exercise) } },
                        onNote: { noteDraft = exercise.note; editingNote = true },
                        onDelete: { withAnimation(OnyxMotion.move) { model.removeSet(row, from: exercise) } }
                    )
                }

                Button {
                    withAnimation(OnyxMotion.move) { model.addSet(to: exercise) }
                } label: {
                    Label("Add set", systemImage: "plus")
                        .onyxType(.secondary)
                        .foregroundStyle(Color.onyx.textSecondary)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .onyxGlass(.row)
                }
                .onyxPress(scale: 0.98)
            }
        // ── WHY THE GUTTER IS 4 AND NOT 8 ───────────────────────────────
        // A set row is a badge, two steppers and an effort word, and their
        // MINIMUM widths add up to within a few points of a 402 pt screen. Every
        // point of padding between the card's edge and the row is a point the
        // row takes back by overflowing — which it did, silently: the deck's own
        // 16 pt inset vanished and the cards drew edge to edge, because a
        // `ScrollView` does not clip an over-wide child, it just lets it win.
        // The gutters are the cheapest thing in that budget and the tap targets
        // are the most expensive, so the gutters pay.
        .padding(.horizontal, OnyxSpace.xs)
        .padding(.bottom, OnyxSpace.m)
    }

    /// What the columns are.
    ///
    /// The rows carried no header at all: a bare `47`, a `×` and a `12`, with
    /// the load's unit printed once per row and the rep count's not printed
    /// anywhere. It reads as an equation rather than as a table, and which
    /// number is which is something you infer from their size.
    ///
    /// The header does that work once, at the top of the card, in the register
    /// the read-only ledger already uses — so the row can keep printing bare
    /// numerals and stop repeating a unit the reader has been told.
    ///
    /// ── AND WHY IT IS ABSENT AT AN ACCESSIBILITY SIZE ───────────────────────
    /// There the row stacks the load OVER the reps, so there are no columns for
    /// a header to name; four labels over a two-line row would be a caption on
    /// a photograph of itself. The fields keep their own spoken labels, which is
    /// the thing that was actually load-bearing.
    @ViewBuilder
    private var columnHeaders: some View {
        if !typeSize.isAccessibilitySize {
            HStack(spacing: OnyxSpace.s) {
                head("Set").frame(width: SetColumn.badge)
                // Over the NUMERAL, not over the whole stepper. A label centred
                // on a control group sits between the field and the `+`, which
                // is nine points off the thing it names — and nine points is
                // exactly enough to make a reader check.
                head("kg")
                    .frame(width: SetColumn.weightField)
                    .padding(.horizontal, SetColumn.step)
                head("Reps")
                    .frame(width: SetColumn.repsField)
                    .padding(.horizontal, SetColumn.step)
                Spacer(minLength: 0)
                head("Effort").frame(width: SetColumn.effort, alignment: .trailing)
            }
            .padding(.horizontal, OnyxSpace.xs)
            .padding(.top, OnyxSpace.xs)
            .accessibilityHidden(true)
        }
    }

    /// `fixedSize` because the column it names is narrower than the word:
    /// `Reps` over a 32 pt rep field truncated to `RE…`, which is a header that
    /// has stopped being one. A label wider than its track overflows into the
    /// stepper's own padding either side and stays centred on the value, which
    /// is the only property that mattered.
    private func head(_ text: String) -> some View {
        Text(text)
            .onyxMicro()
            .lineLimit(1)
            .fixedSize()
            .multilineTextAlignment(.center)
    }
}

// MARK: - The columns

/// ── ONE SET OF WIDTHS, DECLARED ONCE ────────────────────────────────────────
/// The header and the rows under it are different views, and the only thing
/// that makes them a table is that they agree about their columns. Spelling the
/// widths twice is how they stop agreeing — a header reading `kg` over a column
/// of rep counts is worse than no header at all, and nothing in the type system
/// notices. The web app's `setGrid.ts` exists for exactly this reason and says
/// exactly this; this is its half.
private enum SetColumn {
    /// The badge: the platform's minimum target, and the row's identity.
    static let badge: CGFloat = 44
    /// A stepper end. 34 rather than 44 because four of them, a badge, two
    /// fields and an effort chip share 358 pt, and adjacent targets in a control
    /// GROUP are the one place the HIG lets a 44 pt square breathe sideways.
    static let step: CGFloat = 34
    static let weightField: CGFloat = 50
    static let repsField: CGFloat = 32
    /// The printed `kg`. Framed rather than left to size itself, or the header
    /// above it drifts by however wide the glyphs happen to render.
    static let unit: CGFloat = 18
    static let effort: CGFloat = 68

    static let weight: CGFloat = step * 2 + weightField + unit
    static let reps: CGFloat = step * 2 + repsField
}

// MARK: - One set

/// A set: 44 pt, and you log it by pushing it to the right.
///
/// ── WHY A GESTURE AND NOT A BUTTON ──────────────────────────────────────────
/// The tick was a 44 × 40 target at the far end of a row, reached with one hand
/// while the other one is still on a machine. A swipe has no target — the whole
/// row is the target — and it carries its own confirmation: the row moves under
/// the thumb the entire way, so the commit is something you FELT happening
/// rather than something you hope registered.
///
/// The three haptics are the ones §3.4 names and no others: `.impact(.rigid)`
/// the instant the row passes the point where releasing would log it (which is
/// the only moment the gesture has a state change to report), `.impact(.soft)`
/// on the commit, and `.success` on a record — all landing on the same frame as
/// the motion, because latency between the senses is what destroys the illusion
/// that the gesture caused the feedback.
private struct SetRowView: View {
    @Bindable var row: LoggerModel.SetRow
    let ordinal: Int
    let rail: Color
    let onLog: () -> Bool
    let onCommit: () -> Void
    let onKind: (LoggerModel.SetKind) -> Void
    let onQuality: (SetQuality?) -> Void
    let onDuplicate: () -> Void
    let onNote: () -> Void
    let onDelete: () -> Void

    @State private var dragX: CGFloat = 0
    @State private var armed = false
    @State private var justLogged = false
    @State private var showOptions = false
    /// The badge's own press state. It is not a `Button` any more — see `badge`
    /// — so the press scale a `buttonStyle` used to give it is driven from here.
    @State private var badgeDown = false
    /// Three separate counters because `.sensoryFeedback` fires on a CHANGE and
    /// the three events are independent — a rigid tap at the threshold must not
    /// be swallowed by a soft one that happens to land in the same frame.
    @State private var thresholdTicks = 0
    @State private var commitTicks = 0
    @State private var recordTicks = 0
    /// Its own counter: a duplicate is not a set logged, and §3.4 gives
    /// `.impact(.soft)` to the latter. A tile drop is the nearest thing this
    /// gesture is, and it takes the same weight.
    @State private var duplicateTicks = 0
    /// Detents only. It used to trigger on the VALUE, which fired on every
    /// keystroke into the field and on every programmatic rebuild.
    @State private var stepTicks = 0

    @Environment(\.dynamicTypeSize) private var typeSize

    /// How far the row must travel before releasing it logs the set. 64 pt is
    /// far enough that a thumb sliding down the deck does not trip it and near
    /// enough that the whole gesture stays inside one comfortable arc.
    private static let threshold: CGFloat = 64

    private var canLog: Bool { (row.reps ?? 0) > 0 }

    var body: some View {
        ZStack {
            affordances
            content
                .background(rowFill)
                .overlay { rowBorder }
                .clipShape(RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous))
                .offset(x: dragX)
                .gesture(swipe)
                // ── WHY THE LONG PRESS IS ON THE BACKGROUND ─────────────────
                // It was a `simultaneousGesture` on the row itself, and the row
                // CONTAINS the badge button, four steppers with
                // `buttonRepeatBehavior` and the RPE menu. `simultaneous` does
                // not wait for those to fail and `dragX` is 0 while a finger
                // rests on a button, so holding "+" to ramp 20 kg to 42.5 —
                // exactly what the repeat behaviour is for — inserted a
                // duplicate set at 0.45 s. Behind the controls, the gesture
                // only sees the parts of the row that are not a control.
                .background {
                    Color.clear
                        .contentShape(Rectangle())
                        .onLongPressGesture(minimumDuration: 0.45) {
                            guard abs(dragX) < 4 else { return }
                            onDuplicate()
                            duplicateTicks += 1
                        }
                }
        }
        .frame(minHeight: 44)
        .opacity(row.kind == .ghost ? 0.45 : 1)
        .animation(OnyxMotion.move, value: row.isDone)
        .animation(OnyxMotion.fade, value: justLogged)
        .sensoryFeedback(.impact(flexibility: .rigid), trigger: thresholdTicks)
        .sensoryFeedback(.impact(flexibility: .soft), trigger: commitTicks)
        .sensoryFeedback(.success, trigger: recordTicks)
        .sensoryFeedback(.impact(flexibility: .soft), trigger: duplicateTicks)
        .sensoryFeedback(.selection, trigger: stepTicks)
        .sheet(isPresented: $showOptions) {
            SetOptionsSheet(
                ordinal: ordinal, row: row,
                onKind: onKind, onQuality: onQuality, onNote: onNote,
                onDuplicate: onDuplicate, onDelete: onDelete
            )
        }
        .accessibilityElement(children: .contain)
    }

    // MARK: The row itself

    private var content: some View {
        HStack(spacing: OnyxSpace.s) {
            badge
            // Side by side until the type size says otherwise: at AX5 a load, a
            // rep count and four stepper targets cannot share one line, and a
            // row that truncates its own numbers is worse than one that is two
            // lines tall (§3.1 allows exactly that, and only that).
            if typeSize.isAccessibilitySize {
                // THE EFFORT COMES DOWN HERE TOO. It is a word now, and the
                // widest of them — "Challenging" — cannot share a line with an
                // AX5 load and its two steppers: pinned to the 68 pt column it
                // wears at a shipping size, it rendered as "Ch…", which is a
                // rating that has stopped being a rating. A third line costs
                // this row 30 pt at a size where it is already 120 tall.
                VStack(alignment: .leading, spacing: OnyxSpace.xs) {
                    weightField
                    repsField
                    rpe
                }
                .padding(.vertical, OnyxSpace.s)
                Spacer(minLength: 0)
            } else {
                // No `×` between them any more. It was the row's way of saying
                // which number was which, and the column headers say it better
                // and once — where this said it on all forty rows, in the 26 pt
                // that the effort word now uses to say something.
                weightField
                repsField
                Spacer(minLength: 0)
                if row.isRecord && row.isDone { record }
                rpe
            }
        }
        .padding(.horizontal, OnyxSpace.xs)
        .frame(minHeight: 44)
        .frame(maxWidth: .infinity)
    }

    /// The ordinal — and the tap path.
    ///
    /// The swipe is the gesture this row is built around; the badge is what
    /// makes it reachable without one. A logger you can only drive by dragging
    /// is a logger somebody with a tremor cannot use, and the state has to be
    /// drawn somewhere anyway.
    private var badge: some View {
        ZStack {
            RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous)
                .fill(row.isDone ? rail : Color.onyx.hairline)
            if row.isDone && row.kind == .normal {
                Image(systemName: "checkmark")
                    .onyxType(.caption).fontWeight(.heavy)
                    .foregroundStyle(Color.onyx.base)
            } else {
                Text(row.kind.badge ?? "\(ordinal)")
                    .onyxType(.caption).fontWeight(.bold).onyxNumeral()
                    .foregroundStyle(row.isDone ? Color.onyx.base : Color.onyx.textSecondary)
            }
        }
        .frame(width: 32, height: 32)
        // A set carrying a technique note says so, or the second axis is data
        // you can only see by opening the sheet that wrote it. A dot rather
        // than a chip: the row has no width for a sixth thing, and what the
        // note SAYS is a question, not a glance.
        .overlay(alignment: .topTrailing) {
            if row.quality != nil {
                Circle()
                    .fill(Color.onyx.accent(.train))
                    .frame(width: 6, height: 6)
                    .offset(x: 3, y: -3)
            }
        }
        .frame(width: SetColumn.badge, height: SetColumn.badge)
        .contentShape(Rectangle())
        .scaleEffect(badgeDown ? 0.9 : 1)
        .animation(OnyxMotion.flick, value: badgeDown)
        // ── WHY THIS IS NOT A `Button` ANY MORE ─────────────────────────────
        // It needs two gestures on one target: a tap that logs the set and a
        // hold that opens the set's options. A `Button` with a long press
        // attached is the arrangement `WaterRow` documents at length and does
        // not use — the two contend for the same touch sequence, and the two
        // outcomes are "the hold never fires" and "both fire", which here would
        // mean opening the options sheet on top of a set you just logged by
        // accident. So: a plain surface with both gestures, the press scale a
        // `buttonStyle` was giving it driven from `pressing:`, and the button
        // trait and default action put back by hand for VoiceOver.
        .onTapGesture { log() }
        .onLongPressGesture(
            minimumDuration: 0.45,
            pressing: { badgeDown = $0 },
            perform: { showOptions = true }
        )
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(
            (row.isDone ? "Set \(ordinal), logged" : "Set \(ordinal), not logged")
            + (row.kind == .normal ? "" : ", \(row.kind.label)")
            + (row.quality.map { ", \($0.label)" } ?? "")
            + (row.isRecord && row.isDone ? ". Personal record." : "")
        )
        .accessibilityHint("Tap to log. Hold for set options.")
        .accessibilityAction { log() }
        // The actions hang off the BADGE, not off the row.
        //
        // `.accessibilityElement(children: .contain)` makes the row a
        // container, and VoiceOver does not focus a container — so actions
        // attached there have no host, and duplicate, delete, note and set-kind
        // were reachable only by a long press and a swipe. Here they are on the
        // element a VoiceOver user is already sitting on.
        .accessibilityActions {
            Button("Duplicate set") { onDuplicate() }
            Button("Set options") { showOptions = true }
        }
    }

    private var weightField: some View {
        stepper(
            // ── THE UNIT MOVED UP ONE ROW ───────────────────────────────────
            // The header says `kg` once per card; printing it again on every
            // row is the same word forty times, in the width the effort rating
            // needs to be a word rather than a number. At an accessibility size
            // there IS no header — the row stacks and the columns stop existing
            // — so that is exactly where the unit is still worth its space.
            unit: "kg", showsUnit: typeSize.isAccessibilitySize,
            decrement: { row.weightKg = max(0, (row.weightKg ?? 0) - 2.5); step() },
            increment: { row.weightKg = (row.weightKg ?? 0) + 2.5; step() }
        ) {
            NumericField(
                value: $row.weightKg, unit: "kilograms", decimals: true,
                width: SetColumn.weightField, prominent: true, onCommit: onCommit
            )
        }
    }

    /// Reps take no printed unit: the `×` between the two fields is the unit,
    /// and "7.5 kg × 12 reps" says the same thing twice on a 44 pt row.
    private var repsField: some View {
        stepper(
            unit: "reps", showsUnit: false,
            decrement: { row.reps = max(0, (row.reps ?? 0) - 1); step() },
            increment: { row.reps = (row.reps ?? 0) + 1; step() }
        ) {
            NumericField(
                value: Binding(
                    get: { row.reps.map(Double.init) },
                    set: { row.reps = $0.map { Int($0.rounded()) } }
                ),
                unit: "reps", decimals: false,
                width: SetColumn.repsField, prominent: false, onCommit: onCommit
            )
        }
    }

    private func step() {
        stepTicks += 1
        onCommit()
    }

    /// A number with a minus and a plus around it.
    ///
    /// `buttonRepeatBehavior(.enabled)` is what makes it a stepper rather than
    /// two buttons: hold either end and it repeats, which is how you get from
    /// 20 kg to 42.5 without nine taps. The number itself stays a field, because
    /// a cable stack really is 13.75 kg and no step size reaches it.
    private func stepper<Field: View>(
        unit: String, showsUnit: Bool,
        decrement: @escaping () -> Void, increment: @escaping () -> Void,
        @ViewBuilder field: () -> Field
    ) -> some View {
        HStack(spacing: 0) {
            stepButton("minus", decrement)
            field()
            if showsUnit {
                Text(unit)
                    .onyxType(.micro)
                    .foregroundStyle(Color.onyx.textTertiary)
                    // `fixedSize` before the track: at AX5 `kg` in an 18 pt box
                    // wrapped to a `k` over a `g`, which is not a unit, it is a
                    // decoration. The track only exists to hold the column
                    // steady under its header, and at an accessibility size
                    // there is no header to hold it under.
                    .lineLimit(1)
                    .fixedSize()
                    .frame(width: typeSize.isAccessibilitySize ? nil : SetColumn.unit)
                    .accessibilityHidden(true)
            }
            stepButton("plus", increment)
        }
        .accessibilityElement(children: .contain)
    }

    private func stepButton(_ symbol: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .onyxType(.caption).fontWeight(.bold)
                .foregroundStyle(Color.onyx.textSecondary)
                // See `SetColumn.step` for why 34 and not 44 — the full 44 is
                // kept vertically.
                .frame(width: SetColumn.step, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .buttonRepeatBehavior(.enabled)
        .accessibilityLabel(symbol == "plus" ? "Increase" : "Decrease")
    }

    /// Effort, in WORDS.
    ///
    /// ── WHY THE NUMBER IS NO LONGER THE CONTROL ─────────────────────────────
    /// It was nine menu entries reading `10`, `9.5`, `9`, `8.5` … down to `6`.
    /// A number on a ten-point scale means nothing to anyone who has not
    /// memorised the scale, and the question being asked — how close to failure
    /// was that — has an answer everyone can give in words and almost nobody can
    /// give in decimals. `RPE_LADDER` in the web app answered it eight ways and
    /// this is the same eight, the same stored values, so a set rated here and a
    /// set rated there are the same row: see `RpeLadder`.
    ///
    /// The reps-in-reserve gloss rides along as each entry's subtitle, because
    /// "2 left" is the thing you can actually count.
    ///
    /// A `Menu` rather than a hand-built picker: effort is chosen far less often
    /// than the load, and the system's own menu is already interruptible,
    /// accessible and familiar. The stored value is untouched — a row holding a
    /// legacy 7 still renders through `RpeLadder.label`'s CR-10 fallback rather
    /// than as a dash.
    private var rpe: some View {
        Menu {
            // Hardest first: the ladder's top is where a working set lands, and
            // a menu you have to run to the bottom of to say "Failure" is a menu
            // that costs more the harder the set was.
            ForEach(RpeLadder.stops.reversed()) { stop in
                Button {
                    row.rpe = stop.value
                    stepTicks += 1
                    onCommit()
                } label: {
                    Text(stop.label)
                    Text(stop.hint)
                }
            }
            Divider()
            Button("Not rated", role: .destructive) { row.rpe = nil; stepTicks += 1; onCommit() }
        } label: {
            Text(RpeLadder.label(row.rpe) ?? "Effort")
                .onyxType(.caption).fontWeight(.bold)
                .foregroundStyle(row.rpe.map(Color.onyx.effort) ?? Color.onyx.textTertiary)
                // One line, always. "Max Effort" is the longest rung and the
                // column is sized for it; a rating that wraps takes the row's
                // height with it, and forty of those is a card you scroll past
                // the set you are standing in front of.
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .multilineTextAlignment(typeSize.isAccessibilitySize ? .leading : .trailing)
                // A fixed track only where there is a header over it to line up
                // with. On the stacked accessibility row there are no columns,
                // so the word takes the width it needs.
                .frame(
                    width: typeSize.isAccessibilitySize ? nil : SetColumn.effort,
                    alignment: typeSize.isAccessibilitySize ? .leading : .trailing
                )
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Effort")
        .accessibilityValue(RpeLadder.readout(row.rpe) ?? "Not rated")
    }

    /// A record, stated in gold and nowhere else.
    private var record: some View {
        Image(systemName: "trophy.fill")
            .onyxType(.caption)
            .foregroundStyle(Color.onyx.record)
            .transition(.scale(scale: 0.5).combined(with: .opacity))
            .accessibilityLabel("Personal record")
    }

    // MARK: Surfaces

    private var rowFill: some View {
        // Good for 300 ms after a commit, then back to the rail's own wash. The
        // flash is the receipt: the row you pushed is the row that changed
        // colour, which no toast at the top of a screen can say.
        RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous)
            .fill(justLogged ? Color.onyx.good.opacity(0.22)
                  : row.isDone ? rail.opacity(0.10)
                  : Color.onyx.hairline.opacity(0.35))
    }

    @ViewBuilder
    private var rowBorder: some View {
        let shape = RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous)
        if row.isRecord && row.isDone {
            // The gold sweep. A record is the one thing on this screen worth
            // interrupting the eye for, and it is a moving highlight rather
            // than a static border so it reads as an ANNOUNCEMENT that then
            // settles, instead of a decoration the row is wearing.
            shape.strokeBorder(
                LinearGradient(
                    colors: [Color.onyx.record.opacity(0.35), Color.onyx.record, Color.onyx.record.opacity(0.35)],
                    startPoint: .leading, endPoint: .trailing
                ),
                lineWidth: 1
            )
            .phaseAnimator([0.35, 1.0], trigger: recordTicks) { border, phase in
                border.opacity(phase)
            } animation: { _ in .easeOut(duration: 0.45) }
        } else if armed {
            shape.strokeBorder(Color.onyx.good, lineWidth: 1)
        }
    }

    /// What the row is sliding to reveal. Drawn UNDER the row rather than beside
    /// it, so the row itself is the only thing that moves.
    private var affordances: some View {
        HStack {
            Label(row.isDone ? "Undo" : "Log", systemImage: row.isDone ? "arrow.uturn.backward" : "checkmark")
                .foregroundStyle(Color.onyx.good)
                .opacity(min(1, max(0, dragX / Self.threshold)))
            Spacer(minLength: 0)
            Label("Options", systemImage: "ellipsis.circle")
                .foregroundStyle(Color.onyx.textSecondary)
                .opacity(min(1, max(0, -dragX / Self.threshold)))
        }
        .onyxType(.caption).fontWeight(.semibold)
        .labelStyle(.iconOnly)
        .padding(.horizontal, OnyxSpace.m)
        .accessibilityHidden(true)
    }

    // MARK: The gesture

    private var swipe: some Gesture {
        DragGesture(minimumDistance: 10)
            .onChanged { value in
                // Vertical intent belongs to the scroll view under this row.
                guard abs(value.translation.width) > abs(value.translation.height) else {
                    // Turning the drag into a vertical one ABANDONS it. The
                    // guard used to just return, which froze `armed` at
                    // whatever the horizontal part had reached — so a swipe you
                    // changed your mind about still logged the set on release,
                    // and the row stayed offset under the finger the whole way.
                    if armed || dragX != 0 {
                        armed = false
                        withAnimation(OnyxMotion.flick) { dragX = 0 }
                    }
                    return
                }
                dragX = Self.track(value.translation.width)
                let crossed = abs(dragX) >= Self.threshold
                if crossed != armed {
                    armed = crossed
                    if crossed { thresholdTicks += 1 }
                }
            }
            .onEnded { _ in
                let committed = armed
                let direction = dragX
                armed = false
                withAnimation(OnyxMotion.flick) { dragX = 0 }
                guard committed else { return }
                if direction > 0 { log() } else { showOptions = true }
            }
    }

    /// 1:1 until the row has said yes, then resistance.
    ///
    /// A real thing slows before it stops (apple-design §9). A row that kept
    /// following the finger to the edge of the screen would read as something
    /// you could throw away, which is not what this gesture does.
    private static func track(_ raw: CGFloat) -> CGFloat {
        let magnitude = abs(raw)
        guard magnitude > threshold else { return raw }
        let over = magnitude - threshold
        let damped = threshold + over * 0.35 / (1 + over / 90)
        return raw < 0 ? -damped : damped
    }

    private func log() {
        // The badge used to be a `Button` and carried `.disabled(!canLog &&
        // !row.isDone)`. It is not one any more — a disabled view takes no
        // gestures at all, which would have taken the HOLD with it, and setting
        // a set to be a warm-up before you perform it is exactly the moment you
        // want the options. So the refusal moved here, where it only stops the
        // tap: no event, and no haptic claiming one was written.
        guard canLog || row.isDone else { return }
        let wasRecord = row.isRecord
        let became = onLog()
        commitTicks += 1
        guard became else { return }
        if row.isRecord && !wasRecord { recordTicks += 1 }
        justLogged = true
        Task {
            try? await Task.sleep(for: .milliseconds(300))
            justLogged = false
        }
    }

}

// MARK: - Numeric entry

/// A load or a rep count, typed.
///
/// ── WHY IT KEEPS ITS OWN STRING ─────────────────────────────────────────────
/// Binding a `TextField` straight to a `Double?` through a formatter makes "49."
/// unrepresentable: the moment the decimal point is typed the value is still 49,
/// the formatter re-renders "49", and the point you just typed disappears from
/// under the cursor. The field therefore owns the text and publishes the parsed
/// value, which is the only arrangement where a half-typed number survives.
///
/// Both separators are accepted. The device's own locale here formats 1074.0 as
/// "1 074,0", and a keypad that produces a comma the parser rejects is a keypad
/// that silently discards decimals.
private struct NumericField: View {
    @Binding var value: Double?
    /// Spoken, not printed. The row prints "kg" once and nothing for reps; a
    /// VoiceOver user gets both, because there is no `×` to hear.
    let unit: String
    let decimals: Bool
    let width: CGFloat
    /// The load is the number you decide; the rep count is the number you
    /// achieve. Same size, different weight — enough that a glance at a row
    /// lands on the load first, and not so much that the reps read as a caption
    /// on it. With the column headers above them, that is all the distinction
    /// this needs: it used to be no distinction at all.
    let prominent: Bool
    let onCommit: () -> Void

    @State private var text: String = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextField("—", text: $text)
            .keyboardType(decimals ? .decimalPad : .numberPad)
            .multilineTextAlignment(.center)
            .onyxType(.body).fontWeight(prominent ? .semibold : .regular).onyxNumeral()
            .foregroundStyle(value == nil ? Color.onyx.textTertiary : Color.onyx.textPrimary)
            .frame(minWidth: width)
            .fixedSize(horizontal: true, vertical: false)
            .focused($focused)
            .accessibilityLabel(unit)
            .onAppear { text = Self.render(value) }
            .onChange(of: text) { _, next in value = Self.parse(next) }
            .onChange(of: focused) { _, isFocused in
                if !isFocused {
                    text = Self.render(value)
                    onCommit()
                }
            }
            // A value changed from outside the field (a stepper, a phase
            // rebuild, a row restored from the log) has to reach the text, or
            // the field keeps showing the number it was seeded with.
            .onChange(of: value) { _, next in
                guard !focused else { return }
                text = Self.render(next)
            }
            .toolbar {
                if focused {
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button("Done") { focused = false }
                    }
                }
            }
    }

    private static func render(_ value: Double?) -> String {
        guard let value else { return "" }
        return OnyxFormat.kg(value)
    }

    /// ── WHY THIS CLAMPS ────────────────────────────────────────────────────
    /// `Double("99999999999999999999")` is 1e20, and the reps binding rounds
    /// that into an `Int` — which TRAPS above `Int.max` (9.22e18). A `.numberPad`
    /// has no length limit, so holding a finger on the `9` key crashed the app
    /// mid-set. `Double("1e999")` is `+infinity` and traps the same way, and
    /// `.nan` compares false against every bound, so it is rejected first.
    ///
    /// The bound is deliberately absurd rather than domain-tight: a real limit
    /// belongs to the field's owner (reps and kilograms disagree about it), and
    /// silently rewriting someone's 200 into a 20 mid-entry is worse than
    /// letting an implausible number through. This only has to keep the cast
    /// safe.
    private static let limit = 100_000.0

    private static func parse(_ text: String) -> Double? {
        let normalised = text.replacingOccurrences(of: ",", with: ".")
        guard !normalised.isEmpty, let value = Double(normalised), value.isFinite else { return nil }
        return min(max(value, -limit), limit)
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Exercise card") {
    let model = LoggerModel.previewUpperB(logged: true)
    return ExerciseCardView(exercise: model.exercises[1], model: model, position: (1, model.exercises.count))
        .padding(OnyxSpace.l)
        .frame(maxHeight: .infinity)
        .onyxScreen(.train)
}
#endif
