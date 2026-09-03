import SwiftUI
import HelixCore

/// The three sheets the Fuel tab presents. Stock `Form`s on the Solar ground —
/// the same rule as the You tab: a data-entry sheet that looks like every other
/// iOS form is the correct answer, and the identity arrives through the ground.

// MARK: - Macros

/// Hand-correct the whole day's macros: ONE `daily` row with the per-day
/// sentinel, which the next HealthKit sync leaves alone.
struct MacroOverrideSheet: View {
    let model: FuelModel
    @Environment(\.dismiss) private var dismiss

    @State private var kcal: Double?
    @State private var protein: Double?
    @State private var carbs: Double?
    @State private var fat: Double?
    @FocusState private var focus: Field?

    private enum Field: Hashable { case kcal, protein, carbs, fat }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HelixNumberRow(label: "Calories", value: $kcal, field: Field.kcal, focus: $focus, unit: "kcal", range: 0...8000)
                    HelixNumberRow(label: "Protein", value: $protein, field: Field.protein, focus: $focus, unit: "g", range: 0...600)
                    HelixNumberRow(label: "Carbohydrate", value: $carbs, field: Field.carbs, focus: $focus, unit: "g", range: 0...900)
                    HelixNumberRow(label: "Fat", value: $fat, field: Field.fat, focus: $focus, unit: "g", range: 0...400)
                } header: {
                    HelixSectionHeader("Whole day", .fuel)
                } footer: {
                    Text("Replaces the day's macros with one hand-entered row. Apple Health will not overwrite it afterwards; the score is recomputed from these.")
                }
            }
            .helixFormBackground(.fuel)
            .navigationTitle("Correct macros")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        // All four or nothing: the row's macro columns are NOT
                        // NULL, and a blank field written as 0 would be a claim
                        // that the day had no protein.
                        guard let kcal, let protein, let carbs, let fat else { return }
                        model.setManualMacros(kcal: kcal, protein: protein, carbs: carbs, fat: fat)
                        dismiss()
                    }
                    .disabled(kcal == nil || protein == nil || carbs == nil || fat == nil)
                }
                HelixKeyboardDone { focus = nil }
            }
            .onAppear {
                // Prefilled from what the day already holds, so a correction is
                // an edit of the real figures rather than a retype.
                kcal = model.eaten?.kcal
                protein = model.eaten?.protein
                carbs = model.eaten?.carbs
                fat = model.eaten?.fat
            }
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: - Day target

/// The one day's own target — a named shape in one tap, or four figures typed.
///
/// The highlighted shape comes from `TargetProfiles.matches`, not from the
/// stamp: a restaurant day nudged to 2,650 is still stamped "restaurant" and is
/// no longer 2,400, and a row claiming otherwise would show a selection that is
/// not true.
struct DayTargetSheet: View {
    let model: FuelModel
    @Environment(\.dismiss) private var dismiss

    @State private var kcal: Double?
    @State private var protein: Double?
    @State private var carbs: Double?
    @State private var fat: Double?
    @State private var steps: Double?
    @State private var trackCarbs = true
    @State private var trackFat = true
    @State private var note = ""
    /// The profile stamp the row carries — a label, kept through hand edits.
    @State private var stamp: String?
    @FocusState private var focus: Field?

    private enum Field: Hashable { case kcal, protein, carbs, fat, steps }

    private static let customKey = "custom"
    private static let rungKey = "rung"

    private var draft: DailyTarget {
        DailyTarget(
            date: model.date, kcal: kcal, proteinG: protein,
            carbsG: trackCarbs ? carbs : nil, fatG: trackFat ? fat : nil,
            stepsGoal: steps, note: note, profileKey: stamp,
            trackCarbs: trackCarbs, trackFat: trackFat
        )
    }

    private var selectedKey: String {
        if let match = model.profiles.first(where: { TargetProfiles.matches(draft, $0) }) { return match.key }
        return DailyTargets.hasTarget(draft) ? Self.customKey : Self.rungKey
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Day shape", selection: Binding(get: { selectedKey }, set: { pick($0) })) {
                        ForEach(model.profiles, id: \.key) { profile in
                            LabeledContent(profile.label) {
                                Text("\(FuelFormat.whole(profile.kcal)) kcal").helixNumeral()
                            }
                            .tag(profile.key)
                        }
                        Text("Custom").tag(Self.customKey)
                        Text("The rung").tag(Self.rungKey)
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                } header: {
                    HelixSectionHeader("Day shape", .fuel)
                } footer: {
                    Text(shapeFootnote)
                }

                Section {
                    HelixNumberRow(label: "Calories", value: $kcal, field: Field.kcal, focus: $focus, unit: "kcal", range: 0...8000)
                    HelixNumberRow(label: "Protein", value: $protein, field: Field.protein, focus: $focus, unit: "g", range: 0...600)
                    Toggle("Grade carbohydrate", isOn: $trackCarbs)
                    // Absent rather than disabled: a number box under a macro
                    // that is off invites the figure the profile exists to stop.
                    if trackCarbs {
                        HelixNumberRow(label: "Carbohydrate", value: $carbs, field: Field.carbs, focus: $focus, unit: "g", range: 0...900)
                    }
                    Toggle("Grade fat", isOn: $trackFat)
                    if trackFat {
                        HelixNumberRow(label: "Fat", value: $fat, field: Field.fat, focus: $focus, unit: "g", range: 0...400)
                    }
                    HelixNumberRow(label: "Steps", value: $steps, field: Field.steps, focus: $focus, unit: "steps", range: 0...60000)
                } header: {
                    HelixSectionHeader("Figures", .fuel)
                } footer: {
                    Text("Applies to \(FuelFormat.dayTitle(model.date)) only. Blank keeps whatever the rung asks for; a macro that is not graded does not count as a miss and does not enter the week's balance.")
                }

