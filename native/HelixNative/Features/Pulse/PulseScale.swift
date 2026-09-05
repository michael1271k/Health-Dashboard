import SwiftUI
import HelixUI
import HelixCore
import HelixData

/// What the scale said this morning, or why it did not.
///
/// ── THREE METRICS THAT ARE NOT THE SAME METRIC ──────────────────────────────
/// `muscle_mass_kg` is LEAN SOFT TISSUE (weight × muscle %, ~50 kg) and is
/// labelled so; skeletal muscle (~27 kg) is the scale's own separate reading.
/// They have shared a label before and it cost the app a season of wrong
/// deltas. No tape measurements: the W:H ratio is one float the scale reports.
///
/// ── AND WHY THIS IS NOW A ROW ───────────────────────────────────────────────
/// The tile drew seven metrics in a grid, a gap sentence, a skip-reason row and
/// a full-width button — a quarter of the screen for a reading taken once a
/// week, most days showing seven em dashes. §5.7 asks for a row: what the last
/// weigh-in said, why there is not one, and the `+` that opens the form. The
/// seven metrics live in the form itself and in Body trends, which is the
/// screen about how they MOVE.
struct ScaleRow: View {
    let model: DayModel
    let onEnter: () -> Void

    @State private var choosingReason = false

    private var log: DailyLogRow? { model.log }

    /// "64.8 kg · 15.2 % fat", or the skip reason, or the invitation.
    private var detail: String {
        if let weight = log?.weightKg {
            var parts = ["\(DayFormat.number(weight)) kg"]
            if let fat = log?.bodyFatPct { parts.append("\(DayFormat.number(fat)) % fat") }
            if let skeletal = log?.skeletalMuscleMassKg { parts.append("\(DayFormat.number(skeletal)) kg SMM") }
            return parts.joined(separator: " · ")
        }
        return "No weigh-in · \(WeighIn.skipReason(log?.weighinSkipReason))"
    }

    var body: some View {
        PulseRow(
            symbol: "scalemass",
            title: "Scale",
            detail: detail,
            spoken: log?.weightKg == nil
                ? "no weigh-in, \(WeighIn.skipReason(log?.weighinSkipReason))"
                : detail,
            action: onEnter
        ) {
            // The reason is only ever offered on a day with no reading, and it
            // is a SECOND control on the row — long-press rather than a second
            // chevron, which would make one row look like two.
            EmptyView()
        }
        .contextMenu {
            Button("Enter InBody reading", systemImage: "square.and.pencil", action: onEnter)
            if log?.weightKg == nil {
                Button("Why no weigh-in…", systemImage: "questionmark.circle") { choosingReason = true }
            }
        }
        .confirmationDialog("Why no weigh-in?", isPresented: $choosingReason, titleVisibility: .visible) {
            ForEach(WeighIn.skipReasons, id: \.self) { reason in
                Button(reason) { model.setWeighInSkipReason(reason) }
            }
        } message: {
            Text("Currently \(WeighIn.skipReason(log?.weighinSkipReason)). \"\(WeighIn.skipReason(nil))\" is the protocol and is not stored.")
        }
    }
}

// MARK: - The InBody form

/// The eleven numbers the scale reports, and the five masses derived from them.
///
/// Derived masses are SHOWN, never entered — weight × % is the one place the
/// app does arithmetic on a body, and it does it here in front of the user. The
/// previous reading is offered as context beside each empty field and filled
/// into the edit buffer on request; nothing is written until Save.
struct InBodyEntryView: View {
    let model: DayModel
    @Environment(\.dismiss) private var dismiss

    @State private var draft: [Field: Double] = [:]
    @State private var last: DailyLogRow?
    @FocusState private var focus: Field?

    enum Field: Hashable, CaseIterable {
        case weight, bmi, bodyFat, muscle, water, protein, bone, visceral, bmr, skeletal, whr
    }

    private struct Spec {
        let field: Field
        let label: String
        let unit: String?
        let fraction: Int
        let range: ClosedRange<Double>
        let key: WritableKeyPath<DailyLogRow, Double?> & Sendable
    }

