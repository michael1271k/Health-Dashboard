import SwiftUI
import OnyxUI
import OnyxCore

/// The supplement protocol for the day — a statement, not a checklist.
///
/// ── ABSENCE IS TAKEN ────────────────────────────────────────────────────────
/// The stack is what happens by default; `supplement_log` holds only the
/// exceptions. So no row is a checkbox: tapping one asks whether to record a
/// skip (or undo one) and nothing else, because the exception is the deliberate
/// gesture and the routine costs no taps at all.
struct StackRow: View {
    let model: DayModel
    let onOpen: () -> Void

    var body: some View {
        let stack = model.stack
        let skipped = model.skippedKeys
        let total = stack.reduce(0) { $0 + $1.items.count }
        let taken = total - stack.flatMap(\.items).filter { skipped.contains($0.key) }.count
        PulseRow(
            symbol: "pills",
            title: "Stack",
            detail: total == 0 ? "Nothing scheduled" : "\(taken)/\(total) taken · \(stack.count) slots",
            tint: Color.onyx.accent(.fuel),
            spoken: total == 0 ? "nothing scheduled" : "\(taken) of \(total) taken",
            action: onOpen
        )
    }
}

/// The protocol in full, and the one gesture that changes it.
struct StackSheet: View {
    let model: DayModel

    @State private var pending: PendingDose?

    private struct PendingDose: Identifiable {
        let item: Supplement
        let slot: SupplementSlot
        let skipped: Bool
        var id: String { item.key }
    }

    private let accent = Color.onyx.accent(.fuel)

    var body: some View {
        let stack = model.stack
        let skipped = model.skippedKeys
        let total = stack.reduce(0) { $0 + $1.items.count }
        let taken = total - stack.flatMap(\.items).filter { skipped.contains($0.key) }.count

        DaySheet("Stack · \(taken) of \(total)", domain: .fuel) {
            VStack(alignment: .leading, spacing: OnyxSpace.l) {
                if stack.isEmpty {
                    Text("No supplements scheduled")
                        .onyxType(.secondary)
                        .foregroundStyle(Color.onyx.textSecondary)
                }
                ForEach(stack, id: \.key) { slot in
                    slotSection(slot, skipped: skipped)
                }
            }
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
        VStack(alignment: .leading, spacing: OnyxSpace.xs) {
            HStack(spacing: OnyxSpace.s) {
                Text(slot.label).onyxType(.body).fontWeight(.medium)
                Text(slot.time).onyxType(.caption).onyxNumeral()
                Spacer(minLength: 0)
                // Today only: a past day has no "due", and a future one is not offered.
                if model.isToday {
                    Label(passed ? "Passed" : "Due", systemImage: passed ? "checkmark" : "clock")
                        .onyxType(.micro).fontWeight(.semibold)
                        .foregroundStyle(passed ? Color.onyx.textTertiary : accent)
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
            HStack(spacing: OnyxSpace.grid) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name)
                        .onyxType(.body)
                        .strikethrough(skipped)
                        .lineLimit(2)
                    if skipped {
                        Text("Skipped")
                            .onyxType(.caption)
                            .foregroundStyle(Color.onyx.textSecondary)
                    } else if let notes = item.notes {
                        Text(notes)
                            .onyxType(.caption)
                            .foregroundStyle(Color.onyx.textSecondary)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: OnyxSpace.s)
                if item.trainingOnly == true && model.isTraining {
                    Image(systemName: "bolt.fill")
                        .onyxType(.caption)
                        .foregroundStyle(accent)
                        .accessibilityLabel("Training days only")
                }
                Text(item.dose)
                    .onyxType(.secondary)
                    .foregroundStyle(Color.onyx.textSecondary)
                    .onyxNumeral()
            }
            .padding(.horizontal, OnyxSpace.m)
            .padding(.vertical, OnyxSpace.s)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .onyxPress(scale: 0.98)
        .onyxGlass(.row)
        .opacity(skipped ? 0.55 : 1)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(item.name), \(item.dose)\(skipped ? ", skipped today" : "")")
        .accessibilityHint(skipped ? "Undo the skip" : "Record a skip")
    }
}
