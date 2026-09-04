import SwiftUI
import WidgetKit
import HelixCore

// MARK: - The dashboard's tiles are the widgets
//
// ── ONE DRAWING, TWO HOSTS ───────────────────────────────────────────────────
// The web dashboard had thirteen tile bodies of its own, and the widget
// extension had another set that drew the same numbers differently. Here the
// Today grid is COMPOSED from the widget faces: a `WidgetId` names a family and
// a focus, the slot's size names a `WidgetFamily`, and the face that draws is
// the one the Home Screen already draws. Nothing on the grid is new drawing.
//
// ── THE FIVE THAT HAVE NO FACE YET ───────────────────────────────────────────
// `deficit`, `bar`, `micros`, `stack` and `fatigue` have no widget face and no
// snapshot field to draw from. They stay in the catalogue — the layout algebra
// and its vectors are the web's — but the phone PROJECTS them out of a slot at
// draw time (`HelixTile.isNative`) and never offers them in the gallery. The
// stored layout is untouched, so the web keeps them; when Wave 7 gives them a
// face they reappear on the phone in whatever slot they always held.

public extension WidgetId {
    /// What the tile is called in the gallery and on a sheet — `WIDGET_META`.
    var title: String {
        switch self {
        case .recovery: "Recovery"
        case .sleep: "Sleep"
        case .vitals: "Vitals"
        case .fuel: "Fuel"
        case .water: "Water"
        case .micros: "Nutrients"
        case .deficit: "Deficit Ledger"
        case .train: "Workout"
        case .bar: "Bar to Beat"
        case .body: "Body"
        case .muscle: "Muscle Focus"
        case .volume: "Tonnage"
        case .pr: "Latest PR"
        case .consistency: "Consistency"
        case .steps: "Steps"
        case .cardio: "Cardio"
        case .stack: "Stack"
        case .fatigue: "Fatigue"
        }
    }

    /// The accent the tile and its sheet wear — the web's eight hues collapsed
    /// onto the four domains.
    var domain: HelixDomain {
        switch self {
        case .recovery, .sleep, .vitals, .fatigue: .recover
        case .fuel, .water, .micros, .deficit, .stack: .fuel
        case .train, .bar, .muscle, .volume, .pr, .consistency: .train
        case .body, .steps, .cardio: .body
        }
    }

    var symbol: String {
        switch self {
        case .recovery: "gauge.with.needle"
        case .sleep: "moon.fill"
        case .vitals: "waveform.path.ecg"
        case .fuel: "flame.fill"
        case .water: "drop.fill"
        case .micros: "sparkles"
        case .deficit: "chart.line.downtrend.xyaxis"
        case .train: "dumbbell.fill"
        case .bar: "target"
        case .body: "scalemass.fill"
        case .muscle: "figure.arms.open"
        case .volume: "chart.bar.fill"
        case .pr: "trophy.fill"
        case .consistency: "calendar.badge.checkmark"
        case .steps: "figure.walk"
        case .cardio: "heart.fill"
        case .stack: "pills.fill"
        case .fatigue: "battery.25percent"
        }
    }

    /// Whether the phone has a face for it. See the header.
    var isNative: Bool {
        switch self {
        case .deficit, .bar, .micros, .stack, .fatigue: false
        default: true
        }
    }
}

public extension WidgetSize {
    /// The WidgetKit family a grid size draws at. The wide sizes are a desktop's
    /// and never reach a phone; they draw at the height tier they stand for.
    var family: WidgetFamily {
        switch Dashboard.heightTier(self) {
        case .s: .systemSmall
        case .m: .systemMedium
        default: .systemLarge
        }
    }
}

public enum HelixTile {
    /// The catalogue as the phone can draw it, in catalogue order.
    public static let native: [WidgetId] = Dashboard.widgetIds.filter(\.isNative)

    /// The face for one widget. The caller sets `helixTileFamily`.
    @ViewBuilder
    public static func face(_ id: WidgetId, entry: HelixTileEntry) -> some View {
        switch id {
        case .recovery: BodyView(entry: entry, focus: .wellbeing)
        case .sleep: BodyView(entry: entry, focus: .sleep)
        case .vitals: VitalsView(entry: entry, focus: .panel)
        case .fuel: FuelView(entry: entry, focus: .calories)
        case .water: FuelView(entry: entry, focus: .water)
        case .train: TrainingView(entry: entry, focus: .today)
        case .body: BodyView(entry: entry, focus: .weight)
        case .muscle: MuscleView(entry: entry)
        case .volume: TrainingView(entry: entry, focus: .volume)
        case .pr: TrainingView(entry: entry, focus: .records)
        case .consistency: TrainingView(entry: entry, focus: .calendar)
        case .steps: StepsView(entry: entry)
        case .cardio: TrainingView(entry: entry, focus: .cardio)
        case .deficit, .bar, .micros, .stack, .fatigue:
            TileNote(caption: id.title.uppercased(), text: "Arrives with the charts in Wave 7.")
        }
    }
}

