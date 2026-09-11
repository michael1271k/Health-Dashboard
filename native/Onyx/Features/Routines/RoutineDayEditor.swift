import SwiftUI
import OnyxCore
import OnyxData
import OnyxUI

/// One day's movements and their prescriptions.
///
/// ── IT HOLDS A KEY, NOT A COPY ──────────────────────────────────────────────
/// The day is looked up from the model on every draw. A `@State` copy would go
/// stale the moment any write reloaded the list — which every write here does —
/// and the screen would then save an older version of the day over a newer one.
/// The cost is a dictionary lookup per frame; the alternative is a lost edit.
struct RoutineDayEditor: View {
    @Bindable var model: RoutinesModel
    let dayKey: String

    @State private var picking = false
    @FocusState private var focus: Field?

    enum Field: Hashable {
        case sets(Int), cutSets(Int), rest(Int), load(Int)
    }

    private var day: RoutineDay? { model.day(dayKey) }

    var body: some View {
        Group {
            if let day {
                editor(day)
            } else {
                // The day was deleted from under this screen — a swipe on the
                // list behind it, or a pull that removed it. A blank screen is
                // better than a crash and better than resurrecting the row.
                ContentUnavailableView("This day is gone", systemImage: "calendar.badge.minus")
            }
        }
        .navigationTitle(day?.label ?? "Day")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if day != nil { EditButton() }
        }
        .toolbar { OnyxKeyboardDone { focus = nil } }
        .sheet(isPresented: $picking) {
            if let day {
                ExercisePickerSheet(model: model, day: day)
            }
        }
    }

    private func editor(_ day: RoutineDay) -> some View {
        List {
            Section {
                LabeledContent("Name") {
                    TextField("Upper A", text: Binding(
                        get: { day.label },
                        set: { model.rename(day, to: $0) }
                    ))
                    .multilineTextAlignment(.trailing)
                    .foregroundStyle(Color.onyx.textPrimary)
                }
                LabeledContent("Focus") {
                    TextField("Chest + Back", text: Binding(
                        get: { day.sub ?? "" },
                        set: { model.setSub(day, $0) }
                    ))
                    .multilineTextAlignment(.trailing)
                    .foregroundStyle(Color.onyx.textPrimary)
                }
                Picker("Weekday", selection: Binding(
                    get: { day.weekday },
                    set: { model.setWeekday(day, $0) }
                )) {
                    ForEach(0..<7, id: \.self) { index in
                        Text(RoutineBuilderView.weekdayNames[index]).tag(index)
                    }
                }
            } header: {
                OnyxSectionHeader("The day", .train)
            } footer: {
                // The key is the identity every logged session references. It is
                // deliberately not editable and worth saying so once.
                Text("Renaming is safe — sessions you have already logged stay attached to this day.")
            }

            Section {
                ForEach(Array(day.payload.exercises.enumerated()), id: \.offset) { index, exercise in
                    row(exercise, at: index, in: day)
                }
                .onDelete { model.removeExercises(at: $0, in: day) }
                .onMove { model.moveExercises(from: $0, to: $1, in: day) }
            } header: {
                OnyxSectionHeader("Movements", .train)
            } footer: {
                Text(day.payload.exercises.isEmpty
                     ? "Nothing here yet. The logger opens this day empty."
                     : "Drag to reorder — this is the order the logger deals them in. Swipe to remove.")
            }

            Section {
                Button {
                    picking = true
                } label: {
                    Label("Add a movement", systemImage: "plus")
                }
            }
        }
        .onyxFormBackground(.train)
    }

    /// One movement, opened out.
    ///
    /// ── EVERYTHING ON ONE ROW, NOT BEHIND A PUSH ────────────────────────────
    /// Four numbers per movement and eight movements per day. A detail screen
    /// per movement would be thirty-two pushes to write one session, and the
    /// whole reason people abandon routine builders. The fields are small and
    /// wrap, so AX5 stacks them rather than truncating.
    private func row(_ exercise: RoutineExercise, at index: Int, in day: RoutineDay) -> some View {
        VStack(alignment: .leading, spacing: OnyxSpace.s) {
            Text(exercise.name)
                .onyxType(.body).fontWeight(.semibold)
                .foregroundStyle(Color.onyx.textPrimary)

            FlowRow(spacing: OnyxSpace.m) {
                field("Sets", exercise.sets, .sets(index), 1...12) { value in
                    var updated = exercise
                    updated.sets = value
                    model.updateExercise(updated, at: index, in: day)
                }
                // A cut drops assistance volume, and a deck that cannot say so
                // is a deck that has to be rewritten every phase change. `nil`
                // means "same as sets", which is the common case and the reason
                // this is a separate optional rather than a second required
                // number.
                optionalField("On a cut", exercise.cutSets, .cutSets(index), 0...12) { value in
                    var updated = exercise
                    updated.cutSets = value
                    model.updateExercise(updated, at: index, in: day)
                }
                optionalField("Rest", exercise.restSec, .rest(index), 0...600, unit: "s") { value in
                    var updated = exercise
                    updated.restSec = value
                    model.updateExercise(updated, at: index, in: day)
                }
            }

            HStack(spacing: OnyxSpace.m) {
                LabeledContent("Reps") {
                    TextField("8–12", text: Binding(
                        get: { exercise.reps },
                        set: { new in
                            var updated = exercise
                            updated.reps = new
                            model.updateExercise(updated, at: index, in: day)
                        }
                    ))
                    .multilineTextAlignment(.trailing)
                    .foregroundStyle(Color.onyx.textPrimary)
                }
            }

            OnyxNumberRow(
                label: "Starting load",
                value: Binding(
                    get: { exercise.wk1Kg },
                    set: { new in
                        var updated = exercise
                        updated.wk1Kg = new
                        model.updateExercise(updated, at: index, in: day)
                    }
                ),
                field: Field.load(index), focus: $focus,
                unit: "kg", range: 0...500, fractionLength: 2
            )
        }
        .padding(.vertical, OnyxSpace.xs)
    }

    private func field(
        _ label: String, _ value: Int, _ field: Field, _ range: ClosedRange<Int>,
        _ set: @escaping (Int) -> Void
    ) -> some View {
        Stepper(value: Binding(get: { value }, set: set), in: range) {
            LabeledContent(label) {
                Text(value.formatted(.number))
                    .onyxNumeral()
                    .foregroundStyle(Color.onyx.textPrimary)
            }
        }
        .accessibilityValue("\(value)")
    }

    /// A stepper over an OPTIONAL count, where the bottom of the range means
    /// "not set" rather than zero.
    private func optionalField(
        _ label: String, _ value: Int?, _ field: Field, _ range: ClosedRange<Int>,
        unit: String = "", _ set: @escaping (Int?) -> Void
    ) -> some View {
        let shown = value ?? range.lowerBound
        return Stepper(
            value: Binding(
                get: { value ?? (range.lowerBound - 1) },
                // Below the range is the "not set" rung: stepping down off the
                // bottom clears the field rather than clamping to it, which is
                // the only way to get back to nil without a second control.
                set: { set($0 < range.lowerBound ? nil : $0) }
            ),
            in: (range.lowerBound - 1)...range.upperBound
        ) {
            LabeledContent(label) {
                Text(value == nil ? "—" : "\(shown.formatted(.number))\(unit)")
                    .onyxNumeral()
                    .foregroundStyle(value == nil ? Color.onyx.textSecondary : Color.onyx.textPrimary)
            }
        }
        .accessibilityValue(value == nil ? "Not set" : "\(shown)")
    }
}

