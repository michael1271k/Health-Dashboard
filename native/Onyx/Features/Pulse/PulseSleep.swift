import SwiftUI
import OnyxUI
import OnyxCore
import OnyxData

/// The night: one arc, four stages, the bank, and the one thing the watch
/// cannot see.
///
/// ── ONE ARC, AND IT IS THE SAME ARC AS EVERYWHERE ELSE ──────────────────────
/// `DepthArc` draws duration as SWEEP and the stage split as FILL, so a single
/// gauge answers both questions a night raises. The Lock Screen face draws it,
/// the Today sleep sheet draws it, and this tile draws it — one implementation,
/// so the three can never disagree about how long a night was. What this tile
/// adds is what only a full screen has room for: the bank (`SleepDebt`), and
/// the toggle for the thing HealthKit does not record.
///
/// What went: a hand-rolled stacked bar of the same four stages under the arc,
/// with the same four durations listed beside it in a second legend. Three
/// renderings of one four-number fact (§3.6: "no box that only repeats the box
/// above it").
struct SleepTile: View {
    let model: DayModel

    @Environment(\.dynamicTypeSize) private var typeSize
    /// §5.7 asks for 180 pt of gauge. `DepthArc` sizes itself
    /// `min(width, height / 0.72)` and sets its own type off that diameter, so
    /// a FIXED frame makes "7h 17m" the smallest text on the screen at AX5.
    /// Capped at 300 because past that it is wider than the phone.
    @ScaledMetric(relativeTo: .title) private var arcSize: CGFloat = 180
    private var arcWidth: CGFloat { min(arcSize, 300) }

    private let accent = Color.onyx.accent(.recover)

    private var night: SleepSessionRow? { model.night }

    /// `(stage, minutes)` — a stage the watch never reported is ABSENT, not
    /// zero, so the arc does not draw a segment for a reading it does not have.
    private var segments: [(OnyxSleepStage, Int)] {
        guard let night else { return [] }
        return [
            (OnyxSleepStage.deep, night.deepMin),
            (.rem, night.remMin),
            (.core, night.coreMin),
            (.awake, night.awakeMin),
        ].compactMap { stage, minutes in minutes.map { (stage, $0) } }
    }

    private var staged: Int { segments.reduce(0) { $0 + $1.1 } }

    var body: some View {
        DayTile("Sleep", .recover) {
            if night == nil {
                Text("No sleep recorded for this night")
                    .onyxType(.secondary)
                    .foregroundStyle(Color.onyx.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                arc
                stageGrid
            }
            if let debt = model.sleepDebt { bank(debt) }
            onsetRow
        } trailing: {
            if let score = night?.sleepScore {
                Text("Score \(score)")
                    .onyxType(.caption).onyxNumeral()
                    .foregroundStyle(Color.onyx.textSecondary)
            }
        }
    }

    // MARK: The gauge

    private var arc: some View {
        VStack(spacing: OnyxSpace.s) {
            DepthArc(
                segments: segments,
                minutes: night?.durationMin,
                goalMin: Int((model.sleepGoalHours * 60).rounded()),
                lineWidth: 12
            )
            .frame(width: arcWidth, height: arcWidth * 0.72)
            if let window { Text(window).onyxType(.caption).onyxNumeral().foregroundStyle(Color.onyx.textSecondary) }
            goalChip
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Slept \(DayFormat.minutes(night?.durationMin))")
        .accessibilityValue(goalText ?? "")
    }

    /// "23:20 – 06:37", the ends of the arc said in numbers. Times, not dates:
    /// the tile already knows which night it is.
    private var window: String? {
        guard let start = night?.startTime, let end = night?.endTime else { return nil }
        let format = Date.FormatStyle(date: .omitted, time: .shortened)
        return "\(start.formatted(format)) – \(end.formatted(format))"
    }

    /// "+22m vs goal" — signed, because a short night and a long one are
    /// different nights, and five minutes either way is neither.
    private var goalText: String? {
        guard let minutes = night?.durationMin, minutes > 0 else { return nil }
        let gap = minutes - Int((model.sleepGoalHours * 60).rounded())
        if abs(gap) <= 5 { return "goal met" }
        return "\(gap > 0 ? "+" : "−")\(DayFormat.minutes(abs(gap))) vs goal"
    }

    @ViewBuilder
    private var goalChip: some View {
        if let goalText, let minutes = night?.durationMin {
            let met = minutes - Int((model.sleepGoalHours * 60).rounded()) >= -5
            Text(goalText)
                .onyxType(.caption).fontWeight(.semibold).onyxNumeral()
                .foregroundStyle(met ? Color.onyx.good : Color.onyx.danger)
                .padding(.horizontal, OnyxSpace.s)
                .padding(.vertical, OnyxSpace.xs)
                .background(Capsule().fill((met ? Color.onyx.good : Color.onyx.danger).opacity(0.14)))
        }
    }

    /// The 2×2 the arc cannot draw: each stage's SHARE of the night, which is
    /// the number you compare between nights, beside the minutes behind it.
    private var stageGrid: some View {
        LazyVGrid(
            columns: Array(
                repeating: GridItem(.flexible(), spacing: OnyxSpace.m),
                count: typeSize.isAccessibilitySize ? 1 : 2
            ),
            spacing: OnyxSpace.xs
        ) {
            ForEach(OnyxSleepStage.allCases, id: \.self) { stage in
                let minutes = segments.first(where: { $0.0 == stage })?.1
                StageCell(stage: stage, minutes: minutes, share: share(minutes))
            }
        }
    }

    /// A stage with no reading has no share — 0 % would claim the watch
    /// measured none of it, which is a different fact from not having looked.
    private func share(_ minutes: Int?) -> String {
        guard let minutes, staged > 0 else { return "—" }
        return "\(Int((Double(minutes) / Double(staged) * 100).rounded()))%"
    }

    // MARK: The bank

    private func bank(_ debt: SleepDebt) -> some View {
        VStack(alignment: .leading, spacing: OnyxSpace.xs) {
            Gauge(value: min(debt.debtHours, 10), in: 0...10) {
                Text("Sleep debt · 14-night").onyxMicro()
            } currentValueLabel: {
                Text(debt.debtHours <= 0.1 ? "settled" : "−\(DayFormat.number(debt.debtHours))h")
                    .onyxType(.caption).fontWeight(.semibold).onyxNumeral()
            }
            .gaugeStyle(.accessoryLinearCapacity)
            .tint(accent)
            .accessibilityLabel("Sleep debt")
            .accessibilityValue(debt.debtHours <= 0.1
                ? "settled, over \(debt.nights) nights"
                : "\(DayFormat.number(debt.debtHours)) hours over \(debt.nights) nights")
            Text("vs \(DayFormat.number(debt.goalHours))h goal · surplus nights repay · last week decays ×0.75")
                .onyxType(.caption)
                .foregroundStyle(Color.onyx.textTertiary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// The one fact on this tile that comes from you rather than from the
    /// watch, so it is the one control: a 44 pt toggle row, not a tile.
    private var onsetRow: some View {
        Toggle(isOn: Binding(
            get: { model.log?.sleepOnsetTrouble ?? false },
            set: { model.setSleepOnsetTrouble($0) }
        )) {
            Text("Trouble falling asleep").onyxType(.body)
        }
        .tint(accent)
        .padding(.horizontal, OnyxSpace.m)
        .frame(minHeight: 44)
        .onyxGlass(.row)
    }
}