// MARK: - Steps
//
// The one focus the four families never gave a face of its own: steps is a
// register of the Vitals panel and a quadrant of Daily, both of which draw six
// other things beside it. A tile called "Steps" draws steps.

public struct StepsView: View {
    let entry: HelixTileEntry
    @Environment(\.widgetFamily) private var hostFamily
    @Environment(\.helixTileFamily) private var tileFamily
    @Environment(\.widgetRenderingMode) private var mode
    private var size: HelixSize { HelixSize(tileFamily ?? hostFamily) }
    private var mono: Bool { mode == .accented }

    public init(entry: HelixTileEntry) { self.entry = entry }

    public var body: some View {
        let s = entry.snapshot
        let spec = FocusSpec.steps(s)
        switch size {
        case .small:
            FocusFace(spec: spec, stale: entry.isStale, age: entry.age, mono: mono)
        case .medium, .large:
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 4) {
                    Caption(spec.caption, color: mono ? .white : spec.accent)
                    Spacer(minLength: 0)
                    if entry.isStale { StaleTag(age: entry.age) }
                    HelixBrand(monochrome: mono, size: 12)
                }
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    BigValue(value: spec.hero, size: size == .large ? 44 : 30, color: .white)
                    if let goal = s?.steps.goal {
                        Text("of \(goal)").font(.system(size: 11)).foregroundStyle(Color.helix.textSecondary)
                    }
                    Spacer(minLength: 0)
                    if let sub = spec.sub {
                        Text(sub).font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.helix.textSecondary)
                    }
                }
                Rail(progress: spec.progress, color: mono ? .white : spec.accent)
                if let trend = s?.steps.trend, trend.count >= 2 {
                    Sparkline(points: trend.map(\.v), baseline: s?.steps.goal.map(Double.init),
                              color: mono ? .white : spec.accent, zeroBased: true)
                        .frame(maxHeight: .infinity)
                } else {
                    Spacer(minLength: 0)
                }
            }
        }
    }
}

// MARK: - Muscle focus
//
// The week's sets on the body. `volumeByFamily` is per FAMILY, so every muscle
// in a family wears the same intensity — the tile says where the week went,
// not which head of the delt.

public struct MuscleView: View {
    let entry: HelixTileEntry
    @Environment(\.widgetFamily) private var hostFamily
    @Environment(\.helixTileFamily) private var tileFamily
    @Environment(\.widgetRenderingMode) private var mode
    private var size: HelixSize { HelixSize(tileFamily ?? hostFamily) }
    private var mono: Bool { mode == .accented }

    public init(entry: HelixTileEntry) { self.entry = entry }

    private var families: [HelixSnapshot.FamilyVolume] {
        (entry.snapshot?.volumeByFamily ?? []).sorted { $0.sets > $1.sets }
    }

    private var worked: [String: Double] {
        let top = families.first?.sets ?? 0
        guard top > 0 else { return [:] }
        var out: [String: Double] = [:]
        for muscle in LandmarkMuscle.allCases {
            let family = MuscleFamily.of(muscle).rawValue
            if let f = families.first(where: { $0.family == family }) {
                out[muscle.rawValue] = min(1, f.sets / top)
            }
        }
        return out
    }

    public var body: some View {
        let accent = mono ? Color.white : HelixDomain.train.accent
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Caption("MUSCLE FOCUS", color: accent)
                Spacer(minLength: 0)
                if entry.isStale { StaleTag(age: entry.age) }
                HelixBrand(monochrome: mono, size: 12)
            }
            if families.isEmpty {
                Text("No sets logged this week.").font(.system(size: 11)).foregroundStyle(Color.helix.textSecondary)
                Spacer(minLength: 0)
            } else {
                HStack(alignment: .top, spacing: 10) {
                    HelixAtlasFigure(side: size == .small ? .front : .both, worked: worked, color: accent, monochrome: mono)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    if size != .small {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(families.prefix(size == .large ? 6 : 3)) { f in
                                HStack {
                                    Text(f.family).font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.helix.textPrimary)
                                    Spacer(minLength: 4)
                                    Text("\(Int(f.sets.rounded()))")
                                        .font(.system(size: 11, weight: .bold, design: .rounded).monospacedDigit())
                                        .foregroundStyle(mono ? .white : HelixDomain.forFamily(f.family).accent)
                                }
                            }
                        }
                        .frame(width: size == .large ? 120 : 96)
                    }
                }
            }
        }
    }
}

/// A face for a widget the phone cannot draw yet — the caption it will wear and
/// one line saying when.
struct TileNote: View {
    let caption: String
    let text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Caption(caption, color: Color.helix.textTertiary)
            Text(text).font(.system(size: 11)).foregroundStyle(Color.helix.textSecondary)
            Spacer(minLength: 0)
        }
    }
}
