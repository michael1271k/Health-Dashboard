import SwiftUI
import OnyxCore
import OnyxData
import OnyxUI

/// The supplement stack, in full — a screen, not a sheet.
///
/// ── WHY IT LEFT THE BOTTOM SHEET ────────────────────────────────────────────
/// The stack was a `DaySheet`: a modal list of nine items whose only gesture
/// was a tap that opened a confirmation dialog anchored to the SHEET's root, so
/// the question about the 22:00 magnesium appeared at the top of the screen
/// over the 10:30 multivitamin. A sheet is for one decision; the stack is a
/// place you go — it has sections, an editor, an archive and a `+`.
///
/// This is Apple's own Medications shape, and deliberately: Due · Taken · Later
/// is the vocabulary the phone already teaches, swipe-to-take is the gesture
/// Health uses for the same act, and the long-press menu is where iOS has put
/// "edit this row" since the beginning.
///
/// ── WHERE A SKIPPED DOSE LIVES ──────────────────────────────────────────────
/// In `Due`, struck through. The section is not "what you have not handled" —
/// under the credit rule an unhandled dose past its slot is already counted —
/// it is "today's decisions that are still open to change", and a skip is
/// exactly that. Putting it in a fifth section would file the one row you might
/// want to undo furthest from the one you would undo it with.
struct StackView: View {
    let model: DayModel

    @State private var adding = false
    @State private var editing: CustomSupplement?

    private var doses: [SupplementDose] { model.doses }

    var body: some View {
        List {
            if doses.isEmpty && model.archivedCustoms.isEmpty {
                Text("Nothing scheduled for this day.")
                    .onyxType(.body)
                    .foregroundStyle(Color.onyx.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .plainRow()
            }

            section("Due", doses.filter { $0.state == .due || $0.state == .skipped })
            section("Taken", doses.filter { $0.state == .taken })
            section("Later", doses.filter { $0.state == .later })

            if !model.archivedCustoms.isEmpty {
                Section {
                    ForEach(model.archivedCustoms, id: \.id) { custom in
                        ArchivedRow(custom: custom, model: model)
                    }
                } header: {
                    OnyxSectionHeader("Archived", .fuel)
                }
            }
        }
        .listStyle(.plain)
        .listSectionSpacing(OnyxSpace.l)
        .scrollContentBackground(.hidden)
        .onyxScreen(.fuel)
        .navigationTitle("Stack")
        .navigationBarTitleDisplayMode(.inline)
        .tint(Color.onyx.accent(.fuel))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { adding = true } label: {
                    Image(systemName: "plus").frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel("Add a supplement")
            }
        }
        .sheet(isPresented: $adding) { SupplementEditSheet(model: model, editing: nil) }
        .sheet(item: $editing) { custom in SupplementEditSheet(model: model, editing: custom) }
    }

    @ViewBuilder
    private func section(_ title: String, _ items: [SupplementDose]) -> some View {
        if !items.isEmpty {
            Section {
                ForEach(items) { dose in
                    DoseRow(dose: dose, model: model, onEdit: { editing = model.custom(for: dose) })
                }
            } header: {
                OnyxSectionHeader("\(title) · \(items.count)", .fuel)
            }
        }
    }
}

// MARK: - One dose

/// ── THE DIALOG IS ON THE ROW ────────────────────────────────────────────────
/// `.confirmationDialog` presents from the view it is attached to. Attached to
/// a list's root it anchors to the top of the screen, which is what the old
/// sheet did and why the question never appeared to belong to the item it was
/// about. Each row owns its own — the same fix `PulseScale` made for the
/// weigh-in reason.
private struct DoseRow: View {
    let dose: SupplementDose
    let model: DayModel
    let onEdit: () -> Void

    @State private var confirming = false
    @State private var frozen = false

