import SwiftUI
import HelixCore
import HelixData

/// The day's bouts, and the form that adds one.
///
/// Pace is DERIVED and read-only: distance and duration are the facts, and a
/// stored pace drifts the moment either is corrected.
struct CardioTile: View {
    let model: DayModel
    @State private var logging = false

    var body: some View {
        DayTile("Cardio", .body) {
            if model.cardio.isEmpty {
                Text("No cardio logged")
                    .font(.subheadline)
                    .foregroundStyle(Color.helix.textSecondary)
            }
            ForEach(model.cardio, id: \.id) { bout in
                boutRow(bout)
            }
            Button { logging = true } label: {
                Label("Log cardio", systemImage: "plus")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.helix.accent(.body))
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .helixPress(scale: 0.98)
            .helixGlass(.row)
        }
        .sheet(isPresented: $logging) {
            CardioLogSheet(model: model)
        }
    }

    // ponytail: swipe-to-delete needs a `List`; this is a ScrollView of tiles, so
    // delete is a labelled button plus a context menu. Revisit if the tile grows a List.
    private func boutRow(_ bout: CardioLogRow) -> some View {
        let kind = CardioKind(bout.kind)
        let pace = CardioMetrics.formatPace(CardioMetrics.paceMinPerKm(distanceM: bout.distanceM, durationMin: bout.durationMin))
        var set: [String] = []
        if let d = bout.distanceM { set.append(DayFormat.number(d / 1000, fraction: 2, unit: "km")) }
        if let m = bout.durationMin { set.append(DayFormat.number(m, fraction: 0, unit: "min")) }
        if pace != "—" { set.append(pace) }
        var detail: [String] = []
        if let k = bout.activeKcal ?? bout.kcal { detail.append(DayFormat.number(k, fraction: 0, unit: "kcal")) }
        if let hr = bout.avgHr { detail.append(DayFormat.number(hr, fraction: 0, unit: "bpm")) }
        if let e = bout.effort { detail.append("effort \(DayFormat.number(e, fraction: 1))") }
        if let i = bout.inclinePct { detail.append(DayFormat.number(i, fraction: 1, unit: "% incline")) }

        return HStack(spacing: 12) {
            Image(systemName: kind.symbol)
                .font(.title3)
                .foregroundStyle(Color.helix.accent(.body))
                .frame(width: 28)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(kind.label).font(.subheadline.weight(.semibold))
                Text(set.isEmpty ? "—" : set.joined(separator: " · "))
                    .font(.footnote)
                    .helixNumeral()
                if !detail.isEmpty {
                    Text(detail.joined(separator: " · "))
                        .font(.caption)
                        .foregroundStyle(Color.helix.textSecondary)
                        .helixNumeral()
                }
            }
            Spacer(minLength: 8)
            Button(role: .destructive) {
                withAnimation(HelixMotion.move) { model.deleteCardio(bout.id) }
            } label: {
                Image(systemName: "trash")
                    .font(.footnote)
                    .foregroundStyle(Color.helix.textSecondary)
                    .frame(width: 44, height: 44)
            }
            .helixPress()
            .accessibilityLabel("Delete \(kind.label)")
        }
        .padding(.leading, 12)
        .padding(.vertical, 6)
        .helixGlass(.row)
        .contextMenu {
            Button("Delete", systemImage: "trash", role: .destructive) { model.deleteCardio(bout.id) }
        }
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

private struct CardioLogSheet: View {
    let model: DayModel
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
            id: newHelixID(), userId: model.userId, date: model.date, kind: kind,
            distanceM: km.map { ($0 * 1000).rounded() }, durationMin: minutes,
            fromHealthkit: false, createdAt: Date(),
            activeKcal: kcal, avgHr: avgHr, effort: effort.map(Double.init), inclinePct: incline
        )
        if model.addCardio(row) { dismiss() }
    }
}
