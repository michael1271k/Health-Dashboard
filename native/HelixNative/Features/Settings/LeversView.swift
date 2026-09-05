import SwiftUI
import HelixUI
import HelixCore

/// The levers — one `Form`, a `Section` per concern.
///
/// ── WHAT A RUNG IS, AND WHY THE TARGETS GO READ-ONLY ────────────────────────
/// A rung is a LAYER over the numbers, not an edit of them. Choosing "Lever 1"
/// writes one column — `user_goals.active_lever` — and the five figures
/// underneath are left exactly as they were, which is what lets "My own numbers"
/// put them back untouched. While a rung holds, the five rows show the rung's
/// answer as VALUES rather than as disabled fields: a greyed-out input says
/// "this is yours and something is temporarily wrong", and the truth is "this is
/// the rung's number". The way back is a tap on My own numbers, and the footer
/// says so rather than leaving the reader to discover it.
///
/// ── AND WHY THE RELEASE HAS A DATE ──────────────────────────────────────────
/// A maintenance week is a lever, never a phase — a phase would change the
/// training programme, and this does not. It is the one rung that expires: past
/// `maintenance_until` the selection stops being honoured and the schedule
/// resumes, so a release closes itself whether or not anyone remembers.
struct LeversView: View {
    let model: SettingsModel

    @State private var draft = Draft()
    @FocusState private var focus: Field?

    private enum Field: Hashable {
        case kcal, protein, carbs, fat, steps
        case activeCal, sleep, water

        /// Which write a field belongs to. The macros go to two tables and turn
        /// the rung to `custom`; recovery goes to one and does not.
        var isMacro: Bool {
            switch self {
            case .kcal, .protein, .carbs, .fat, .steps: true
            case .activeCal, .sleep, .water: false
            }
        }
    }

    /// Editable copies, held only while a field has focus.
    ///
    /// The rows below read the STORE, not this, except for the field being
    /// typed into. A screen-wide `@State` mirror of the row is what lets a
    /// control drift from the database; a per-commit draft cannot, because it
    /// exists for the duration of one edit.
    private struct Draft {
        var kcal: Double?
        var protein: Double?
        var carbs: Double?
        var fat: Double?
        var steps: Double?
        var activeCal: Double?
        var sleep: Double?
        var water: Double?
    }

    var body: some View {
        Form {
            rungs
            release
            targets
            recovery
        }
        .helixFormBackground(.fuel)
        .navigationTitle("Levers")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { HelixKeyboardDone { focus = nil } }
        .task { await model.observe() }
        .onAppear(perform: loadDraft)
        .onChange(of: model.goals?.updatedAt) { _, _ in loadDraft() }
        .onDisappear {
            focus = nil
            commitGoals()
            commitRecovery()
        }
    }

    // MARK: - Rungs

    private var rungs: some View {
        Section {
            ForEach(Levers.deficit, id: \.id) { lever in
                rungRow(
                    id: lever.id,
                    label: lever.label,
                    summary: lever.summary,
                    kcal: lever.calorieGoal
                )
            }
            rungRow(
                id: .custom,
                label: "My own numbers",
                summary: "The five figures below, whatever you set them to.",
                kcal: nil
            )
        } header: {
            HelixSectionHeader("Rungs", .fuel)
        } footer: {
            if let held = model.heldBy, held.kind == .release {
                // The release is not one of these rows, so with it on the group
                // shows four empty circles and no explanation of what is in
                // force. Say it here rather than leaving the only answer two
                // sections away.
                Text("\(held.label) is in force below, so no rung is selected.")
            } else {
                Text("Each rung is a step deeper into the same cut. The food stops moving after Lever 1; the deficit deepens with steps.")
            }
        }
    }

    private func rungRow(id: LeverId, label: String, summary: String, kcal: Double?) -> some View {
        let isOn = model.leverInForce == id
        return Button {
            model.pickLever(id)
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(label)
                        .foregroundStyle(Color.helix.textPrimary)
                    Text(summary)
                        .font(.caption)
                        .foregroundStyle(Color.helix.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                if let kcal {
                    Text(kcal, format: .number.precision(.fractionLength(0)))
                        .helixNumeral()
                        .foregroundStyle(Color.helix.textSecondary)
                }
                Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isOn ? HelixDomain.fuel.accent : Color.helix.textTertiary)
                    // The tick is the selected state, which VoiceOver already
                    // announces through `isSelected` below.
                    .accessibilityHidden(true)
            }
            // A row is a 44 pt target whatever the label's length.
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        // `.plain` alone suppresses the row's own highlight and adds nothing,
        // so a 44 pt row taps with no feedback at all.
        .buttonStyle(HelixPressStyle())
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
        .accessibilityHint(isOn ? "" : "Puts this rung in force from today")
    }

    // MARK: - Release

    private var release: some View {
        Section {
            Toggle("Maintenance week", isOn: Binding(
                get: { model.isMaintenanceOn },
                set: { on in
                    model.setMaintenance(on: on, endsOn: on ? model.defaultMaintenanceEnd() : nil)
                }
            ))

            // Absent rather than disabled-but-visible. A date field greyed out
            // under an off switch is a control the user can neither use nor
            // dismiss — and hiding one with `opacity(0)` leaves the ROW, so the
            // section keeps a blank 90 pt band where a control used to be. A
            // `Form` row's height is the row's, not the content's.
            if model.isMaintenanceOn {
                DatePicker(
                    "Ends",
                    selection: Binding(
                        get: { LogicalDay.date(fromISO: model.goals?.maintenanceUntil ?? model.today) ?? Date() },
                        set: { model.setMaintenance(on: true, endsOn: LogicalDay.iso($0)) }
                    ),
                    // Today or later. A past date makes the release expire the
                    // instant it is picked, which flips the toggle off and
                    // collapses this very row under the user's finger.
                    in: (LogicalDay.date(fromISO: model.today) ?? Date())...,
                    displayedComponents: .date
                )
            }
        } header: {
            HelixSectionHeader("Release", .fuel)
        } footer: {
            Text(model.isMaintenanceOn
                 ? "Full food, lighter steps — still cutting. It ends itself on this date and the schedule resumes."
                 : "A planned week at maintenance. It is a lever, not a phase: the training programme does not change.")
        }
    }