    private var custom: CustomSupplement? { model.custom(for: dose) }
    private var skipped: Bool { dose.state == .skipped }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.m) {
            VStack(alignment: .leading, spacing: 2) {
                Text(dose.name)
                    .onyxType(.body)
                    .strikethrough(skipped, color: Color.onyx.textTertiary)
                    .foregroundStyle(skipped ? Color.onyx.textTertiary : Color.onyx.textPrimary)
                if let caption {
                    Text(caption)
                        .onyxType(.caption)
                        .foregroundStyle(skipped ? Color.onyx.danger : Color.onyx.textSecondary)
                }
            }
            Spacer(minLength: OnyxSpace.s)
            if dose.trainingOnly == true, model.isTraining {
                Image(systemName: "bolt.fill")
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.accent(.train))
                    .accessibilityHidden(true)
            }
            Text(dose.dose)
                .onyxType(.caption).onyxNumeral()
                .foregroundStyle(Color.onyx.textSecondary)
        }
        .frame(minHeight: 44)
        .contentShape(.rect)
        .plainRow()
        // ── Leading: the one act that needs no question ─────────────────────
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            if dose.state != .taken {
                Button {
                    model.mark(dose, as: .taken)
                } label: {
                    Label("Taken", systemImage: "checkmark")
                }
                .tint(Color.onyx.good)
            } else {
                Button {
                    model.mark(dose, as: .cleared)
                } label: {
                    Label("Undo", systemImage: "arrow.uturn.backward")
                }
            }
        }
        // ── Trailing: the three that change the protocol ────────────────────
        .swipeActions(edge: .trailing) {
            if let custom {
                Button(role: .destructive) {
                    model.setArchived(custom, archived: true)
                } label: {
                    Label("Archive", systemImage: "archivebox")
                }
            }
            Button {
                frozen = model.freezeTomorrow(dose)
            } label: {
                Label("Freeze", systemImage: "snowflake")
            }
            .tint(Color.onyx.accent(.recover))
            Button {
                if skipped { model.mark(dose, as: .cleared) } else { confirming = true }
            } label: {
                Label(skipped ? "Unskip" : "Skip", systemImage: skipped ? "arrow.uturn.backward" : "xmark")
            }
            .tint(Color.onyx.accent(.fuel))
        }
        .contextMenu {
            if custom != nil {
                Button("Edit", systemImage: "square.and.pencil", action: onEdit)
            }
            Button(skipped ? "Undo skip" : "Skip today", systemImage: skipped ? "arrow.uturn.backward" : "xmark") {
                model.mark(dose, as: skipped ? .cleared : .skipped)
            }
            Button("Freeze tomorrow", systemImage: "snowflake") { frozen = model.freezeTomorrow(dose) }
            if let custom {
                Button("Archive", systemImage: "archivebox") { model.setArchived(custom, archived: true) }
                Button("Delete", systemImage: "trash", role: .destructive) { model.delete(custom) }
            }
        }
        .confirmationDialog("Skip \(dose.name)?", isPresented: $confirming, titleVisibility: .visible) {
            Button("Skip today", role: .destructive) { model.mark(dose, as: .skipped) }
        } message: {
            Text("\(dose.slotLabel) · \(dose.slotTime) · \(dose.dose). Its micronutrients stop counting towards today.")
        }
        .alert("Frozen for tomorrow", isPresented: $frozen) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("\(dose.name) is marked skipped tomorrow. Today is unchanged.")
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(dose.name), \(dose.dose), \(spokenState)")
        .accessibilityHint(dose.state == .taken ? "Swipe to undo" : "Swipe to mark taken")
    }

    private var caption: String? {
        switch dose.state {
        case .skipped: "Skipped"
        case .taken: "Taken · \(dose.slotLabel) · \(dose.slotTime)"
        case .due, .later: "\(dose.slotLabel) · \(dose.slotTime)" + (dose.notes.map { " · \($0)" } ?? "")
        }
    }

    private var spokenState: String {
        switch dose.state {
        case .taken: "taken"
        case .skipped: "skipped"
        case .due: "due, counting towards today"
        case .later: "later, at \(dose.slotTime)"
        }
    }
}