                Section {
                    TextField("Note", text: $note, axis: .vertical)
                        .lineLimit(1...3)
                } header: {
                    HelixSectionHeader("Note", .fuel)
                }

                if model.hasOverride {
                    Section {
                        Button("Use the rung", role: .destructive) {
                            model.clearDailyTarget()
                            dismiss()
                        }
                    } footer: {
                        Text("Drops the override. The day goes back to the rung in force.")
                    }
                }
            }
            .helixFormBackground(.fuel)
            .navigationTitle("Target for the day")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        model.saveDailyTarget(
                            kcal: kcal, protein: protein, carbs: trackCarbs ? carbs : nil, fat: trackFat ? fat : nil,
                            steps: steps, trackCarbs: trackCarbs, trackFat: trackFat, note: note,
                            profileKey: model.profiles.first(where: { TargetProfiles.matches(draft, $0) })?.key ?? stamp
                        )
                        dismiss()
                    }
                }
                HelixKeyboardDone { focus = nil }
            }
            .onAppear(perform: load)
        }
    }

    private var shapeFootnote: String {
        if let profile = model.profiles.first(where: { $0.key == selectedKey }) { return profile.summary }
        return selectedKey == Self.customKey
            ? "Your own figures below, for this day."
            : "No override — the rung in force answers."
    }

    /// The OVERRIDE row, not the resolved target: a blank field is "no opinion",
    /// and prefilling the rung's figure would turn that into a stated one on the
    /// first save.
    private func load() {
        let row = model.dailyTarget
        kcal = row?.kcal.map(Double.init)
        protein = row?.proteinG.map(Double.init)
        carbs = row?.carbsG.map(Double.init)
        fat = row?.fatG.map(Double.init)
        steps = row?.stepsGoal.map(Double.init)
        trackCarbs = row?.trackCarbs ?? true
        trackFat = row?.trackFat ?? true
        note = row?.note ?? ""
        stamp = row?.profileKey
    }

    /// A profile SNAPSHOTS its figures into the fields; the two non-profiles
    /// only move the stamp (and, for the rung, empty the form).
    private func pick(_ key: String) {
        focus = nil
        if let profile = model.profiles.first(where: { $0.key == key }) {
            let t = TargetProfiles.dailyTarget(profile, date: model.date)
            kcal = t.kcal
            protein = t.proteinG
            carbs = t.carbsG
            fat = t.fatG
            steps = t.stepsGoal
            trackCarbs = t.trackCarbs ?? true
            trackFat = t.trackFat ?? true
            stamp = profile.key
            return
        }
        stamp = nil
        if key == Self.rungKey {
            kcal = nil; protein = nil; carbs = nil; fat = nil; steps = nil
            trackCarbs = true
            trackFat = true
        }
    }
}

// MARK: - Water

/// Replace the day's water with one figure. The floor is not arbitrary: below
/// it the scorer reads the day as untracked, so a typed 50 ml would vanish.
struct WaterSheet: View {
    let model: FuelModel
    @Environment(\.dismiss) private var dismiss

    @State private var ml: Double?
    @FocusState private var focus: Field?

    private enum Field: Hashable { case ml }

    private var tooLow: Bool { (ml ?? 0) < FuelModel.minWaterMl }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HelixNumberRow(label: "Water", value: $ml, field: Field.ml, focus: $focus, unit: "ml",
                                   range: FuelModel.minWaterMl...20_000)
                    HStack(spacing: 8) {
                        ForEach([250.0, 500.0, 750.0], id: \.self) { step in
                            Button("+\(FuelFormat.whole(step))") {
                                focus = nil
                                ml = (ml ?? 0) + step
                            }
                            .buttonStyle(.bordered)
                            .tint(Color.helix.accent(.fuel))
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .accessibilityLabel("Add \(FuelFormat.whole(step)) millilitres")
                        }
                    }
                    .helixNumeral()
                } header: {
                    HelixSectionHeader("Total for the day", .fuel)
                } footer: {
                    Text(tooLow
                         ? "Below \(FuelFormat.whole(FuelModel.minWaterMl)) ml the day would read as untracked rather than as a low day. To leave it blank, use Apple Health below."
                         : "Replaces the day's water entirely. Apple Health will not overwrite it afterwards.")
                }

                if model.isWaterManual {
                    Section {
                        Button("Use Apple Health") {
                            model.clearWater()
                            dismiss()
                        }
                    } footer: {
                        Text("Clears the hand-entered figure. The next Health sync fills the day again; until then it reads as untracked.")
                    }
                }
            }
            .helixFormBackground(.fuel)
            .navigationTitle("Set water")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        if let ml { model.setWater(ml: ml) }
                        dismiss()
                    }
                    .disabled(ml == nil || tooLow)
                }
                HelixKeyboardDone { focus = nil }
            }
            .onAppear { ml = model.waterMl }
        }
        .presentationDetents([.medium, .large])
    }
}
