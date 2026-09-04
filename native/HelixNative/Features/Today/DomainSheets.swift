import SwiftUI
import HelixCore
import WidgetKit
import HelixUI

/// The sheet behind a tile.
///
/// ── THE TILE AT LARGE IS THE SHEET ───────────────────────────────────────────
/// Every widget family has a Large face that is the tile's own question answered
/// in full, so the sheet leads with it rather than with a second implementation
/// of the same reading. Six domains add what the Large face cannot hold — the
/// five score parts behind readiness, the night's stages, the macros beside the
/// calories, the session's start button, the composition ledger, the breathing
/// readings — and the rest are the Large face alone.
///
/// Detents medium and large; the material is the sheet level of the one glass
/// modifier, which is where the Obsidian Glass mandate puts sheets.
struct DomainSheet: View {
    let id: WidgetId
    let entry: HelixTileEntry
    let onStartWorkout: () -> Void
    @Environment(\.dismiss) private var dismiss

    private var s: HelixSnapshot? { entry.snapshot }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: HelixSpace.m) {
                    face(id, focus: nil)
                    extras
                }
                .padding(HelixSpace.l)
            }
            .helixScreen(id.domain)
            .navigationTitle(id.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(GlassLevel.sheet.material)
    }

    @ViewBuilder
    private var extras: some View {
        switch id {
        case .recovery: scoreParts
        case .sleep: stages
        case .fuel:
            face(.fuel, focus: .fuel(.macros))
            face(.water, focus: .fuel(.water), family: .systemMedium)
        case .train: startButton
        case .body: face(.body, focus: .body(.composition))
        case .vitals:
            face(.vitals, focus: .vitals(.recovery), family: .systemMedium)
            face(.vitals, focus: .vitals(.respiration), family: .systemMedium)
        default: EmptyView()
        }
    }

    /// A widget face inside the sheet, at Large unless told otherwise.
    @ViewBuilder
    private func face(_ id: WidgetId, focus: HelixFocus?, family: WidgetFamily = .systemLarge) -> some View {
        let e = HelixTileEntry(date: entry.date, snapshot: entry.snapshot, focus: focus)
        Group {
            switch focus {
            case .fuel(let f): FuelView(entry: e, focus: f)
            case .body(let f): BodyView(entry: e, focus: f)
            case .vitals(let f): VitalsView(entry: e, focus: f)
            case .training(let f): TrainingView(entry: e, focus: f)
            case .lock, .none: HelixTile.face(id, entry: e)
            }
        }
        .environment(\.helixTileFamily, family)
        .padding(HelixSpace.m)
        .frame(maxWidth: .infinity)
        .aspectRatio(family == .systemLarge ? 338 / 354 : 338 / 158, contentMode: .fit)
        .helixGlass(.tile)
    }

    private var scoreParts: some View {
        let parts: [(String, Double?)] = [
            ("Sleep", s?.scores?.sleep), ("Nutrition", s?.scores?.nutrition), ("Activity", s?.scores?.activity),
            ("Workout", s?.scores?.workout), ("Recovery", s?.scores?.recovery),
        ]
        return VStack(spacing: 0) {
            ForEach(parts, id: \.0) { name, value in
                LabeledContent(name) {
                    Text(value.map { "\(Int($0.rounded()))" } ?? "—")
                        .fontDesign(.rounded).monospacedDigit()
                        .foregroundStyle(Color.helix.textPrimary)
                }
                .padding(.vertical, 10)
                if name != "Recovery" { Divider().overlay(Color.helix.hairline) }
            }
            if let score = s?.score {
                LabeledContent("Daily score") {
                    Text("\(score)").fontDesign(.rounded).monospacedDigit().foregroundStyle(HelixDomain.recover.accent)
                }
                .font(.headline)
                .padding(.top, 10)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 6)
        .helixGlass(.tile)
    }

    private var stages: some View {
        let rows: [(String, Int?, HelixSleepStage)] = [
            ("Deep", s?.sleep.deepMin, .deep), ("REM", s?.sleep.remMin, .rem),
            ("Core", s?.sleep.coreMin, .core), ("Awake", s?.sleep.awakeMin, .awake),
        ]
        return VStack(spacing: 0) {
            ForEach(rows, id: \.0) { name, minutes, stage in
                HStack {
                    Circle().fill(stage.color).frame(width: 8, height: 8)
                    Text(name).foregroundStyle(Color.helix.textPrimary)
                    Spacer()
                    Text(Format.sleep(minutes.map(Double.init)))
                        .fontDesign(.rounded).monospacedDigit()
                        .foregroundStyle(Color.helix.textSecondary)
                }
                .padding(.vertical, 10)
                if stage != .awake { Divider().overlay(Color.helix.hairline) }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 6)
        .helixGlass(.tile)
    }

    @ViewBuilder
    private var startButton: some View {
        if let w = s?.workout, !w.isRestDay, !w.logged {
            Button { dismiss(); onStartWorkout() } label: {
                Label("Start \(w.label)", systemImage: "play.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .foregroundStyle(Color.helix.base)
                    .background(HelixDomain.train.ramp, in: RoundedRectangle(cornerRadius: HelixCorner.row, style: .continuous))
            }
            .buttonStyle(HelixPressStyle())
        }
    }
}

/// What is inside one stack, and the three things you can do to it.
///
/// The tile can say which face is up; it cannot show an ORDER, because only one
/// face is on screen at a time. So the tile keeps the glance and the sheet takes
/// the editing — a `List` with `onMove`, exactly as Edit Stack does on the Home
/// Screen. Unstack gives a face its own tile; remove sends it to the tray.
struct StackEditSheet: View {
    let slotId: String
    @Bindable var model: TodayModel
    @Environment(\.dismiss) private var dismiss

    private var slot: StackSlot? { Dashboard.slot(model.layout, at: slotId) }

    var body: some View {
        NavigationStack {
            List {
                if let slot {
                    ForEach(Array(slot.items.enumerated()), id: \.offset) { index, id in
                        Label(id.title, systemImage: id.symbol)
                            .foregroundStyle(Color.helix.textPrimary)
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) { model.removeFace(slotId, index: index) } label: { Label("Remove", systemImage: "minus.circle") }
                                Button { model.unstack(slotId, index: index) } label: { Label("Unstack", systemImage: "square.on.square") }
                                    .tint(id.domain.accent)
                            }
                    }
                    .onMove { from, to in
                        guard let f = from.first else { return }
                        model.reorderFace(slotId, from: f, to: to > f ? to - 1 : to)
                    }
                } else {
                    Text("This stack is a single tile now.").foregroundStyle(Color.helix.textSecondary)
                }
            }
            .scrollContentBackground(.hidden)
            .helixScreen(.train)
            .environment(\.editMode, .constant(.active))
            .navigationTitle("Edit Stack")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .presentationBackground(GlassLevel.sheet.material)
        .onChange(of: slot?.items.count) { _, n in if (n ?? 0) < 2 { dismiss() } }
    }
}
