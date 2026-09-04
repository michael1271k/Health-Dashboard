import SwiftUI
import HelixUI
import HelixCore

/// The supplement protocol for the day — a statement, not a checklist.
///
/// ── ABSENCE IS TAKEN ────────────────────────────────────────────────────────
/// The stack is what happens by default; `supplement_log` holds only the
/// exceptions. So no row is a checkbox: tapping one asks whether to record a
/// skip (or undo one) and nothing else, because the exception is the deliberate
/// gesture and the routine costs no taps at all.
struct StackTile: View {
    let model: DayModel

    @State private var pending: PendingDose?

    private struct PendingDose: Identifiable {
        let item: Supplement
        let slot: SupplementSlot
        let skipped: Bool
        var id: String { item.key }
    }

    private let accent = Color.helix.accent(.fuel)

    var body: some View {
        let stack = model.stack
        let skipped = model.skippedKeys
        let total = stack.reduce(0) { $0 + $1.items.count }
        let taken = total - stack.flatMap(\.items).filter { skipped.contains($0.key) }.count

        DayTile("Stack", .fuel) {
            if stack.isEmpty {
                Text("No supplements scheduled")
                    .font(.subheadline)
                    .foregroundStyle(Color.helix.textSecondary)
            }
            ForEach(stack, id: \.key) { slot in
                slotSection(slot, skipped: skipped)
            }
        } trailing: {
            Text("\(taken) of \(total) taken")
                .helixCaption()
                .helixNumeral()
        }
        .confirmationDialog(
            pending?.item.name ?? "",
            isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }),
            titleVisibility: .visible,
            presenting: pending
        ) { dose in
            if dose.skipped {
                Button("Undo skip") { model.setSupplementSkipped(dose.item, in: dose.slot, skipped: false) }
            } else {
                Button("Skip today", role: .destructive) { model.setSupplementSkipped(dose.item, in: dose.slot, skipped: true) }
            }
        } message: { dose in
            Text("\(dose.slot.label) · \(dose.slot.time) · \(dose.item.dose)")
        }
    }

    @ViewBuilder
    private func slotSection(_ slot: SupplementSlot, skipped: Set<String>) -> some View {
        let passed = model.isToday && Supplements.slotTimePassed(slot.time, nowMinutes: DayFormat.nowMinutes)
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(slot.label).font(.subheadline.weight(.medium))
                Text(slot.time).helixCaption().helixNumeral()
                Spacer(minLength: 0)
                // Today only: a past day has no "due", and a future one is not offered.
                if model.isToday {
                    Label(passed ? "Passed" : "Due", systemImage: passed ? "checkmark" : "clock")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(passed ? Color.helix.textTertiary : accent)
                }
            }
            .accessibilityElement(children: .combine)

            ForEach(slot.items, id: \.key) { item in
                row(item, in: slot, skipped: skipped.contains(item.key))
            }
        }
    }

    private func row(_ item: Supplement, in slot: SupplementSlot, skipped: Bool) -> some View {
        Button {
            pending = PendingDose(item: item, slot: slot, skipped: skipped)
        } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name)
                        .font(.body)
                        .strikethrough(skipped)
                        .lineLimit(2)
                    if skipped {
                        Text("Skipped")
                            .font(.caption)
                            .foregroundStyle(Color.helix.textSecondary)
                    } else if let notes = item.notes {
                        Text(notes)
                            .font(.caption)
                            .foregroundStyle(Color.helix.textSecondary)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                if item.trainingOnly == true && model.isTraining {
                    Image(systemName: "bolt.fill")
                        .font(.caption)
                        .foregroundStyle(accent)
                        .accessibilityLabel("Training days only")
                }
                Text(item.dose)
                    .font(.subheadline)
                    .foregroundStyle(Color.helix.textSecondary)
                    .helixNumeral()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .helixPress(scale: 0.98)
        .helixGlass(.row)
        .opacity(skipped ? 0.55 : 1)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(item.name), \(item.dose)\(skipped ? ", skipped today" : "")")
        .accessibilityHint(skipped ? "Undo the skip" : "Record a skip")
    }
}
