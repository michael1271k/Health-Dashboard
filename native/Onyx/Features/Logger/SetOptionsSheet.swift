import SwiftUI
import OnyxUI

/// Everything you do to a set that is not its two numbers.
///
/// ── WHY IT IS BEHIND THE SET NUMBER ─────────────────────────────────────────
/// The badge already SHOWS the set's type — `W`, `F`, `D`, `G`, or the ordinal.
/// A control that displays a value is the obvious place to change it, and it
/// costs no new pixels because the box was already drawn. Tap logs the set, hold
/// opens this; two gestures on one target, and the one you reach for constantly
/// is the shorter one.
///
/// ── WHAT REPLACED THE CONFIRMATION DIALOG ───────────────────────────────────
/// This was a `confirmationDialog` — a column of nine full-width system rows
/// with a Delete at the bottom, in which the set's type was five rows that each
/// said only their own name, and the second axis did not exist at all. An action
/// sheet is the right control for "choose one thing and leave"; it is the wrong
/// one for a two-axis editor you might use twice in a row, and it cannot show
/// what is currently selected.
///
/// ── TWO AXES, NOT ONE LONGER LIST ───────────────────────────────────────────
/// "Warm-up" and "form broke" are both true of the same set. Folding technique
/// into `set_type` would force a choice between two facts, and would give every
/// consumer of "is this a working set" an opinion about form — see `SetQuality`.
/// So the type is one row of chips and the quality is another, each with its own
/// meaning line, and neither can express the other.
///
/// ── AND WHY ONE ACCENT RATHER THAN FIVE ─────────────────────────────────────
/// The web paints each type its own hue. §3.2 gives this app four domain meshes
/// and gold, and gold means a personal record — five new colours for five chips
/// would be five tokens nobody designed, in a sheet that is open for four
/// seconds. The glyph carries the identity, exactly as it does on the row, and
/// the accent carries one meaning only: this is the one you chose.
struct SetOptionsSheet: View {
    let ordinal: Int
    @Bindable var row: LoggerModel.SetRow
    let onKind: (LoggerModel.SetKind) -> Void
    let onQuality: (SetQuality?) -> Void
    let onNote: () -> Void
    let onDuplicate: () -> Void
    let onDelete: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize

    private var accent: Color { Color.onyx.accent(.train) }