    private static let specs: [Spec] = [
        Spec(field: .weight, label: "Weight", unit: "kg", fraction: 1, range: 0...300, key: \.weightKg),
        Spec(field: .bmi, label: "BMI", unit: nil, fraction: 1, range: 0...80, key: \.bmi),
        Spec(field: .bodyFat, label: "Body fat", unit: "%", fraction: 1, range: 0...70, key: \.bodyFatPct),
        Spec(field: .muscle, label: "Muscle", unit: "%", fraction: 1, range: 0...100, key: \.musclePercent),
        Spec(field: .water, label: "Water", unit: "%", fraction: 1, range: 0...100, key: \.waterPercent),
        Spec(field: .protein, label: "Protein", unit: "%", fraction: 1, range: 0...50, key: \.proteinPercent),
        Spec(field: .bone, label: "Bone mineral", unit: "%", fraction: 2, range: 0...20, key: \.boneMineral),
        Spec(field: .visceral, label: "Visceral fat", unit: "level", fraction: 0, range: 0...60, key: \.visceralFat),
        Spec(field: .bmr, label: "BMR", unit: "kcal", fraction: 0, range: 0...5000, key: \.bmr),
        Spec(field: .skeletal, label: "Skeletal muscle", unit: "kg", fraction: 1, range: 0...100, key: \.skeletalMuscleMassKg),
        Spec(field: .whr, label: "W:H ratio", unit: nil, fraction: 2, range: 0...2, key: \.estimatedWaistToHipRatio),
    ]

    private func stored(_ spec: Spec) -> Double? { model.log?[keyPath: spec.key] }

    /// The previous reading, offered only while this day has none of its own.
    private func carried(_ spec: Spec) -> Double? {
        draft[spec.field] == nil ? last?[keyPath: spec.key] : nil
    }

    private var edits: [Spec] {
        Self.specs.filter { draft[$0.field] != nil && draft[$0.field] != stored($0) }
    }

    private var fillable: [Spec] { Self.specs.filter { carried($0) != nil } }

    private var derived: BodyCompDerived {
        BodyComposition.derive(BodyCompInput(
            weightKg: draft[.weight], bodyFatPct: draft[.bodyFat], musclePercent: draft[.muscle],
            waterPercent: draft[.water], boneMineral: draft[.bone], proteinPercent: draft[.protein]
        ))
    }

    var body: some View {
        DaySheet("InBody reading", domain: .body, glass: false, primary: ("Save", !edits.isEmpty, save)) {
            Form {
                if !fillable.isEmpty, let lastDate = last?.date {
                    Section {
                        Button {
                            for spec in fillable { draft[spec.field] = last?[keyPath: spec.key] }
                        } label: {
                            Label(
                                "Fill \(fillable.count) empty \(fillable.count == 1 ? "field" : "fields") from \(Swap.shortDayLabel(lastDate))",
                                systemImage: "clock.arrow.circlepath"
                            )
                        }
                        .accessibilityHint("Fills the form only. Nothing is saved until you press Save.")
                    }
                }

                Section {
                    ForEach(Self.specs, id: \.field) { spec in
                        HelixNumberRow(
                            label: carried(spec).map { "\(spec.label) · last \(DayFormat.number($0, fraction: spec.fraction))" } ?? spec.label,
                            value: Binding(get: { draft[spec.field] }, set: { draft[spec.field] = $0 }),
                            field: spec.field, focus: $focus,
                            unit: spec.unit, range: spec.range, fractionLength: spec.fraction
                        )
                    }
                } header: {
                    HelixSectionHeader("From the scale", .body)
                } footer: {
                    Text("Blank stays blank — a reading the scale did not give is not zero. Skeletal muscle and the W:H ratio are the scale's own figures; neither can be derived.")
                }

                Section {
                    derivedRow("Lean soft tissue", derived.muscleMassKg)
                    derivedRow("Fat mass", derived.fatMassKg)
                    derivedRow("Water mass", derived.waterMassKg)
                    derivedRow("Protein mass", derived.proteinMassKg)
                    derivedRow("Fat-free mass", derived.fatFreeMassKg)
                } header: {
                    HelixSectionHeader("Composition", .body)
                } footer: {
                    Text("Weight × percentage, computed as you type and saved with the reading. Lean soft tissue is not skeletal muscle.")
                }
            }
            .toolbar { HelixKeyboardDone { focus = nil } }
        }
        .onAppear {
            for spec in Self.specs { draft[spec.field] = stored(spec) }
            last = try? model.latestBodyReading()
        }
    }

    private func derivedRow(_ label: String, _ value: Double?) -> some View {
        HelixHeldRow(label: label, value: value, unit: "kg")
    }

    private func save() {
        let patch = edits.compactMap { spec in draft[spec.field].map { (spec.key, $0) } }
        let masses = derived
        let landed = model.saveBody { row in
            for (key, value) in patch { row[keyPath: key] = value }
            if let v = masses.fatMassKg { row.fatMassKg = v }
            if let v = masses.fatFreeMassKg { row.fatFreeMassKg = v }
            if let v = masses.muscleMassKg { row.muscleMassKg = v }
            if let v = masses.waterMassKg { row.waterMassKg = v }
            if let v = masses.boneMineralKg { row.boneMineralKg = v }
            if let v = masses.proteinMassKg { row.proteinMassKg = v }
        }
        if landed { dismiss() }
    }
}