// MARK: - An archived row

private struct ArchivedRow: View {
    let custom: CustomSupplement
    let model: DayModel

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.m) {
            VStack(alignment: .leading, spacing: 2) {
                Text(custom.name)
                    .onyxType(.body)
                    .foregroundStyle(Color.onyx.textTertiary)
                Text("Archived — its history still counts")
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textTertiary)
            }
            Spacer(minLength: OnyxSpace.s)
            Text(custom.dose)
                .onyxType(.caption).onyxNumeral()
                .foregroundStyle(Color.onyx.textTertiary)
        }
        .frame(minHeight: 44)
        .contentShape(.rect)
        .plainRow()
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            Button { model.setArchived(custom, archived: false) } label: {
                Label("Re-add", systemImage: "arrow.uturn.backward")
            }
            .tint(Color.onyx.good)
        }
        .contextMenu {
            Button("Re-add", systemImage: "arrow.uturn.backward") { model.setArchived(custom, archived: false) }
            Button("Delete", systemImage: "trash", role: .destructive) { model.delete(custom) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(custom.name), \(custom.dose), archived")
    }
}

// MARK: - Add and edit

/// One form for both. An add writes a new row; an edit changes the three fields
/// a phone has any business changing — the schedule's own key is never touched,
/// because it is the join to every log row the item ever wrote.
struct SupplementEditSheet: View {
    let model: DayModel
    let editing: CustomSupplement?

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var dose = ""
    @State private var time = ""
    @State private var days: Set<Int> = []
    @State private var trainingOnly = false

    private static let weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    private var valid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !dose.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        DaySheet(
            editing == nil ? "Add a supplement" : "Edit",
            domain: .fuel, glass: false,
            primary: ("Save", valid, save)
        ) {
            Form {
                Section {
                    TextField("Name", text: $name)
                    TextField("Dose", text: $dose)
                        .accessibilityHint("For example, 2 tabs or 300 mg")
                    TextField("Time", text: $time)
                        .accessibilityHint("Twenty-four hour, for example 22:00. Leave blank for no set time.")
                } footer: {
                    Text("A counted dose — \"2 tabs\", \"2 caps\" — delivers that multiple of the label. A mass — \"300 mg\" — is the label itself.")
                }

                if editing == nil {
                    Section {
                        HStack(spacing: OnyxSpace.xs) {
                            ForEach(Array(Self.weekdays.enumerated()), id: \.offset) { index, label in
                                dayToggle(index, label)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        Toggle("Training days only", isOn: $trainingOnly)
                    } header: {
                        OnyxSectionHeader("Days", .fuel)
                    } footer: {
                        Text("No day selected means every day.")
                    }
                }
            }
        }
        .onAppear {
            guard let editing else { return }
            name = editing.name
            dose = editing.dose
            time = editing.time ?? ""
        }
    }

    private func dayToggle(_ index: Int, _ label: String) -> some View {
        let on = days.contains(index)
        return Button {
            if on { days.remove(index) } else { days.insert(index) }
        } label: {
            Text(label.prefix(1))
                .onyxType(.caption).fontWeight(.semibold)
                .frame(minWidth: 32, minHeight: 32)
                .background(Circle().fill(on ? Color.onyx.accent(.fuel).opacity(0.25) : Color.onyx.hairline))
                .foregroundStyle(on ? Color.onyx.accent(.fuel) : Color.onyx.textSecondary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }

    private func save() {
        let cleanName = name.trimmingCharacters(in: .whitespaces)
        let cleanDose = dose.trimmingCharacters(in: .whitespaces)
        let cleanTime = time.trimmingCharacters(in: .whitespaces)
        if let editing {
            model.editSupplement(editing, name: cleanName, dose: cleanDose, time: cleanTime)
        } else {
            model.addSupplement(
                name: cleanName, dose: cleanDose, time: cleanTime, days: days.sorted(),
                color: nil, form: nil, notes: nil, trainingOnly: trainingOnly
            )
        }
        dismiss()
    }
}
