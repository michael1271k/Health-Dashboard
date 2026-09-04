import SwiftUI
import HelixUI
import HelixCore
import HelixData

/// The form that adds a bout.
///
/// ── WHY IT LIVES UNDER `Workout/` NOW ───────────────────────────────────────
/// It was `CardioTile` on the Pulse tab, between sleep and the scale. A bout is
/// TRAINING — it belongs beside the session it was done around, and §5.7 takes
/// it off Pulse for exactly that reason. Moving it also cut its dependency on
/// `DayModel`: the sheet needs a user, a date and somewhere to put the row, and
/// taking those three as arguments is what let the Workout tab present it
/// without opening eleven observations it has no other use for.
///
/// Pace is DERIVED and read-only: distance and duration are the facts, and a
/// stored pace drifts the moment either is corrected.
struct CardioLogSheet: View {
    let userId: String
    let date: String
    /// Returns false when the write failed, which keeps the sheet open with the
    /// figures still in it rather than swallowing the bout.
    let onSave: (CardioLogRow) -> Bool

    @Environment(\.dismiss) private var dismiss

    @State private var kind = "walk"
    @State private var km: Double?
    @State private var minutes: Double?
    @State private var incline: Double?
    @State private var kcal: Double?
    @State private var avgHr: Double?
    @State private var effort: Int?
    @FocusState private var focus: Field?

    private enum Field: Hashable { case km, minutes, incline, kcal, avgHr }

    private var pace: String {
        CardioMetrics.formatPace(CardioMetrics.paceMinPerKm(distanceM: km.map { $0 * 1000 }, durationMin: minutes))
    }

    private var canSave: Bool { km != nil || minutes != nil }

    var body: some View {
        DaySheet("Log cardio", domain: .body, glass: false, primary: ("Save", canSave, save)) {
            Form {
                Section {
                    Picker("Kind", selection: $kind) {
                        ForEach(CardioKind.offered, id: \.self) { Text(CardioKind($0).label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityLabel("Kind")
                }

                Section {
                    HelixNumberRow(label: "Distance", value: $km, field: Field.km, focus: $focus,
                                   unit: "km", range: 0...200, fractionLength: 2)
                    HelixNumberRow(label: "Duration", value: $minutes, field: Field.minutes, focus: $focus,
                                   unit: "min", range: 0...1440, fractionLength: 0)
                    LabeledContent("Pace") {
                        Text(pace).helixNumeral().foregroundStyle(Color.helix.textPrimary)
                    }
                } header: {
                    HelixSectionHeader("The bout", .body)
                } footer: {
                    Text("Pace is derived from distance and duration, never stored.")
                }

                Section {
                    HelixNumberRow(label: "Incline", value: $incline, field: Field.incline, focus: $focus,
                                   unit: "%", range: 0...40, fractionLength: 1)
                    HelixNumberRow(label: "Active energy", value: $kcal, field: Field.kcal, focus: $focus,
                                   unit: "kcal", range: 0...5000, fractionLength: 0)
                    HelixNumberRow(label: "Average heart rate", value: $avgHr, field: Field.avgHr, focus: $focus,
                                   unit: "bpm", range: 0...250, fractionLength: 0)
                    Picker("Effort", selection: $effort) {
                        Text("—").tag(Int?.none)
                        ForEach(1...10, id: \.self) { Text("\($0)").tag(Int?.some($0)) }
                    }
                } header: {
                    HelixSectionHeader("Detail", .body)
                }
            }
            .toolbar { HelixKeyboardDone { focus = nil } }
        }
    }

    private func save() {
        let row = CardioLogRow(
            id: newHelixID(), userId: userId, date: date, kind: kind,
            distanceM: km.map { ($0 * 1000).rounded() }, durationMin: minutes,
            fromHealthkit: false, createdAt: Date(),
            activeKcal: kcal, avgHr: avgHr, effort: effort.map(Double.init), inclinePct: incline
        )
        if onSave(row) { dismiss() }
    }
}

/// The web's two kinds, plus a label for anything HealthKit wrote.
struct CardioKind {
    let key: String
    init(_ key: String) { self.key = key }

    static let offered = ["walk", "run"]

    var label: String {
        switch key {
        case "walk": "Walk"
        case "run": "Run"
        default: key.capitalized
        }
    }

    var symbol: String {
        switch key {
        case "run": "figure.run"
        case "walk": "figure.walk"
        default: "heart.fill"
        }
    }
}
