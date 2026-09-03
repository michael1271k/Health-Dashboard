import SwiftUI
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
                VStack(spacing: 12) {
                    ForEach(ProgramPhase.allCases, id: \.self) { option in
                        card(option)
                    }

                    Text("Nutrition targets follow the plan's own block. A maintenance week is a lever on top of this, not a third phase.")
                        .helixText(.small)
                        .foregroundStyle(HelixPalette.dim)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 4)
                }
                .padding(18)
            }
            .background(HelixPalette.obsidian)
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
        .presentationBackground(HelixPalette.obsidian)
    }

    private func card(_ option: ProgramPhase) -> some View {
        let tint = option == .cut ? HelixPalette.Phase.cut : HelixPalette.Phase.bulk
        let selected = phase == option
        let dropped = day.exercises.filter { $0.sets(for: option) == 0 }

        return Button {
            withAnimation(HelixMotion.move) { phase = option }
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: option == .cut ? "flame.fill" : "leaf.fill")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(tint)
                    Text(option.label)
                        .helixText(.fluidLG, weight: .bold, leading: .none)
                        .foregroundStyle(HelixPalette.text)
                    Spacer()
                    Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 19))
                        .foregroundStyle(selected ? tint : HelixPalette.dim)
                }

                Text(option.blurb)
                    .helixText(.compact)
                    .foregroundStyle(HelixPalette.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: 6) {
                    stat("\(day.plannedSets(for: option))", "SETS", tint)
                    stat("\(day.exercises(for: option).count)", "LIFTS", HelixPalette.platinum)
                    if !dropped.isEmpty {
                        stat("\(dropped.count)", "DROPPED", HelixPalette.dim)
                    }
                }

                if !dropped.isEmpty {
                    Text("Not trained: " + dropped.map(\.name).joined(separator: ", "))
                        .helixText(.small)
                        .foregroundStyle(HelixPalette.dim)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: HelixRadius.xxl, style: .continuous)
                    .fill(selected ? tint.alphaByte(0x14) : HelixPalette.cardFill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: HelixRadius.xxl, style: .continuous)
                    .strokeBorder(selected ? tint.alphaByte(0x66) : HelixPalette.cardBorder, lineWidth: 1)
            )
        }
        .helixPress(scale: 0.985)
    }

    private func stat(_ value: String, _ label: String, _ color: Color) -> some View {
        HStack(spacing: 4) {
            Text(value)
                .helixText(.compact, weight: .bold, leading: .none)
                .helixNumber()
                .foregroundStyle(color)
            Text(label)
                .helixText(.micro, weight: .semibold, leading: .none)
                .tracking(0.7)
                .foregroundStyle(HelixPalette.dim)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(Capsule().fill(Color.white.opacity(0.04)))
    }
}

#Preview("Phase") {
    @Previewable @State var phase: ProgramPhase = .cut
    return PhaseSheet(day: Program.helix5.day(key: "cb_b")!, phase: $phase)
}
