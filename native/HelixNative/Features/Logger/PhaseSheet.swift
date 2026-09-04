import SwiftUI
import HelixUI
import HelixCore

/// Cut or bulk — the only two, and what each one actually changes.
///
/// ── WHY THIS SHOWS A DIFF AND NOT A TOGGLE ──────────────────────────────────
/// A phase is not a preference, it is a prescription: it changes the set count
/// on twelve lifts and drops two of them entirely. A switch with a label tells
/// you none of that, so you flip it and find out by scrolling. Showing the
/// deck's own numbers for each option makes the choice legible before it is
/// made — which is what "keep people in control" means when the control is
/// destructive to a plan.
///
/// `maintenance` is deliberately absent. It resolved to the bulk deck: no
/// exercise, no set count and no rep window changed. It is a NUTRITION lever,
/// applied on top of whichever direction the block runs, and offering it here
/// would be offering a training decision that trains nothing.
struct PhaseSheet: View {
    let day: ProgramDay
    @Binding var phase: ProgramPhase
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: HelixSpace.m) {
                    ForEach(ProgramPhase.allCases, id: \.self) { option in
                        card(option)
                    }

                    Text("Nutrition targets follow the plan's own block. A maintenance week is a lever on top of this, not a third phase.")
                        .helixType(.caption)
                        .foregroundStyle(Color.helix.textTertiary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(HelixSpace.l)
            }
            .helixScreen(.train)
            .navigationTitle("Phase")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .presentationContentInteraction(.scrolls)
    }

    private func card(_ option: ProgramPhase) -> some View {
        let tint = Color.helix.phase(option)
        let selected = phase == option
        let dropped = day.exercises.filter { $0.sets(for: option) == 0 }

        return Button {
            withAnimation(HelixMotion.move) { phase = option }
        } label: {
            VStack(alignment: .leading, spacing: HelixSpace.s) {
                HStack(spacing: HelixSpace.s) {
                    Image(systemName: option == .cut ? "flame.fill" : "leaf.fill")
                        .foregroundStyle(tint)
                    Text(option.label)
                        .helixDisplay()
                        .foregroundStyle(Color.helix.textPrimary)
                    Spacer(minLength: 0)
                    Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(selected ? tint : Color.helix.textTertiary)
                }
                .helixType(.body)

                Text(option.blurb)
                    .helixType(.secondary)
                    .foregroundStyle(Color.helix.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: HelixSpace.s) {
                    stat("\(day.plannedSets(for: option))", "sets", tint)
                    stat("\(day.exercises(for: option).count)", "lifts", Color.helix.textPrimary)
                    if !dropped.isEmpty {
                        stat("\(dropped.count)", "dropped", Color.helix.textTertiary)
                    }
                }

                if !dropped.isEmpty {
                    Text("Not trained: " + dropped.map(\.name).joined(separator: ", "))
                        .helixType(.caption)
                        .foregroundStyle(Color.helix.textTertiary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(HelixSpace.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .helixGlass(.tile)
            .overlay {
                // The selected card is the only one that draws an outline: a
                // ring on both is a border, not a selection.
                if selected {
                    RoundedRectangle(cornerRadius: HelixCorner.tile, style: .continuous)
                        .strokeBorder(tint, lineWidth: 1)
                }
            }
        }
        .helixPress(scale: 0.985)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }

    private func stat(_ value: String, _ label: String, _ color: Color) -> some View {
        HStack(spacing: HelixSpace.xs) {
            Text(value)
                .helixType(.caption).fontWeight(.bold).helixNumeral()
                .foregroundStyle(color)
            Text(label)
                .helixMicro()
        }
        .padding(.horizontal, HelixSpace.s)
        .padding(.vertical, HelixSpace.xs)
        .helixGlass(.row)
    }
}

#if DEBUG
#Preview("Phase") {
    @Previewable @State var phase: ProgramPhase = .cut
    return PhaseSheet(day: Program.helix5.day(key: "cb_b")!, phase: $phase)
}
#endif
