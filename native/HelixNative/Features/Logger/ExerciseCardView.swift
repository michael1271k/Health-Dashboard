import SwiftUI
import HelixUI
import HelixCore

/// One movement, and the sets you are logging into it.
///
/// ── WHAT THE WEB CARD WAS, AND WHAT THIS IS INSTEAD ─────────────────────────
/// `ExerciseCard.tsx` is 1,435 lines and `SetEditorRow.tsx` another 832, and
/// most of that is a six-column HTML table fighting a 390 pt screen: SET,
/// PREVIOUS, KG, REPS, RPE, ✓, each one narrower than a thumb. The data
/// hierarchy is right and the layout is a spreadsheet.
///
/// So the hierarchy survives and the table does not. A row is now: the ordinal
/// as a chip, the numbers you TYPE at full size in the middle, the two you
/// merely READ (last time, effort) shrunk to their real importance, and a tick
/// target big enough to hit with a chalked hand. Everything responds on
/// touch-down, because the moment lag appears directness falls off a cliff.
struct ExerciseCardView: View {
    @Bindable var exercise: LoggerModel.ExerciseState
    let model: LoggerModel
    let accent: Color

    @State private var isEditingNote = false

    /// The muscle this movement is FOR — its first primary mover, which is what
    /// gives the card its rail colour. A card striped in the day's accent tells
    /// you which workout you are in, which you know; striped by muscle it tells
    /// you what the next twenty minutes are for.
    private var railColor: Color {
        guard let token = exercise.plan.movers.primary.first,
              let muscle = LandmarkMuscle.from(token: token)
        else { return accent }
        return HelixPalette.muscle(muscle)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            if exercise.isExpanded {
                Divider().overlay(HelixPalette.cardBorder).padding(.horizontal, 14)
                sets
            }
        }
        .background(alignment: .leading) {
            // The rail, and the faintest wash of it across the card. A flat
            // stripe reads as decoration; a stripe whose colour bleeds two
            // millimetres into the surface reads as the card being MADE of that
            // material, which is the thing that makes a list of cards feel
            // sorted rather than striped.
            LinearGradient(
                colors: [railColor.opacity(0.13), .clear],
                startPoint: .leading, endPoint: .trailing
            )
            .frame(width: 120)
        }
        .helixCard()
        .overlay(alignment: .leading) {
            UnevenRoundedRectangle(
                topLeadingRadius: HelixRadius.xxl, bottomLeadingRadius: HelixRadius.xxl,
                bottomTrailingRadius: 0, topTrailingRadius: 0, style: .continuous
            )
            .fill(railColor)
            .frame(width: 3)
        }
        .clipShape(RoundedRectangle(cornerRadius: HelixRadius.xxl, style: .continuous))
        .animation(HelixMotion.move, value: exercise.isExpanded)
        .animation(HelixMotion.move, value: exercise.rows.count)
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(exercise.name)
                    .helixText(.fluidLG, weight: .semibold, leading: .none)
                    .foregroundStyle(HelixPalette.text)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer(minLength: 4)

