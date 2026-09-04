import SwiftUI
import HelixUI
import HelixCore

/// One movement, and the sets you are logging into it — a single page of the
/// deck.
///
/// ── WHAT THE WEB CARD WAS, AND WHAT THIS IS INSTEAD ─────────────────────────
/// `ExerciseCard.tsx` is 1,435 lines and `SetEditorRow.tsx` another 832, and
/// most of that is a six-column HTML table fighting a 390 pt screen: SET,
/// PREVIOUS, KG, REPS, RPE, ✓, each one narrower than a thumb. The data
/// hierarchy is right and the layout is a spreadsheet.
///
/// ── AND WHAT WAVE 2.4 CHANGED ───────────────────────────────────────────────
/// Wave 1 stacked every movement in one vertical scroll, each card with its own
/// expand chevron — so the screen you logged into was a list of eleven
/// accordions and the set in front of you was wherever you last left the
/// scroll. A workout is not a list you browse, it is ONE movement at a time, so
/// the cards are a deck: the current one at full size, the next one peeking,
/// and no chevrons because a page of a deck is never collapsed.
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
        else { return Color.helix.day(model.day.key) }
        return Color.helix.muscle(muscle)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider().overlay(Color.helix.hairline)
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
        .helixGlass(.tile)
        .overlay(alignment: .leading) {
            UnevenRoundedRectangle(
                topLeadingRadius: HelixCorner.tile, bottomLeadingRadius: HelixCorner.tile,
                bottomTrailingRadius: 0, topTrailingRadius: 0, style: .continuous
            )
            .fill(rail)
            .frame(width: 3)
        }
        .clipShape(RoundedRectangle(cornerRadius: HelixCorner.tile, style: .continuous))
        .animation(HelixMotion.move, value: exercise.rows.count)
        .alert("Note", isPresented: $editingNote) {
            TextField("What happened on this lift?", text: $noteDraft)
            Button("Save") { exercise.note = noteDraft }
            Button("Cancel", role: .cancel) {}
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: HelixSpace.s) {
            HStack(alignment: .firstTextBaseline, spacing: HelixSpace.s) {
                Text(exercise.name)
                    .helixDisplay()
                    .foregroundStyle(Color.helix.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: HelixSpace.xs)
                Text("\(position.index + 1) of \(position.total)")
                    .helixMicro()
                    .layoutPriority(1)
            }

            HStack(spacing: HelixSpace.s) {
                repWindow
                // At an accessibility size a "Compound" chip and a "per arm"
                // chip cannot share a line with the rep window, and what they
                // truncated to was "…–…" and "per a…" — two chips saying
                // nothing, in the space of two that said something. They are
                // metadata; the rep window is the prescription.
                if !typeSize.isAccessibilitySize {
                    if exercise.plan.isCompound { tag("Compound", Color.helix.textSecondary) }
                    if let note = exercise.plan.note { tag(note, rail) }
                }
                Spacer(minLength: 0)
                progress
            }
            .lineLimit(1)

            if !exercise.note.isEmpty {
                Text(exercise.note)
                    .helixType(.caption)
                    .foregroundStyle(Color.helix.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(HelixSpace.m)
    }

    @ViewBuilder
    private var progress: some View {
        if exercise.isComplete {
            Label("Done", systemImage: "checkmark.seal.fill")
                .helixType(.caption).fontWeight(.semibold)
                .foregroundStyle(Color.helix.good)
                .transition(.scale.combined(with: .opacity))
        } else {
            Text("\(exercise.workingSets)/\(exercise.plan.sets(for: model.phase))")
                .helixType(.caption).fontWeight(.semibold).helixNumeral()
                .foregroundStyle(Color.helix.textSecondary)
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
                Text("\(window.floor)").foregroundStyle(Color.helix.textSecondary)
                Text("–").foregroundStyle(Color.helix.textTertiary)
                Text("\(window.ceiling)").foregroundStyle(Color.helix.accent(.train))
            }
            .helixType(.caption).fontWeight(.semibold).helixNumeral()
            .fixedSize()
            .padding(.horizontal, HelixSpace.s)
            .padding(.vertical, HelixSpace.xs)
            .helixGlass(.row)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Rep window \(window.floor) to \(window.ceiling)")
        } else {
            tag(exercise.plan.reps, Color.helix.textSecondary)
        }
    }

    private func tag(_ text: String, _ color: Color) -> some View {
        Text(text)
            .helixType(.caption)
            .foregroundStyle(color)
            .fixedSize()
            .padding(.horizontal, HelixSpace.s)
            .padding(.vertical, HelixSpace.xs)
            .helixGlass(.row)
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
        VStack(spacing: HelixSpace.xs) {
                ForEach(Array(exercise.rows.enumerated()), id: \.element.id) { index, row in
                    SetRowView(
                        row: row,
                        ordinal: index + 1,
                        rail: rail,
                        onLog: { model.toggleDone(row, in: exercise) },
                        onCommit: { model.commitEdit(row, in: exercise) },
                        onKind: { model.setKind($0, on: row, in: exercise) },
                        onDuplicate: { withAnimation(HelixMotion.move) { model.duplicate(row, in: exercise) } },
                        onNote: { noteDraft = exercise.note; editingNote = true },
                        onDelete: { withAnimation(HelixMotion.move) { model.removeSet(row, from: exercise) } }
                    )
                }

                Button {
                    withAnimation(HelixMotion.move) { model.addSet(to: exercise) }
                } label: {
                    Label("Add set", systemImage: "plus")
                        .helixType(.secondary)
                        .foregroundStyle(Color.helix.textSecondary)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .helixGlass(.row)
                }
                .helixPress(scale: 0.98)
            }
        .padding(.horizontal, HelixSpace.s)
        .padding(.bottom, HelixSpace.m)
    }
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
    let onDuplicate: () -> Void
    let onNote: () -> Void
    let onDelete: () -> Void

    @State private var dragX: CGFloat = 0
    @State private var armed = false
    @State private var justLogged = false
    @State private var showOptions = false
    /// Three separate counters because `.sensoryFeedback` fires on a CHANGE and
    /// the three events are independent — a rigid tap at the threshold must not
    /// be swallowed by a soft one that happens to land in the same frame.
    @State private var thresholdTicks = 0
    @State private var commitTicks = 0
    @State private var recordTicks = 0

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
                .clipShape(RoundedRectangle(cornerRadius: HelixCorner.row, style: .continuous))
                .offset(x: dragX)
                .gesture(swipe)
                .simultaneousGesture(
                    // Only when the row is standing still: a slow drag also
                    // passes half a second, and duplicating a set because you
                    // paused mid-swipe is a set you have to find and delete.
                    LongPressGesture(minimumDuration: 0.45).onEnded { _ in
                        guard abs(dragX) < 4 else { return }
                        onDuplicate()
                        commitTicks += 1
                    }
                )
        }
        .frame(minHeight: 44)
        .opacity(row.kind == .ghost ? 0.45 : 1)
        .animation(HelixMotion.move, value: row.isDone)
        .animation(HelixMotion.fade, value: justLogged)
        .sensoryFeedback(.impact(flexibility: .rigid), trigger: thresholdTicks)
        .sensoryFeedback(.impact(flexibility: .soft), trigger: commitTicks)
        .sensoryFeedback(.success, trigger: recordTicks)
        .confirmationDialog("Set \(ordinal)", isPresented: $showOptions, titleVisibility: .visible) {
            Button("Add a note") { onNote() }
            Button("Duplicate set") { onDuplicate() }
            Divider()
            ForEach(LoggerModel.SetKind.allCases, id: \.self) { kind in
                if kind != row.kind { Button(Self.name(kind)) { onKind(kind) } }
            }
            Divider()
            Button("Delete set", role: .destructive) { onDelete() }
        }
        .accessibilityElement(children: .contain)
        .accessibilityActions {
            Button(row.isDone ? "Undo set" : "Log set") { log() }
            Button("Duplicate set") { onDuplicate() }
            Button("Set options") { showOptions = true }
        }
    }

    // MARK: The row itself

    private var content: some View {
        HStack(spacing: HelixSpace.s) {
            badge
            // Side by side until the type size says otherwise: at AX5 a load, a
            // rep count and four stepper targets cannot share one line, and a
            // row that truncates its own numbers is worse than one that is two
            // lines tall (§3.1 allows exactly that, and only that).
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: HelixSpace.xs) {
                    weightField
                    repsField
                }
                .padding(.vertical, HelixSpace.s)
            } else {
                weightField
                Text("×")
                    .helixType(.caption)
                    .foregroundStyle(Color.helix.textTertiary)
                repsField
            }
            Spacer(minLength: 0)
            if row.isRecord && row.isDone { record }
            rpe
        }
        .padding(.horizontal, HelixSpace.s)
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
        Button { log() } label: {
            ZStack {
                RoundedRectangle(cornerRadius: HelixCorner.row, style: .continuous)
                    .fill(row.isDone ? rail : Color.helix.hairline)
                if row.isDone && row.kind == .normal {
                    Image(systemName: "checkmark")
                        .helixType(.caption).fontWeight(.heavy)
                        .foregroundStyle(Color.helix.base)
                } else {
                    Text(row.kind.badge ?? "\(ordinal)")
                        .helixType(.caption).fontWeight(.bold).helixNumeral()
                        .foregroundStyle(row.isDone ? Color.helix.base : Color.helix.textSecondary)
                }
            }
            .frame(width: 30, height: 30)
        }
        .helixPress(scale: 0.9)
        .disabled(!canLog && !row.isDone)
        .accessibilityLabel(row.isDone ? "Set \(ordinal), logged" : "Set \(ordinal), not logged")
    }

    private var weightField: some View {
        stepper(
            value: row.weightKg, unit: "kg",
            decrement: { row.weightKg = max(0, (row.weightKg ?? 0) - 2.5); onCommit() },
            increment: { row.weightKg = (row.weightKg ?? 0) + 2.5; onCommit() }
        ) {
            NumericField(value: $row.weightKg, decimals: true, width: 54, onCommit: onCommit)
        }
    }

    private var repsField: some View {
        stepper(
            value: row.reps.map(Double.init), unit: "reps",
            decrement: { row.reps = max(0, (row.reps ?? 0) - 1); onCommit() },
            increment: { row.reps = (row.reps ?? 0) + 1; onCommit() }
        ) {
            NumericField(
                value: Binding(
                    get: { row.reps.map(Double.init) },
                    set: { row.reps = $0.map { Int($0.rounded()) } }
                ),
                decimals: false, width: 34, onCommit: onCommit
            )
        }
    }

    /// A number with a minus and a plus around it.
    ///
    /// `buttonRepeatBehavior(.enabled)` is what makes it a stepper rather than
    /// two buttons: hold either end and it repeats, which is how you get from
    /// 20 kg to 42.5 without nine taps. The number itself stays a field, because
    /// a cable stack really is 13.75 kg and no step size reaches it.
    private func stepper<Field: View>(
        value: Double?, unit: String,
        decrement: @escaping () -> Void, increment: @escaping () -> Void,
        @ViewBuilder field: () -> Field
    ) -> some View {
        HStack(spacing: 0) {
            stepButton("minus", decrement)
            field()
            stepButton("plus", increment)
        }
        .sensoryFeedback(.selection, trigger: value)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(unit)
    }

    private func stepButton(_ symbol: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .helixType(.caption).fontWeight(.bold)
                .foregroundStyle(Color.helix.textSecondary)
                .frame(width: 28, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .buttonRepeatBehavior(.enabled)
        .accessibilityLabel(symbol == "plus" ? "Increase" : "Decrease")
    }

    /// Effort, on the CR-10 ladder. A `Menu` rather than a hand-built picker: it
    /// is chosen far less often than the load, and the system's own menu is
    /// already interruptible, accessible and familiar.
    private var rpe: some View {
        Menu {
            Button("Not rated") { row.rpe = nil; onCommit() }
            ForEach(Array(stride(from: 10.0, through: 6.0, by: -0.5)), id: \.self) { value in
                Button(HelixFormat.rpe(value)) { row.rpe = value; onCommit() }
            }
        } label: {
            Text(row.rpe.map(HelixFormat.rpe) ?? "RPE")
                .helixType(.caption).fontWeight(.bold).helixNumeral()
                .foregroundStyle(row.rpe.map(Color.helix.effort) ?? Color.helix.textTertiary)
                .frame(minWidth: 34, minHeight: 44)
        }
        .accessibilityLabel("Effort")
        .accessibilityValue(row.rpe.map { "RPE \(HelixFormat.rpe($0))" } ?? "Not rated")
    }

    /// A record, stated in gold and nowhere else.
    private var record: some View {
        Image(systemName: "trophy.fill")
            .helixType(.caption)
            .foregroundStyle(Color.helix.record)
            .transition(.scale(scale: 0.5).combined(with: .opacity))
            .accessibilityLabel("Personal record")
    }

    // MARK: Surfaces

    private var rowFill: some View {
        // Good for 300 ms after a commit, then back to the rail's own wash. The
        // flash is the receipt: the row you pushed is the row that changed
        // colour, which no toast at the top of a screen can say.
        RoundedRectangle(cornerRadius: HelixCorner.row, style: .continuous)
            .fill(justLogged ? Color.helix.good.opacity(0.22)
                  : row.isDone ? rail.opacity(0.10)
                  : Color.helix.hairline.opacity(0.35))
    }

    @ViewBuilder
    private var rowBorder: some View {
        let shape = RoundedRectangle(cornerRadius: HelixCorner.row, style: .continuous)
        if row.isRecord && row.isDone {
            // The gold sweep. A record is the one thing on this screen worth
            // interrupting the eye for, and it is a moving highlight rather
            // than a static border so it reads as an ANNOUNCEMENT that then
            // settles, instead of a decoration the row is wearing.
            shape.strokeBorder(
                LinearGradient(
                    colors: [Color.helix.record.opacity(0.35), Color.helix.record, Color.helix.record.opacity(0.35)],
                    startPoint: .leading, endPoint: .trailing
                ),
                lineWidth: 1
            )
            .phaseAnimator([0.35, 1.0], trigger: recordTicks) { border, phase in
                border.opacity(phase)
            } animation: { _ in .easeOut(duration: 0.45) }
        } else if armed {
            shape.strokeBorder(Color.helix.good, lineWidth: 1)
        }
    }

    /// What the row is sliding to reveal. Drawn UNDER the row rather than beside
    /// it, so the row itself is the only thing that moves.
    private var affordances: some View {
        HStack {
            Label(row.isDone ? "Undo" : "Log", systemImage: row.isDone ? "arrow.uturn.backward" : "checkmark")
                .foregroundStyle(Color.helix.good)
                .opacity(min(1, max(0, dragX / Self.threshold)))
            Spacer(minLength: 0)
            Label("Options", systemImage: "ellipsis.circle")
                .foregroundStyle(Color.helix.textSecondary)
                .opacity(min(1, max(0, -dragX / Self.threshold)))
        }
        .helixType(.caption).fontWeight(.semibold)
        .labelStyle(.iconOnly)
        .padding(.horizontal, HelixSpace.m)
        .accessibilityHidden(true)
    }

    // MARK: The gesture

    private var swipe: some Gesture {
        DragGesture(minimumDistance: 10)
            .onChanged { value in
                // Vertical intent belongs to the scroll view under this row.
                guard abs(value.translation.width) > abs(value.translation.height) else { return }
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
                withAnimation(HelixMotion.flick) { dragX = 0 }
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

    private static func name(_ kind: LoggerModel.SetKind) -> String {
        switch kind {
        case .normal:  "Working set"
        case .warmup:  "Warm-up"
        case .failure: "To failure"
        case .dropset: "Drop set"
        case .ghost:   "Skipped"
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
    let decimals: Bool
    let width: CGFloat
    let onCommit: () -> Void

    @State private var text: String = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextField("—", text: $text)
            .keyboardType(decimals ? .decimalPad : .numberPad)
            .multilineTextAlignment(.center)
            .helixType(.body).fontWeight(.semibold).helixNumeral()
            .foregroundStyle(value == nil ? Color.helix.textTertiary : Color.helix.textPrimary)
            .frame(minWidth: width)
            .fixedSize(horizontal: true, vertical: false)
            .focused($focused)
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
        return HelixFormat.kg(value)
    }

    private static func parse(_ text: String) -> Double? {
        let normalised = text.replacingOccurrences(of: ",", with: ".")
        guard !normalised.isEmpty else { return nil }
        return Double(normalised)
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Exercise card") {
    let model = LoggerModel.previewUpperB(logged: true)
    return ExerciseCardView(exercise: model.exercises[1], model: model, position: (1, model.exercises.count))
        .padding(HelixSpace.l)
        .frame(maxHeight: .infinity)
        .helixScreen(.train)
}
#endif