    /// Five across, until the type size says otherwise. At an accessibility size
    /// five 66 pt chips is five truncated words, which is five chips that say
    /// nothing in the space of five that said something.
    private var typeColumns: Int { typeSize.isAccessibilitySize ? 2 : 5 }
    private var qualityColumns: Int { typeSize.isAccessibilitySize ? 1 : 3 }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: OnyxSpace.l) {
                    kindSection
                    qualitySection
                    actions
                }
                .padding(OnyxSpace.l)
            }
            .onyxScreen(.train)
            .navigationTitle("Set \(ordinal)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    // MARK: - What it was

    private var kindSection: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.s) {
            OnyxSectionHeader("What it was", .train)
            grid(columns: typeColumns) {
                ForEach(LoggerModel.SetKind.allCases) { kind in
                    chip(
                        label: kind.label,
                        glyph: kind.badge ?? "#",
                        selected: row.kind == kind,
                        hint: kind.hint
                    ) {
                        // Picking does NOT dismiss. Making a set a warm-up and
                        // then wanting to duplicate it is one errand, and a
                        // sheet that closes on the first tap makes it two.
                        onKind(kind)
                    }
                }
            }
            meaning(row.kind.hint, marked: true)
        }
    }

    // MARK: - How it went

    private var qualitySection: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.s) {
            OnyxSectionHeader("How it went", .train)
            grid(columns: qualityColumns) {
                ForEach(SetQuality.allCases) { quality in
                    chip(
                        label: quality.label,
                        glyph: nil,
                        selected: row.quality == quality,
                        hint: quality.full
                    ) {
                        // Tapping the chosen one withdraws it. There is no
                        // "Clean" chip: clean is the ABSENCE of a claim, and a
                        // chip for it would write a value asserting the set was
                        // inspected and passed.
                        onQuality(quality)
                    }
                }
            }
            meaning(row.quality?.full ?? "Clean unless you say otherwise", marked: row.quality != nil)
        }
    }

    // MARK: - The two actions

    private var actions: some View {
        VStack(spacing: OnyxSpace.s) {
            // The note belongs to the EXERCISE, not to this set, and it is here
            // because this is where the old confirmation dialog kept it and
            // there is nowhere else on the card to reach it from.
            action("Note this exercise", systemImage: "square.and.pencil", tint: Color.onyx.textPrimary) {
                onNote()
                dismiss()
            }
            action("Duplicate set", systemImage: "plus.square.on.square", tint: Color.onyx.textPrimary) {
                onDuplicate()
                dismiss()
            }
            // Remove keeps its distance from the chips you came here for, and it
            // is the only thing in the sheet that cannot be undone by tapping it
            // again.
            action("Delete set", systemImage: "trash", tint: Color.onyx.danger) {
                onDelete()
                dismiss()
            }
        }
    }

    // MARK: - Parts

    private func grid<Content: View>(
        columns: Int, @ViewBuilder content: () -> Content
    ) -> some View {
        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), spacing: OnyxSpace.s), count: columns),
            spacing: OnyxSpace.s,
            content: content
        )
    }

    /// One choice. The colour IS the state, so there is no tick to find.
    private func chip(
        label: String, glyph: String?, selected: Bool, hint: String, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                if let glyph {
                    Text(glyph)
                        .onyxType(.body).fontWeight(.heavy).onyxNumeral()
                        .foregroundStyle(selected ? accent : Color.onyx.textSecondary)
                }
                Text(label)
                    .onyxType(.caption).fontWeight(.semibold)
                    .foregroundStyle(selected ? accent : Color.onyx.textSecondary)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(
                RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous)
                    .fill(selected ? accent.opacity(0.16) : Color.onyx.hairline.opacity(0.35))
            )
            .overlay(
                RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous)
                    .strokeBorder(selected ? accent.opacity(0.55) : Color.clear, lineWidth: 1)
            )
            .contentShape(.rect)
        }
        .onyxPress(scale: 0.95)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
        .accessibilityLabel(label)
        .accessibilityHint(hint)
    }

    /// What the current answer MEANS, on a line that is always there. Its height
    /// is reserved so choosing a longer hint does not move the chips under the
    /// thumb that is still on them.
    private func meaning(_ text: String, marked: Bool) -> some View {
        Label {
            Text(text)
                .onyxType(.caption)
                .foregroundStyle(Color.onyx.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: "checkmark")
                .onyxType(.micro)
                .foregroundStyle(marked ? accent : .clear)
        }
        .frame(maxWidth: .infinity, minHeight: 20, alignment: .leading)
    }

    private func action(
        _ title: String, systemImage: String, tint: Color, perform: @escaping () -> Void
    ) -> some View {
        Button(action: perform) {
            Label(title, systemImage: systemImage)
                .onyxType(.body).fontWeight(.semibold)
                .foregroundStyle(tint)
                .frame(maxWidth: .infinity, minHeight: 48)
                .onyxGlass(.row)
        }
        .onyxPress(scale: 0.98)
    }
}

#if DEBUG
#Preview("Set options") {
    let model = LoggerModel.previewUpperB(logged: true)
    let exercise = model.exercises[1]
    return Color.clear.sheet(isPresented: .constant(true)) {
        SetOptionsSheet(
            ordinal: 2,
            row: exercise.rows[1],
            onKind: { model.setKind($0, on: exercise.rows[1], in: exercise) },
            onQuality: { model.setQuality($0, on: exercise.rows[1], in: exercise) },
            onNote: {},
            onDuplicate: {},
            onDelete: {}
        )
    }
    .preferredColorScheme(.dark)
}
#endif