                if let rest = exercise.plan.restSec {
                    Button {
                        model.startRest(for: exercise)
                    } label: {
                        Label(Self.clock(rest), systemImage: "timer")
                            .helixText(.small, weight: .semibold, leading: .none)
                            .labelStyle(.titleAndIcon)
                            .foregroundStyle(HelixPalette.muted)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 6)
                            .helixRow(radius: HelixRadius.lg)
                    }
                    .helixPress()
                    .accessibilityLabel("Start \(rest) second rest")
                }

                Button {
                    withAnimation(HelixMotion.move) { exercise.isExpanded.toggle() }
                } label: {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .bold))
                        .rotationEffect(.degrees(exercise.isExpanded ? 180 : 0))
                        .foregroundStyle(HelixPalette.dim)
                        .frame(width: 30, height: 30)
                }
                .helixPress(scale: 0.88)
                .accessibilityLabel(exercise.isExpanded ? "Collapse" : "Expand")
            }

            HStack(spacing: 6) {
                repWindowChip
                if exercise.plan.isCompound { tag("COMPOUND", HelixPalette.steel) }
                if let note = exercise.plan.note { tag(note.uppercased(), railColor) }
                Spacer(minLength: 0)
                if exercise.isComplete {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 13))
                        .foregroundStyle(HelixPalette.emerald)
                        .transition(.scale.combined(with: .opacity))
                } else {
                    Text("\(exercise.workingSets)/\(exercise.plan.sets(for: model.phase))")
                        .helixText(.small, weight: .semibold, leading: .none)
                        .helixNumber()
                        .foregroundStyle(HelixPalette.dim)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 13)
        .padding(.bottom, exercise.isExpanded ? 11 : 13)
    }

    /// The double-progression window, with the CEILING called out.
    ///
    /// The floor is where the set starts and the ceiling is the thing you are
    /// trying to reach — "increase load only when ALL work sets hit the ceiling
    /// at RPE <= 8.5". Printing both in the same colour makes the rule invisible.
    @ViewBuilder
    private var repWindowChip: some View {
        if let window = exercise.plan.repWindow {
            HStack(spacing: 2) {
                Text("\(window.floor)")
                    .foregroundStyle(HelixPalette.muted)
                Text("–").foregroundStyle(HelixPalette.dim)
                Text("\(window.ceiling)")
                    .foregroundStyle(HelixPalette.amber)
            }
            .helixText(.small, weight: .semibold, leading: .none)
            .helixNumber()
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .helixRow(radius: HelixRadius.md)
        } else {
            tag(exercise.plan.reps.uppercased(), HelixPalette.steel)
        }
    }

    private func tag(_ text: String, _ color: Color) -> some View {
        Text(text)
            .helixText(.micro, weight: .bold, leading: .none)
            .tracking(0.8)
            .foregroundStyle(color)
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .background(
                Capsule(style: .continuous).fill(color.alphaByte(0x1f))
            )
            .overlay(
                Capsule(style: .continuous).strokeBorder(color.alphaByte(0x44), lineWidth: 0.75)
            )
    }

    // MARK: - Sets

    private var sets: some View {
        VStack(spacing: 6) {
            ForEach(Array(exercise.rows.enumerated()), id: \.element.id) { index, row in
                SetRowView(
                    row: row,
                    ordinal: index + 1,
                    accent: railColor,
                    onToggle: { model.toggleDone(row, in: exercise) },
                    onCommit: { model.commitEdit(row, in: exercise) },
                    onKind: { model.setKind($0, on: row, in: exercise) },
                    onDelete: { withAnimation(HelixMotion.move) { model.removeSet(row, from: exercise) } }
                )
            }

            Button {
                withAnimation(HelixMotion.move) { model.addSet(to: exercise) }
            } label: {
                Label("Add set", systemImage: "plus")
                    .helixText(.compact, weight: .semibold, leading: .none)
                    .foregroundStyle(HelixPalette.muted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .background(
                        RoundedRectangle(cornerRadius: HelixRadius.xl, style: .continuous)
                            .fill(Color.white.opacity(0.03))
                    )
            }
            .helixPress(scale: 0.98)
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
        .padding(.bottom, 10)
    }

    private static func clock(_ seconds: Int) -> String {
        String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}

// MARK: - One set

private struct SetRowView: View {
    @Bindable var row: LoggerModel.SetRow
    let ordinal: Int
    let accent: Color
    let onToggle: () -> Void
    let onCommit: () -> Void
    let onKind: (LoggerModel.SetKind) -> Void
    let onDelete: () -> Void

    @State private var tickCount = 0

    private var canTick: Bool { (row.reps ?? 0) > 0 }

    var body: some View {
        HStack(spacing: 8) {
            ordinalChip

            VStack(alignment: .leading, spacing: 1) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    NumericField(value: $row.weightKg, placeholder: "—", decimals: true,
                                 width: 68, onCommit: onCommit)
                    Text("kg")
                        .helixText(.small, leading: .none)
                        .foregroundStyle(HelixPalette.dim)

                    Text("×")
                        .helixText(.compact, leading: .none)
                        .foregroundStyle(HelixPalette.dim)
                        .padding(.horizontal, 1)

                    NumericField(value: Binding(
                        get: { row.reps.map(Double.init) },
                        set: { row.reps = $0.map { Int($0.rounded()) } }
                    ), placeholder: "—", decimals: false, width: 50, onCommit: onCommit)
                }
                if let previous = row.previous {
                    Text(previous)
                        .helixText(.micro, leading: .none)
                        .helixNumber()
                        .foregroundStyle(HelixPalette.dim)
                }
            }

            Spacer(minLength: 0)

            if row.isRecord && row.isDone { recordBadge }
            rpeControl
            tickButton
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .background(
            RoundedRectangle(cornerRadius: HelixRadius.xl, style: .continuous)
                .fill(row.isDone ? accent.alphaByte(0x14) : Color.white.opacity(0.025))
        )
        .overlay(
            RoundedRectangle(cornerRadius: HelixRadius.xl, style: .continuous)
                .strokeBorder(
                    row.isRecord && row.isDone ? HelixPalette.gold.alphaByte(0x66)
                        : row.isDone ? accent.alphaByte(0x3a)
                        : HelixPalette.cardBorder,
                    lineWidth: 1
                )
        )
        .opacity(row.kind == .ghost ? 0.42 : 1)
        .animation(HelixMotion.move, value: row.isDone)
        .animation(HelixMotion.move, value: row.isRecord)
        // Motion, haptic and (on a record) the gold all land on the SAME frame.
        // Latency between the senses is what destroys the illusion that the tick
        // caused the feedback.
        .sensoryFeedback(row.isRecord ? .success : .impact(weight: .medium), trigger: tickCount)
        .contextMenu {
            Picker("Set type", selection: Binding(get: { row.kind }, set: onKind)) {
                Text("Working set").tag(LoggerModel.SetKind.normal)
                Text("Warm-up").tag(LoggerModel.SetKind.warmup)
                Text("To failure").tag(LoggerModel.SetKind.failure)
                Text("Drop set").tag(LoggerModel.SetKind.dropset)
                Text("Skipped (ghost)").tag(LoggerModel.SetKind.ghost)
            }
            Button("Delete set", systemImage: "trash", role: .destructive, action: onDelete)
        }
    }

    private var ordinalChip: some View {
        ZStack {
            RoundedRectangle(cornerRadius: HelixRadius.lg, style: .continuous)
                .fill(row.isDone ? accent.alphaByte(0x2e) : Color.white.opacity(0.04))
            Text(row.kind.badge ?? "\(ordinal)")
                .helixText(.compact, weight: .bold, leading: .none)
                .helixNumber()
                .foregroundStyle(row.kind == .normal ? HelixPalette.text : HelixPalette.amber)
        }
        .frame(width: 30, height: 30)
    }

    /// A record, stated in gold and nowhere else.
    ///
    /// Gold means a personal record app-wide, which is why a permanent gold zero
    /// in the header would be how gold stops meaning anything.
    private var recordBadge: some View {
        Image(systemName: "trophy.fill")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(HelixPalette.gold)
            .padding(5)
            .background(Circle().fill(HelixPalette.gold.alphaByte(0x24)))
            .overlay(Circle().strokeBorder(HelixPalette.gold.alphaByte(0x55), lineWidth: 0.75))
            .transition(.scale(scale: 0.5).combined(with: .opacity))
            .accessibilityLabel("Personal record")
    }

    /// Effort, on the CR-10 ladder.
    ///
    /// A `Menu` rather than a hand-built picker: it is one of the four controls
    /// on this row, it is chosen far less often than the load, and the system's
    /// own menu is already interruptible, accessible and familiar. The web
    /// app's RPE ladder is a bespoke popover for the same job.
    private var rpeControl: some View {
        Menu {
            Button("Not rated") { row.rpe = nil; onCommit() }
            ForEach(Array(stride(from: 10.0, through: 6.0, by: -0.5)), id: \.self) { value in
                Button(HelixFormat.rpe(value)) { row.rpe = value; onCommit() }
            }
        } label: {
            Text(row.rpe.map(HelixFormat.rpe) ?? "RPE")
                .helixText(row.rpe == nil ? .micro : .compact, weight: .bold, leading: .none)
                .helixNumber()
                .foregroundStyle(row.rpe.map(Self.rpeColor) ?? HelixPalette.dim)
                .frame(width: 34, height: 30)
                .background(
                    RoundedRectangle(cornerRadius: HelixRadius.lg, style: .continuous)
                        .fill(row.rpe.map { Self.rpeColor($0).alphaByte(0x1a) } ?? .clear)
                )
        }
        .accessibilityLabel("Rate of perceived exertion")
    }

    /// The ladder's colours: muted below 8, ember at 8–9, oxide at 9.5+.
    /// `amber` is the fourth rung and nothing else — it is NOT `gold`, which
    /// means a personal record.
    private static func rpeColor(_ value: Double) -> Color {
        switch value {
        case ..<7.5:  HelixPalette.muted
        case ..<9:    HelixPalette.amber
        case ..<9.5:  HelixPalette.ember
        default:      HelixPalette.oxide
        }
    }

    private var tickButton: some View {
        Button {
            onToggle()
            tickCount += 1
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: HelixRadius.xl, style: .continuous)
                    .fill(row.isDone ? accent : Color.white.opacity(0.05))
                RoundedRectangle(cornerRadius: HelixRadius.xl, style: .continuous)
                    .strokeBorder(row.isDone ? .clear : HelixPalette.rowBorder, lineWidth: 1)
                Image(systemName: "checkmark")
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(row.isDone ? HelixPalette.obsidian : HelixPalette.dim)
                    .scaleEffect(row.isDone ? 1 : 0.82)
            }
            .frame(width: 44, height: 40)
        }
        .helixPress(scale: 0.9)
        .disabled(!canTick && !row.isDone)
        .opacity(canTick || row.isDone ? 1 : 0.4)
        .accessibilityLabel(row.isDone ? "Set logged, tap to undo" : "Log set")
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
    let placeholder: String
    let decimals: Bool
    let width: CGFloat
    let onCommit: () -> Void

    @State private var text: String = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextField(placeholder, text: $text)
            .keyboardType(decimals ? .decimalPad : .numberPad)
            .multilineTextAlignment(.leading)
            .helixText(.fluidXL, weight: .semibold, leading: .none)
            .helixNumber()
            .foregroundStyle(value == nil ? HelixPalette.dim : HelixPalette.text)
            .frame(width: width, alignment: .leading)
            .focused($focused)
            .onAppear { text = Self.render(value) }
            .onChange(of: text) { _, next in
                value = Self.parse(next)
            }
            .onChange(of: focused) { _, isFocused in
                if !isFocused {
                    text = Self.render(value)
                    onCommit()
                }
            }
            // A value changed from outside the field (a phase rebuild, a row
            // restored from the log) has to reach the text, or the field keeps
            // showing the number it was seeded with.
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

#Preview("Exercise card") {
    let model = LoggerModel.previewUpperB()
    return ScrollView {
        VStack(spacing: 12) {
            ForEach(model.exercises) { exercise in
                ExerciseCardView(
                    exercise: exercise, model: model,
                    accent: Color(hex: model.day.accent)
                )
            }
        }
        .padding(14)
    }
    .background(HelixPalette.obsidian)
}
