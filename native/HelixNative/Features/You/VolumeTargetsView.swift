import SwiftUI
import HelixUI
import HelixCore

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
/// ── AND WHY THEY ARE GROUPED BY DOMAIN ──────────────────────────────────────
/// Sixteen ungrouped rows is a wall. The four accents already say which family a
/// muscle belongs to everywhere else in the app, so the sections use the same
/// mapping: the colour of the header is the colour that muscle draws in.
struct VolumeTargetsView: View {
    let model: YouModel

    var body: some View {
        Form {
            ForEach(HelixDomain.allCases, id: \.self) { domain in
                let muscles = LandmarkMuscle.allCases.filter { HelixDomain.forMuscle($0) == domain }
                if !muscles.isEmpty {
                    Section {
                        ForEach(muscles, id: \.self) { muscle in
                            row(muscle)
                        }
                    } header: {
                        HelixSectionHeader(heading(domain), domain)
                    }
                }
            }
        }
        .helixFormBackground(.train)
        .navigationTitle("Weekly set volume")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.observe() }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Text(model.volumeTotal, format: .number)
                    .helixNumeral()
                    .foregroundStyle(Color.helix.textSecondary)
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
                    .helixNumeral()
                    .foregroundStyle(
                        value == 0 ? Color.helix.textSecondary : Color.helix.textPrimary
                    )
            }
        }
        .accessibilityValue("\(value) sets a week")
    }

    /// The domains, named for what they mean on THIS screen. "Train" is every
    /// pushing and pulling muscle here, which is not a useful heading for a list
    /// of them.
    private func heading(_ domain: HelixDomain) -> String {
        switch domain {
        case .train:   "Chest, shoulders & arms"
        case .body:    "Back & legs"
        case .recover: "Core"
        case .fuel:    "Other"
        }
    }
}

#Preview("Volume targets") {
    NavigationStack {
        VolumeTargetsView(model: YouModel(
            database: try! .inMemory(deviceId: "preview"), userId: "preview"
        ))
    }
}