    // MARK: - Targets

    @ViewBuilder
    private var targets: some View {
        Section {
            if let held = model.heldBy {
                HelixHeldRow(label: "Calories", value: held.calorieGoal, unit: "kcal")
                HelixHeldRow(label: "Protein", value: held.proteinGoalG, unit: "g")
                HelixHeldRow(label: "Carbohydrate", value: held.carbsGoalG, unit: "g")
                HelixHeldRow(label: "Fat", value: held.fatGoalG, unit: "g")
                HelixHeldRow(label: "Steps", value: held.stepsGoal, unit: "steps")
            } else {
                HelixNumberRow(label: "Calories", value: $draft.kcal, field: Field.kcal,
                               focus: $focus, unit: "kcal", range: 0...8000, onCommit: commitGoals)
                HelixNumberRow(label: "Protein", value: $draft.protein, field: Field.protein,
                               focus: $focus, unit: "g", range: 0...600, onCommit: commitGoals)
                HelixNumberRow(label: "Carbohydrate", value: $draft.carbs, field: Field.carbs,
                               focus: $focus, unit: "g", range: 0...900, onCommit: commitGoals)
                HelixNumberRow(label: "Fat", value: $draft.fat, field: Field.fat,
                               focus: $focus, unit: "g", range: 0...400, onCommit: commitGoals)
                HelixNumberRow(label: "Steps", value: $draft.steps, field: Field.steps,
                               focus: $focus, unit: "steps", range: 0...60000, onCommit: commitGoals)
            }
        } header: {
            HelixSectionHeader(model.heldBy == nil ? "Targets" : "Targets · held", .fuel)
        } footer: {
            targetsFooter
        }
    }

    /// Typing a number IS choosing "my own numbers" — a figure you typed that a
    /// rung then overrode would be a control that does nothing.
    private func commitGoals() {
        guard model.heldBy == nil else { return }
        model.saveGoals(
            kcal: draft.kcal, protein: draft.protein, carbs: draft.carbs,
            fat: draft.fat, steps: draft.steps
        )
    }

    @ViewBuilder
    private var targetsFooter: some View {
        if let held = model.heldBy {
            Text("\(held.label) is holding these. Choose My own numbers to edit them again.")
        } else if let gap = model.atwaterGap, abs(gap) >= 5 {
            // Only ever shown over the user's own numbers: every rung's triple
            // is asserted exact by its own vectors, so a gap there would be a
            // failing test, not a warning.
            Label(
                "The macros add up to \((model.shownGoals.calorie + gap).formatted(.number.precision(.fractionLength(0)))) kcal — \(gap > 0 ? "+" : "")\(gap.formatted(.number.precision(.fractionLength(0)))) against the calorie target.",
                systemImage: "exclamationmark.triangle"
            )
            .foregroundStyle(Color.helix.danger)
        } else {
            Text("Protein ×4, carbohydrate ×4, fat ×9 — the three should add up to the calorie target.")
        }
    }

    // MARK: - Recovery

    private var recovery: some View {
        Section {
            HelixNumberRow(label: "Active energy", value: $draft.activeCal, field: Field.activeCal,
                           focus: $focus, unit: "kcal", range: 0...3000, onCommit: commitRecovery)
            HelixNumberRow(label: "Sleep", value: $draft.sleep, field: Field.sleep,
                           focus: $focus, unit: "h", range: 0...16, fractionLength: 2,
                           onCommit: commitRecovery)
            HelixNumberRow(label: "Water", value: $draft.water, field: Field.water,
                           focus: $focus, unit: "ml", range: 0...8000, onCommit: commitRecovery)
        } header: {
            HelixSectionHeader("Recovery & activity", .recover)
        } footer: {
            Text("These belong to you rather than to the plan, so a rung never holds them.")
        }
    }

    private func commitRecovery() {
        model.saveRecovery(
            activeCalGoal: draft.activeCal, sleepHours: draft.sleep, waterMl: draft.water
        )
    }

    // MARK: - Draft

    private func loadDraft() {
        // Never while a field is being typed into. This fires when the server's
        // `updated_at` comes back from a sync round-trip, which is an arbitrary
        // moment and can land mid-keystroke.
        guard focus == nil else { return }
        let own = model.ownGoals
        draft.kcal = own.calorie == 0 ? nil : own.calorie
        draft.protein = own.protein
        draft.carbs = own.carbs
        draft.fat = own.fat
        draft.steps = own.steps
        draft.activeCal = model.goals?.activeCalGoal.map(Double.init)
        draft.sleep = model.goals?.sleepGoalHours
        draft.water = model.goals?.waterGoalMl.map(Double.init)
    }
}

#if DEBUG
#Preview("Levers") {
    NavigationStack {
        LeversView(model: SettingsModel(
            database: try! .inMemory(deviceId: "preview"), userId: "preview"
        ))
    }
}
#endif
