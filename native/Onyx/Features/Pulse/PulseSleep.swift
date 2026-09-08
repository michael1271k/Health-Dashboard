import SwiftUI
import OnyxUI
import OnyxCore
import OnyxData

/// The night: one arc, four stages, the bank, and a door to the things the
/// watch cannot see.
///
/// ── ONE ARC, AND IT IS THE SAME ARC AS EVERYWHERE ELSE ──────────────────────
/// `DepthArc` draws duration as SWEEP and the stage split as FILL, so a single
/// gauge answers both questions a night raises. The Lock Screen face draws it,
/// the Today sleep sheet draws it, and this tile draws it — one implementation,
/// so the three can never disagree about how long a night was. What this tile
/// adds is what only a full screen has room for: the bank (`SleepDebt`), and
/// the door to `SleepEditSheet` — where the window itself, and the two things
/// HealthKit does not record, are edited.
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

    /// At a large size a 96 pt gauge and a 22 pt row are both wrong, and the
    /// tile is allowed to be tall — the whole point of the setting. So the two
    /// columns become one and every row grows.
    ///
    /// `>= .xxLarge`, not `isAccessibilitySize`: the stage column is ~190 pt,
    /// and at xxxLarge "Awake" and its two figures already ellipsise there —
    /// three settings below the one the accessibility test covers.
    private var stacked: Bool { typeSize >= .xxLarge }

    private let accent = Color.onyx.accent(.recover)

    @State private var editing = false

    private var night: SleepSessionRow? { model.night }

    /// The night carries the sleep sentinel — somebody re-windowed it by hand.
    /// One glyph on the line the edit changed, because a trimmed night reads as
    /// a short night and nothing else on the tile says which of the two it is.
    private var edited: Bool { ManualEntry.isManualSleep(night?.hkUuid) }

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

    /// ── §U5.1: ONE TILE, TWO COLUMNS, 168 PT ────────────────────────────────
    /// It was a 180 pt gauge centred over its own window line and goal chip, a
    /// four-column stage grid, a sleep-debt gauge with a two-line footnote, and
    /// a 32 pt toggle — five bands stacked, ~330 pt, on the screen §W11 is
    /// trying to fit into a screen and a half. Every band was the full width and
    /// none of them needed it.
    ///
    /// Side by side, the two things a night IS — how long, and what of — come to
    /// the height of the taller one instead of the sum of both. The arc column
    /// is 96 pt wide and about 110 tall; four 22 pt stage rows come to 88, so
    /// the tile measures the ARC — which is what let both flag toggles leave
    /// for `SleepEditSheet` without the stage column noticing (§U5.1, below).
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
                emptyDoor
            } else if stacked {
                door { arc }
                stageRows
            } else {
                HStack(alignment: .top, spacing: OnyxSpace.m) {
                    door { arc }.frame(width: arcWidth)
                    stageRows
                }
            }
        } trailing: {
            header
        }
        .sheet(isPresented: $editing) { SleepEditSheet(model: model) }
    }

    /// ── THE ARC COLUMN IS THE DOOR (§U5.2) ──────────────────────────────────
    /// The plan asks for the onset→wake LINE to open the editor, and that line
    /// is 16 pt of caption inside a 96 pt column — a third of §3.1's floor, on
    /// a control you reach for in the dark. Wrapping the whole column instead
    /// costs no height, keeps the named line inside the target, and reads
    /// correctly: you tap the night to change the night.
    ///
    /// `arc` already publishes one accessibility element with the duration as
    /// its label and the goal as its value, so the button adds the trait and a
    /// hint rather than a second, competing label.
    private func door<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        Button { editing = true } label: { content() }
            .buttonStyle(.plain)
            .onyxPress(scale: 0.99)
            .accessibilityAddTraits(.isButton)
            .accessibilityHint("Edit the sleep window")
    }

    /// A night nobody has written yet still has to be reachable — the sheet is
    /// the only way to mint one, and a sentence with no affordance is a dead
    /// end on the one screen that can fix it.
    private var emptyDoor: some View {
        Button { editing = true } label: {
            HStack(spacing: OnyxSpace.s) {
                Text("No sleep recorded for this night")
                    .onyxType(.secondary)
                    .foregroundStyle(Color.onyx.textSecondary)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: OnyxSpace.s)
                Image(systemName: "square.and.pencil")
                    .onyxType(.secondary)
                    .foregroundStyle(accent)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .onyxPress(scale: 0.99)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("No sleep recorded for this night")
        .accessibilityHint("Set the sleep window")
        .accessibilityAddTraits(.isButton)
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
                HStack(spacing: 3) {
                    if edited {
                        Image(systemName: "pencil")
                            .onyxType(.micro)
                            .foregroundStyle(Color.onyx.textSecondary)
                    }
                    Text(window)
                        .onyxType(.caption).onyxNumeral()
                        .foregroundStyle(Color.onyx.textSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            }
            goalChip
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Slept \(DayFormat.minutes(night?.durationMin))\(edited ? ", window edited" : "")")
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
    /// number you compare between nights, beside the minutes behind it. The
    /// shape and the reasons for it are `SleepStageList`, which `SleepEditSheet`
    /// draws too.
    private var stageRows: some View { SleepStageList(segments: segments) }

    // ── WHERE THE TWO FLAGS WENT (§U5.1) ────────────────────────────────────
    // "Trouble falling asleep" and "Watch data inaccurate" were two 32 pt
    // bordered toggles in the stage column. They are the only CONTROLS on a
    // tile whose other eleven readings are all measurements, they are looked at
    // once a night, and between them they were a fifth of the tile's 168 pt
    // budget on the screen §W11 is trying to fit into a screen and a half.
    //
    // They live in `SleepEditSheet` now — behind the same tap that edits the
    // window, which is the other thing about a night that comes from you rather
    // than from the watch. Nothing on the tile reports their state: a flag that
    // moves no number and has no glyph here cannot be misread as one that does,
    // and the sheet is one tap away. The PENCIL is a different fact — the
    // window itself was rewritten, which is why the arc is the shape it is —
    // and it stays.
}

/// Deep · Core · REM · Awake — a dot, a name, its minutes and its share of the
/// night, one 22 pt row each (§U5.1).
///
/// ── FOUR ROWS, NOT FOUR COLUMNS ─────────────────────────────────────────────
/// W11 made this a four-column `LazyVGrid` of `StageCell`, which was the right
/// call while the tile was full width: four readings of one kind, scanned
/// across. In a column beside a 96 pt gauge there is no width to scan across —
/// a quarter of 190 pt is 47, and "AWAKE 41m 9%" is three lines of it. A row
/// per stage reads down instead, and 22 pt each is the height that keeps the
/// four of them inside the arc column beside them.
///
/// A dot rather than `StageCell`'s bar: the arc IS the bar, drawn in the same
/// four colours, and a second length for the same fact beside it is the "no box
/// that only repeats the box above it" rule (§3.6).
///
/// Shared with `SleepEditSheet`, which previews what an edit does to the same
/// four numbers — so a preview and the tile it is previewing cannot render one
/// night two ways.
struct SleepStageList: View {
    /// `(stage, minutes)` — a stage nobody reported is ABSENT, not zero, and
    /// draws an em dash rather than claiming the watch measured none of it.
    let segments: [(OnyxSleepStage, Int)]

    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .caption) private var shareWidth: CGFloat = 34

    /// The share denominator: everything reported, asleep and awake alike.
    private var staged: Int { segments.reduce(0) { $0 + $1.1 } }

    /// See `SleepTile.stacked` — at a large size the row grows with the label
    /// that wraps inside it.
    private var tall: Bool { typeSize >= .xxLarge }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(OnyxSleepStage.allCases, id: \.self) { stage in
                row(stage)
            }
        }
    }

    /// ── `ViewThatFits`, NOT A TYPE-SIZE THRESHOLD ───────────────────────────
    /// "Awake 20m 5%" is three readings on one line, and at AX5 that is ~400 pt
    /// of type in a 350 pt column however wide the column is — so the tile's
    /// own `>= .xxLarge` switch, which only decides whether the list sits BESIDE
    /// the gauge, cannot help: the first AX5 shot of the edit sheet drew
    /// "1h…", "3h…", "20…" with the shares intact and the durations gone.
    ///
    /// What the row needs is to wrap when it genuinely does not fit, which is a
    /// measurement rather than a setting — the same reason `DayTile` puts its
    /// title and trailing word in a `ViewThatFits`. The name keeps its line and
    /// the two figures take the next.
    private func row(_ stage: OnyxSleepStage) -> some View {
        let minutes = segments.first(where: { $0.0 == stage })?.1
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: OnyxSpace.s) {
                dot(stage)
                name(stage)
                Spacer(minLength: OnyxSpace.xs)
                figures(minutes, shareWidth: shareWidth)
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: OnyxSpace.s) {
                    dot(stage)
                    name(stage)
                    Spacer(minLength: 0)
                }
                // No fixed share column in the wrapped form: the whole reason
                // it is wrapped is that the width was not there to align to.
                HStack(spacing: OnyxSpace.s) {
                    figures(minutes, shareWidth: nil)
                    Spacer(minLength: 0)
                }
            }
        }
        // A MINIMUM: the row grows with whatever wraps inside it.
        .frame(minHeight: tall ? 32 : 22)
        .accessibilityElement(children: .combine)
    }

    private func dot(_ stage: OnyxSleepStage) -> some View {
        Circle()
            .fill(stage.color)
            .frame(width: 7, height: 7)
            .accessibilityHidden(true)
    }

    private func name(_ stage: OnyxSleepStage) -> some View {
        Text(stage.title)
            .onyxType(.caption)
            .foregroundStyle(Color.onyx.textSecondary)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
    }

    /// The minutes and the share. `shareWidth` aligns the percentages into a
    /// column when the four rows share one; nil lets it sit at its own width.
    @ViewBuilder
    private func figures(_ minutes: Int?, shareWidth: CGFloat?) -> some View {
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

    /// A stage with no reading has no share — 0 % would claim the watch
    /// measured none of it, which is a different fact from not having looked.
    private func share(_ minutes: Int?) -> String {
        guard let minutes, staged > 0 else { return "—" }
        return "\(Int((Double(minutes) / Double(staged) * 100).rounded()))%"
    }
}