/// Pick a movement, or make one.
///
/// ── SEARCH THAT OFFERS TO CREATE IS THE WHOLE SCREEN ────────────────────────
/// A picker that can only pick is a dead end the first time someone's gym has a
/// machine this catalogue has never heard of, and the answer to a dead end in a
/// routine builder is that people stop using the routine builder. So the search
/// field doubles as the new-movement field, and the create goes through
/// `createExercise`, which refuses to make a second row for a name that already
/// exists — a SPLIT is the silent failure `ExerciseIndex` exists to prevent.
private struct ExercisePickerSheet: View {
    let model: RoutinesModel
    let day: RoutineDay

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var matches: [Exercise] {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return model.catalogue }
        return model.catalogue.filter { $0.name.localizedCaseInsensitiveContains(trimmed) }
    }

    /// The typed name is not already a movement, so offer to make it one.
    private var creatable: String? {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        let key = trimmed.lowercased()
        return model.catalogue.contains { $0.name.lowercased() == key } ? nil : trimmed
    }

    var body: some View {
        NavigationStack {
            List {
                if let creatable {
                    Section {
                        Button {
                            model.createAndAdd(creatable, to: day)
                            dismiss()
                        } label: {
                            Label("Add “\(creatable)”", systemImage: "plus.circle")
                        }
                    } footer: {
                        Text("Creates it in your exercise list and puts it in this day.")
                    }
                }
                Section {
                    ForEach(matches, id: \.id) { exercise in
                        Button {
                            model.addExercise(exercise.name, to: day)
                            dismiss()
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(exercise.name)
                                    .foregroundStyle(Color.onyx.textPrimary)
                                // What it trains, resolved the way every reader
                                // resolves it — so the picker and the muscle
                                // sheet cannot disagree.
                                if let muscles = MuscleMap.muscleGroups(exercise.name),
                                   let first = muscles.first {
                                    Text(first.capitalized)
                                        .onyxType(.caption)
                                        .foregroundStyle(Color.onyx.textSecondary)
                                }
                            }
                            .frame(minHeight: 44, alignment: .leading)
                        }
                    }
                } header: {
                    OnyxSectionHeader(model.catalogue.isEmpty ? "Your exercises" : "\(matches.count) movements", .train)
                } footer: {
                    if model.catalogue.isEmpty {
                        Text("Your exercise list is empty. Type a name above to add your first movement, or import a CSV from Settings.")
                    }
                }
            }
            .onyxFormBackground(.train)
            .searchable(text: $query, prompt: "Search or type a new movement")
            .navigationTitle("Add a movement")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .tint(OnyxDomain.train.accent)
        .presentationBackground(Color.onyx.base)
        .preferredColorScheme(.dark)
    }
}
