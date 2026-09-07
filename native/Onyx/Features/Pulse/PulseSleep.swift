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
    /// §U5.1 takes the gauge from 180 pt centred to 96 pt in a left column.
    ///
    /// `DepthArc` sizes itself `min(width, height / 0.72)` and sets its own type
    /// off that diameter, so a FIXED frame makes "7h 17m" the smallest text on
    /// the screen at AX5 — hence `@ScaledMetric`, and hence the accessibility
    /// sizes abandoning the two-column shape entirely (`stacked`). Capped at 300
    /// because past that it is wider than the phone.
    @ScaledMetric(relativeTo: .title) private var arcSize: CGFloat = 96
    private var arcWidth: CGFloat { min(arcSize, 300) }

    /// One reading per row, 22 pt each — the height §U5.1 budgets so that four
    /// stages and the onset toggle come to the same 110 pt the arc column does,
    /// and the tile is `max` of the two rather than their sum.
    private let stageRowHeight: CGFloat = 22

    /// At a large size a 96 pt gauge and a 22 pt row are both wrong, and the
    /// tile is allowed to be tall — the whole point of the setting. So the two
    /// columns become one and every row grows.
    ///
    /// `>= .xxLarge`, not `isAccessibilitySize`: the stage column is ~190 pt,
    /// and at xxxLarge "Awake" and its two figures already ellipsise there —
    /// three settings below the one the accessibility test covers.
    private var stacked: Bool { typeSize >= .xxLarge }

    @ScaledMetric(relativeTo: .caption) private var shareWidth: CGFloat = 34

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

    /// ── §U5.1: ONE TILE, TWO COLUMNS, 168 PT ────────────────────────────────
    /// It was a 180 pt gauge centred over its own window line and goal chip, a
    /// four-column stage grid, a sleep-debt gauge with a two-line footnote, and
    /// a 32 pt toggle — five bands stacked, ~330 pt, on the screen §W11 is
    /// trying to fit into a screen and a half. Every band was the full width and
    /// none of them needed it.
    ///
    /// Side by side, the two things a night IS — how long, and what of — come to
    /// the height of the taller one instead of the sum of both. The arc column
    /// is 96 pt wide and about 110 tall; four 22 pt stage rows plus the onset
    /// toggle is the same 110, so the toggle costs nothing.
    ///
    /// ── AND WHY THE SLEEP-DEBT GAUGE IS IN THE HEADER NOW ───────────────────
    /// It was a `Gauge` plus a two-line explanation: ~55 pt for one number, and
    /// the one number on this tile that is NOT about last night — it is a
    /// fourteen-night running balance. Deleting it would lose a real reading, so
    /// it moved to the trailing slot beside the score, where the header row
    /// already exists and it costs no height at all. The explanation went with
    /// the gauge; `SleepDebt` documents the decay rule and no tile is the place
    /// to restate it.
    var body: some View {
        DayTile("Sleep", .recover) {
            if night == nil {
                Text("No sleep recorded for this night")
                    .onyxType(.secondary)
                    .foregroundStyle(Color.onyx.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                onsetRow
            } else if stacked {
                arc
                stageRows
                onsetRow
            } else {
                HStack(alignment: .top, spacing: OnyxSpace.m) {
                    arc.frame(width: arcWidth)
                    VStack(spacing: 0) {
                        stageRows
                        onsetRow
                    }
                }
            }
        } trailing: {
            header
        }
    }

    /// Score and bank, in the row the tile's title already occupies.
    @ViewBuilder
    private var header: some View {
        let debt = model.sleepDebt
        let parts = [
            night?.sleepScore.map { "Score \($0)" },
            // "bank" is the app's word for it and nobody else's. "debt" is what
            // `SleepDebt` is called in every other place it appears, including
            // the export, and it needs no gloss.
            debt.map { $0.debtHours <= 0.1 ? "debt settled" : "debt −\(DayFormat.number($0.debtHours))h" },
        ].compactMap { $0 }
        if !parts.isEmpty {
            Text(parts.joined(separator: " · "))
                .onyxType(.caption).onyxNumeral()
                .foregroundStyle(Color.onyx.textSecondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .accessibilityLabel(spokenHeader(debt))
        }
    }

    private func spokenHeader(_ debt: SleepDebt?) -> String {
        var out: [String] = []
        if let score = night?.sleepScore { out.append("Sleep score \(score)") }
        if let debt {
            out.append(debt.debtHours <= 0.1
                ? "sleep bank settled over \(debt.nights) nights"
                : "sleep bank down \(DayFormat.number(debt.debtHours)) hours over \(debt.nights) nights")
        }
        return out.joined(separator: ", ")
    }

    // MARK: The gauge

    private var arc: some View {
        VStack(spacing: OnyxSpace.xs) {
            DepthArc(
                segments: segments,
                minutes: night?.durationMin,
                goalMin: Int((model.sleepGoalHours * 60).rounded()),
                // 8 rather than 12: the stroke is a fraction of the gauge, and
                // a 12 pt band on an 88 pt circle leaves an inner hole too
                // small for the duration that sits in it.
                lineWidth: 8,
                // The bowl's own goal line is 7 pt at this diameter. The chip
                // under the arc says the same thing usefully — signed, against
                // the goal, in the colour of the answer.
                showsGoal: false
            )
            .frame(width: arcWidth, height: arcWidth * 0.72)
            if let window {
                Text(window)
                    .onyxType(.caption).onyxNumeral()
                    .foregroundStyle(Color.onyx.textSecondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
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

    /// ── WHY THE CHIP LOSES "vs goal" IN THE COLUMN (§U5.1) ──────────────────
    /// The column is 96 pt wide and "−1h 20m vs goal" is not: it wrapped to two
    /// lines, which took 22 pt off a tile with a 168 pt budget and drew a
    /// two-line red blob under the gauge. The words are recoverable from where
    /// the chip IS — it sits under a gauge whose own arc is drawn against the
    /// goal — and `accessibilityLabel` keeps the full sentence for the reader
    /// who cannot see that.
    @ViewBuilder
    private var goalChip: some View {
        if let goalText, let minutes = night?.durationMin {
            let met = minutes - Int((model.sleepGoalHours * 60).rounded()) >= -5
            // ── COLOURED TEXT, NO FILL ──────────────────────────────────
            // `danger` on a 14 % `danger` wash measures under 4.5:1 — a tinted
            // fill raises the floor the text has to clear, and this is the one
            // capsule in the app whose text is already the least legible hue on
            // the palette. The metric grid's own deltas (`+48 kg`) have always
            // been bare coloured text on the card, which clears it comfortably;
            // this now matches them, and gets its 6 pt of tile height back.
            Text(stacked ? goalText : compactGoalText)
                .onyxType(.caption).fontWeight(.semibold).onyxNumeral()
                .foregroundStyle(met ? Color.onyx.good : Color.onyx.danger)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .accessibilityLabel(goalText)
        }
    }

    /// "−1h 20m" / "goal met" — the same reading without the two words the
    /// gauge above it already says.
    private var compactGoalText: String {
        guard let minutes = night?.durationMin, minutes > 0 else { return "" }
        let gap = minutes - Int((model.sleepGoalHours * 60).rounded())
        if abs(gap) <= 5 { return "goal met" }
        return "\(gap > 0 ? "+" : "−")\(DayFormat.minutes(abs(gap)))"
    }

    /// What the arc cannot draw: each stage's SHARE of the night, which is the
    /// number you compare between nights, beside the minutes behind it.
    ///
    /// ── FOUR ROWS, NOT FOUR COLUMNS (§U5.1) ─────────────────────────────────
    /// W11 made this a four-column `LazyVGrid` of `StageCell`, which was the
    /// right call while the tile was full width: four readings of one kind,
    /// scanned across. In a column beside the gauge there is no width to scan
    /// across — a quarter of 190 pt is 47, and "AWAKE 41m 9%" is three lines of
    /// it. A row per stage reads down instead, and 22 pt each is what makes the
    /// four of them plus the toggle add up to the arc beside them.
    ///
    /// A dot rather than `StageCell`'s bar: the arc IS the bar, drawn in the
    /// same four colours, and a second length for the same fact beside it is
    /// the "no box that only repeats the box above it" rule (§3.6).
    private var stageRows: some View {
        VStack(spacing: 0) {
            ForEach(OnyxSleepStage.allCases, id: \.self) { stage in
                stageRow(stage)
            }
        }
    }

    private func stageRow(_ stage: OnyxSleepStage) -> some View {
        let minutes = segments.first(where: { $0.0 == stage })?.1
        return HStack(spacing: OnyxSpace.s) {
            Circle()
                .fill(stage.color)
                .frame(width: 7, height: 7)
                .accessibilityHidden(true)
            Text(stage.title)
                .onyxType(.caption)
                .foregroundStyle(Color.onyx.textSecondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Spacer(minLength: OnyxSpace.xs)
            Text(minutes.map { DayFormat.minutes($0) } ?? "—")
                .onyxType(.caption).fontWeight(.semibold).onyxNumeral()
                .foregroundStyle(Color.onyx.textPrimary)
                .lineLimit(1)
            Text(share(minutes))
                .onyxType(.caption).onyxNumeral()
                .foregroundStyle(Color.onyx.textTertiary)
                .frame(width: shareWidth, alignment: .trailing)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        // A MINIMUM: at the accessibility sizes the label wraps and takes the
        // row with it, which is the whole reason the two-column shape is
        // abandoned there.
        .frame(minHeight: stacked ? 32 : stageRowHeight)
        .accessibilityElement(children: .combine)
    }

    /// A stage with no reading has no share — 0 % would claim the watch
    /// measured none of it, which is a different fact from not having looked.
    private func share(_ minutes: Int?) -> String {
        guard let minutes, staged > 0 else { return "—" }
        return "\(Int((Double(minutes) / Double(staged) * 100).rounded()))%"
    }

    /// The one fact on this tile that comes from you rather than from the
    /// watch, so it is the one control.
    ///
    /// ── 32 PT, AND WHY THAT IS NOT A TAP-TARGET VIOLATION ───────────────────
    /// §3.1's floor of 44 pt is about the TARGET, and the target here is the
    /// switch, which keeps its own hit rectangle whatever the row around it
    /// measures — a `Toggle` extends its target beyond its drawn bounds, and
    /// the label is part of it. What 44 pt was buying was a band of empty glass
    /// under a control that is looked at once a night, on the screen §W11 is
    /// trying to fit into a screen and a half. `.mini` takes the switch down
    /// with the row so a full-size control does not sit in a short one.
    ///
    /// `.mini` is a REQUEST — iOS draws its switch at one size and ignores it,
    /// while a future platform or a Mac build honours it. It costs nothing and
    /// it states the intent; the 32 pt is what actually does the work.
    ///
    /// It still GROWS: the frame is a minimum, and at the accessibility sizes
    /// the label wraps and takes the row with it.
    ///
    /// ── WHY IT IS A CHECK AND NO LONGER A SWITCH (§U5.1) ────────────────────
    /// iOS draws its switch at one size — `.mini` is a request the platform
    /// ignores — and that size is ~31 pt tall. Beside four 22 pt stage rows it
    /// was the loudest object in the column and it took the tile past its 168 pt
    /// budget on its own.
    ///
    /// `.toggleStyle(.button)` is the system's own answer: a bordered control
    /// that fills when it is on, sized by `controlSize` like every other button,
    /// and still a `Toggle` — so VoiceOver announces a switch and the value, and
    /// Switch Control and the pointer both reach it exactly as before. The
    /// filled/hollow circle is what makes it read as a state rather than as a
    /// button that opens something; a bordered control with only a sentence in
    /// it is the one shape a two-state fact must not take.
    private var onsetRow: some View {
        let on = model.log?.sleepOnsetTrouble ?? false
        return Toggle(isOn: Binding(
            get: { on },
            set: { model.setSleepOnsetTrouble($0) }
        )) {
            Label {
                Text("Trouble falling asleep")
                    .onyxType(.caption)
                    .lineLimit(stacked ? nil : 1)
                    .minimumScaleFactor(stacked ? 1 : 0.75)
            } icon: {
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .onyxType(.caption)
            }
        }
        .toggleStyle(.button)
        .buttonStyle(.bordered)
        // `.regular`, not `.small`: `.small` came out ~28 pt, and this is a
        // control you tap in the dark. The height the goal chip gave back
        // above is what pays for it.
        .controlSize(.regular)
        .tint(accent)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityLabel("Trouble falling asleep")
        // `ButtonToggleStyle` publishes `.isButton` + `.isSelected`, so the ON
        // state reads "selected" and the OFF state reads as a plain button with
        // nothing to say it has two states at all. The value is the fix; the
        // trait is the platform's and is not ours to add.
        .accessibilityValue(on ? "on" : "off")
    }
}
