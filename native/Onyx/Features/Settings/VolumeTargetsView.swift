import SwiftUI
import OnyxUI
import OnyxCore

/// Weekly set targets, one per landmark muscle.
///
/// ── WHY A STEPPER AND NOT A TEXT FIELD ──────────────────────────────────────
/// These are small integers that move by one. A numeric keypad for a value
/// between 0 and about 15 is three taps and a keyboard covering the list; a
/// `Stepper` is one tap, holds to repeat, is a 44 pt target at every Dynamic
/// Type size, and reads correctly to VoiceOver and Switch Control without any
/// help. The web version used sixteen uncontrolled text inputs remounted by a
/// React `key` to reset them — the shape of that control was a workaround.
///
/// ── AND WHY THEY ARE GROUPED BY FAMILY ──────────────────────────────────────
/// Sixteen ungrouped rows is a wall. Grouping them by the eight families is the
/// same grouping every chart in the app now uses, and the header wears the
/// family's own colour — which is the colour those muscles draw in. It was
/// grouped by the four DOMAIN accents until W3, where "Chest, shoulders & arms"
/// was one indigo section of seven muscles: the grouping existed, but it was the
/// palette's collapse rather than the taxonomy.
struct VolumeTargetsView: View {
    let model: SettingsModel

    var body: some View {
        Form {
            ForEach(MuscleFamily.allCases, id: \.self) { family in
                Section {
                    ForEach(family.members, id: \.self) { muscle in
                        row(muscle)
                    }
                } header: {
                    OnyxSectionHeader(family.rawValue, color: Color.onyx.muscleFamily(family))
                }
            }
        }
        .onyxFormBackground(.train)
        .navigationTitle("Weekly set volume")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.observe() }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Text(model.volumeTotal, format: .number)
                    .onyxNumeral()
                    .foregroundStyle(Color.onyx.textSecondary)
                    .accessibilityLabel("\(model.volumeTotal) sets a week in total")
            }
        }
    }

    private func row(_ muscle: LandmarkMuscle) -> some View {
        let value = model.volumeTarget(muscle)
        return Stepper(
            value: Binding(
                get: { value },
                set: { model.setVolumeTarget(muscle, sets: $0) }
            ),
            in: 0...40
        ) {
            LabeledContent(muscle.displayName) {
                // Not colour-only, and not `textTertiary`: that token fails
                // 4.5:1 by design and this is a value. Zero says "none".
                Text(value == 0 ? "none" : value.formatted(.number))
                    .onyxNumeral()
                    .foregroundStyle(
                        value == 0 ? Color.onyx.textSecondary : Color.onyx.textPrimary
                    )
            }
        }
        .accessibilityValue("\(value) sets a week")
    }

}

#if DEBUG
#Preview("Volume targets") {
    NavigationStack {
        VolumeTargetsView(model: SettingsModel(
            database: try! .inMemory(deviceId: "preview"), userId: "preview"
        ))
    }
}
#endif
