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
struct ScaleTile: View {
    let model: DayModel
    @State private var entering = false
    @State private var choosingReason = false

    var body: some View {
        let log = model.log
        let fields = BodyCompFields(
            weightKg: log?.weightKg, bodyFatPct: log?.bodyFatPct,
            muscleMassKg: log?.muscleMassKg, skeletalMuscleMassKg: log?.skeletalMuscleMassKg
        )
        DayTile("Scale", .body) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), alignment: .topLeading)], alignment: .leading, spacing: 14) {
                DayMetric(label: "Weight", value: DayFormat.number(log?.weightKg, unit: "kg"))
                DayMetric(label: "Body fat", value: DayFormat.number(log?.bodyFatPct, unit: "%"))
                DayMetric(label: "Lean soft tissue", value: DayFormat.number(log?.muscleMassKg, unit: "kg"))
                DayMetric(label: "Skeletal muscle", value: DayFormat.number(log?.skeletalMuscleMassKg, unit: "kg"))
                DayMetric(label: "Fat mass", value: DayFormat.number(log?.fatMassKg, unit: "kg"))
                DayMetric(
                    label: "W:H ratio", value: DayFormat.number(log?.estimatedWaistToHipRatio, fraction: 2),
                    detail: log?.estimatedWaistToHipRatio.map { BodyComposition.whrBand($0).rawValue.capitalized }
                )
                DayMetric(
                    label: "Visceral", value: DayFormat.number(log?.visceralFat, fraction: 0),
                    detail: log?.visceralFat.map { BodyComposition.visceralBand($0).rawValue.capitalized }
                )
            }

            if let gap = CompGap.gapLabel(fields) ?? CompGap.gapShort(fields).map({ "Partial reading — \($0)" }) {
                Label(gap, systemImage: "scalemass")
                    .font(.footnote)
                    .foregroundStyle(Color.helix.textSecondary)
            }

            if log?.weightKg == nil {
                skipRow(current: WeighIn.skipReason(log?.weighinSkipReason))
            }

            Button { entering = true } label: {
                Label("Enter InBody reading", systemImage: "square.and.pencil")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.helix.accent(.body))
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .helixPress(scale: 0.98)
            .helixGlass(.row)
        }
        .sheet(isPresented: $entering) {
            InBodyEntryView(model: model)
        }
    }

    /// Why there is no weight. "As Planned" is the default and is never stored.
    private func skipRow(current: String) -> some View {
        Button { choosingReason = true } label: {
            HStack(spacing: 8) {
                Text("No weigh-in")
                    .font(.subheadline)
                    .foregroundStyle(Color.helix.textSecondary)
                Text(current)
                    .font(.subheadline.weight(.semibold))
                Spacer(minLength: 0)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption2)
                    .foregroundStyle(Color.helix.textTertiary)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .helixPress(scale: 0.98)
        .helixGlass(.row)
        .accessibilityLabel("Weigh-in skipped, \(current)")
        .accessibilityHint("Change the reason")
        .confirmationDialog("Why no weigh-in?", isPresented: $choosingReason, titleVisibility: .visible) {
            ForEach(WeighIn.skipReasons, id: \.self) { reason in
                Button(reason) { model.setWeighInSkipReason(reason) }
            }
        } message: {
            Text("Currently \(current). \"\(WeighIn.skipReason(nil))\" is the protocol and is not stored.")
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
