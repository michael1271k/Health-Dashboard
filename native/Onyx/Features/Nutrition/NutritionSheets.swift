import SwiftUI
import OnyxUI
import OnyxCore

/// The two `Form` sheets the Nutrition tab presents. Stock forms on the Solar
/// ground — the same rule as the Settings tab: a data-entry sheet that looks
/// like every other iOS form is the correct answer, and the identity arrives
/// through the ground.
///
/// The third sheet, `MacroEditSheet`, is deliberately NOT a form: correcting
/// four numbers that must add up is not typing, it is nudging. It has its own
/// file.

// MARK: - Day target

/// The one day's own target — a named shape in one tap, or four figures typed.
///
/// The highlighted shape comes from `TargetProfiles.matches`, not from the
/// stamp: a restaurant day nudged to 2,650 is still stamped "restaurant" and is
/// no longer 2,400, and a row claiming otherwise would show a selection that is
/// not true.
struct DayTargetSheet: View {
    let model: NutritionModel
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
    /// `daily_logs`, not `daily_targets` — a different table, saved together.
    @State private var exception = ""
    @State private var estimated = false
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
                                Text("\(NutritionFormat.whole(profile.kcal)) kcal").onyxNumeral()
                            }
                            .tag(profile.key)
                        }
                        Text("Custom").tag(Self.customKey)
                        Text("The rung").tag(Self.rungKey)
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                } header: {
                    OnyxSectionHeader("Day shape", .fuel)
                } footer: {
                    Text(shapeFootnote)
                }

                Section {
                    OnyxNumberRow(label: "Calories", value: $kcal, field: Field.kcal, focus: $focus, unit: "kcal", range: 0...8000)
                    OnyxNumberRow(label: "Protein", value: $protein, field: Field.protein, focus: $focus, unit: "g", range: 0...600)
                    Toggle("Grade carbohydrate", isOn: $trackCarbs)
                    // Absent rather than disabled: a number box under a macro
                    // that is off invites the figure the profile exists to stop.
                    if trackCarbs {
                        OnyxNumberRow(label: "Carbohydrate", value: $carbs, field: Field.carbs, focus: $focus, unit: "g", range: 0...900)
                    }
                    Toggle("Grade fat", isOn: $trackFat)
                    if trackFat {
                        OnyxNumberRow(label: "Fat", value: $fat, field: Field.fat, focus: $focus, unit: "g", range: 0...400)
                    }
                    OnyxNumberRow(label: "Steps", value: $steps, field: Field.steps, focus: $focus, unit: "steps", range: 0...60000)
                } header: {
                    OnyxSectionHeader("Figures", .fuel)
                } footer: {
                    Text("Applies to \(NutritionFormat.dayTitle(model.date)) only. Blank keeps whatever the rung asks for; a macro that is not graded does not count as a miss and does not enter the week's balance.")
                }

                // ── WHAT THE DELETED "Context" CARD HELD ────────────────────
                // The exception and the estimated flag are not figures, but
                // they are the two other things that make a day's grading
                // different from an ordinary one — which is exactly what this
                // sheet is for. They lived in a 200 pt card on the tab; here
                // they cost two rows and the tab gets a chip that states them.
                Section {
                    // Drafts, like every other field here. Bound straight to
                    // the model they wrote — and enqueued — the instant they
                    // changed, under a Cancel button that could not undo them.
                    Picker("Exception day", selection: $exception) {
                        Text("None").tag("")
                        ForEach(reasons, id: \.self) { Text($0).tag($0) }
                    }
                    Toggle("Estimated", isOn: $estimated)
                } header: {
                    OnyxSectionHeader("Context", .fuel)
                } footer: {
                    Text("An exception is graded on protein only — intake still counts toward the week and the trend. Estimated forgives nothing; it only marks the numbers as a guess.")
                }

                Section {
                    TextField("Note", text: $note, axis: .vertical)
                        .lineLimit(1...3)
                } header: {
                    OnyxSectionHeader("Note", .fuel)
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
            .onyxFormBackground(.fuel)
            .navigationTitle("Target for the day")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        if exception != (model.exceptionReason ?? "") {
                            model.setException(exception.isEmpty ? nil : exception)
                        }
                        if estimated != model.isEstimated { model.setEstimated(estimated) }
                        model.saveDailyTarget(
                            kcal: kcal, protein: protein, carbs: trackCarbs ? carbs : nil, fat: trackFat ? fat : nil,
                            steps: steps, trackCarbs: trackCarbs, trackFat: trackFat, note: note,
                            profileKey: model.profiles.first(where: { TargetProfiles.matches(draft, $0) })?.key ?? stamp
                        )
                        dismiss()
                    }
                }
                OnyxKeyboardDone { focus = nil }
            }
            .onAppear(perform: load)
        }
    }

    /// A stored reason that is not a preset still counts; the menu must be able
    /// to show it rather than an empty selection.
    private var reasons: [String] {
        var out = ExceptionDay.reasons
        if let stored = model.exceptionReason, !out.contains(stored) { out.append(stored) }
        return out
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
        exception = model.exceptionReason ?? ""
        estimated = model.isEstimated
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
    let model: NutritionModel
    @Environment(\.dismiss) private var dismiss

    @State private var ml: Double?
    @FocusState private var focus: Field?

    private enum Field: Hashable { case ml }

    private var tooLow: Bool { (ml ?? 0) < NutritionModel.minWaterMl }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    OnyxNumberRow(label: "Water", value: $ml, field: Field.ml, focus: $focus, unit: "ml",
                                   range: NutritionModel.minWaterMl...20_000)
                    HStack(spacing: OnyxSpace.s) {
                        ForEach([250.0, 500.0, 750.0], id: \.self) { step in
                            Button("+\(NutritionFormat.whole(step))") {
                                focus = nil
                                ml = (ml ?? 0) + step
                            }
                            .buttonStyle(.bordered)
                            .tint(Color.onyx.accent(.fuel))
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .accessibilityLabel("Add \(NutritionFormat.whole(step)) millilitres")
                        }
                    }
                    .onyxNumeral()
                } header: {
                    OnyxSectionHeader("Total for the day", .fuel)
                } footer: {
                    Text(tooLow
                         ? "Below \(NutritionFormat.whole(NutritionModel.minWaterMl)) ml the day would read as untracked rather than as a low day. To leave it blank, use Apple Health below."
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
            .onyxFormBackground(.fuel)
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
                OnyxKeyboardDone { focus = nil }
            }
            .onAppear { ml = model.waterMl }
        }
        .presentationDetents([.medium, .large])
    }
}
