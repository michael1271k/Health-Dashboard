import SwiftUI
import OnyxUI
import OnyxCore
import OnyxData

/// The sheet that gets a bout into the ledger — from Apple Health first, by
/// hand second.
///
/// ── WHY IT LIVES UNDER `Workout/` ───────────────────────────────────────────
/// It was `CardioTile` on the Pulse tab, between sleep and the scale. A bout is
/// TRAINING — it belongs beside the session it was done around, and §5.7 takes
/// it off Pulse for exactly that reason. Moving it also cut its dependency on
/// `DayModel`: the sheet needs a user, a date and somewhere to put the row, and
/// taking those three as arguments is what let the Workout tab present it
/// without opening eleven observations it has no other use for.
///
/// ── AND WHY IT IS NO LONGER A FORM OF EMPTY ROWS ────────────────────────────
/// The screen this replaces was a stock `Form`: seven identical grey rows, each
/// reading `—`, and four hundred points of black beneath them. Every figure it
/// asked for — distance, duration, incline, energy, heart rate — is a figure a
/// watch already recorded and Health already holds, and the app was asking a
/// person to retype them out of another app on the same phone.
///
/// So the sheet OPENS ON WHAT HEALTH HAS. Manual entry is still here, still
/// complete, and is now the fallback it always should have been: the treadmill
/// bout nobody's watch recorded, or a correction to something it did.
///
/// Pace is DERIVED and read-only: distance and duration are the facts, and a
/// stored pace drifts the moment either is corrected.
struct CardioLogSheet: View {
    let userId: String
    let date: String
    /// Rows already on this date — what an import is deduplicated against.
    var existing: [CardioLogRow] = []
    /// Returns false when the write failed, which keeps the sheet open with the
    /// figures still in it rather than swallowing the bout.
    let onSave: (CardioLogRow) -> Bool
    /// The day's bouts, as Apple Health has them.
    ///
    /// Injected rather than read from `AppEnvironment` so the shot harness can
    /// hand this screen a fixed set. A screenshot of a live HealthKit query is a
    /// screenshot of whatever the simulator's Health app happens to hold, which
    /// is nothing — which is most of how this screen went a year without one.
    var bouts: @Sendable () async -> [WorkoutSample] = { [] }
    /// The last bout on record, ghosted behind the empty state.
    var lastBout: CardioLogRow?

    @Environment(\.dismiss) private var dismiss

    @State private var kind = CardioImport.walk
    @State private var km: Double?
    @State private var minutes: Double?
    @State private var incline: Double?
    @State private var kcal: Double?
    @State private var avgHr: Double?
    @State private var effort: Int?
    /// Health's bouts for this date, minus the ones already in the ledger.
    @State private var available: [WorkoutSample] = []
    @State private var didRead = false
    @State private var detailOpen = false
    @FocusState private var focus: Field?

    private enum Field: Hashable { case km, minutes, incline, kcal, avgHr }

    private var pace: String {
        CardioMetrics.formatPace(CardioMetrics.paceMinPerKm(distanceM: km.map { $0 * 1000 }, durationMin: minutes))
    }

    private var canSave: Bool { km != nil || minutes != nil }

    /// Nothing from Health, and nothing typed yet.
    private var isEmpty: Bool { didRead && available.isEmpty && !canSave }

    var body: some View {
        DaySheet("Log cardio", domain: .body, glass: false, primary: ("Save", canSave, { save() })) {
            Form {
                if !available.isEmpty {
                    Section {
                        ForEach(available, id: \.start) { bout in
                            ImportCard(bout: bout) { take(bout) }
                                .listRowInsets(EdgeInsets())
                                .listRowBackground(Color.clear)
                        }
                    } header: {
                        OnyxSectionHeader("From Apple Health", .body)
                    } footer: {
                        Text("Tap a bout to log it. Every figure stays editable afterwards.")
                    }
                }

                if isEmpty { emptySection }

                Section {
                    kindPicker
                    OnyxNumberRow(label: "Distance", value: $km, field: Field.km, focus: $focus,
                                   unit: "km", range: 0...200, fractionLength: 2)
                    OnyxNumberRow(label: "Duration", value: $minutes, field: Field.minutes, focus: $focus,
                                   unit: "min", range: 0...1440, fractionLength: 0)
                    LabeledContent("Pace") {
                        Text(pace).onyxNumeral().foregroundStyle(Color.onyx.textPrimary)
                    }
                } header: {
                    OnyxSectionHeader(available.isEmpty ? "The bout" : "Or enter it by hand", .body)
                } footer: {
                    Text("Pace is derived from distance and duration, never stored.")
                }

                // ── THE REST IS BEHIND A DISCLOSURE ─────────────────────────
                // Four more rows, all optional, all of which an import fills on
                // its own. Showing them open on a screen whose primary path no
                // longer needs them is most of how the old sheet came to read
                // as a wall of em-dashes; `canSave` has never wanted any of them.
                Section {
                    DisclosureGroup("Detail", isExpanded: $detailOpen) {
                        OnyxNumberRow(label: "Incline", value: $incline, field: Field.incline, focus: $focus,
                                       unit: "%", range: 0...40, fractionLength: 1)
                        OnyxNumberRow(label: "Active energy", value: $kcal, field: Field.kcal, focus: $focus,
                                       unit: "kcal", range: 0...5000, fractionLength: 0)
                        OnyxNumberRow(label: "Average heart rate", value: $avgHr, field: Field.avgHr, focus: $focus,
                                       unit: "bpm", range: 0...250, fractionLength: 0)
                        Picker("Effort", selection: $effort) {
                            Text("—").tag(Int?.none)
                            ForEach(1...10, id: \.self) { Text("\($0)").tag(Int?.some($0)) }
                        }
                    }
                }
            }
            .toolbar { OnyxKeyboardDone { focus = nil } }
        }
        .task {
            guard !didRead else { return }
            let found = await bouts()
            available = CardioLogSheet.unimported(found, existing: existing, date: date)
            didRead = true
        }
    }

    // MARK: - The empty state

    /// Not `ContentUnavailableView`.
    ///
    /// The stock empty view says "no data" over a grey glyph, which is true and
    /// teaches nothing. What a person opening this screen needs is the SHAPE of
    /// a bout — that this app wants a distance, a time and a pace — and the
    /// fastest way to say that is to show one. So the last bout on record is
    /// ghosted here, labelled as history rather than as an input, and the
    /// section below it is where the new one goes.
    ///
    /// With no history at all it degrades to the same triptych with dashes,
    /// which still teaches the shape and still is not a grey dumbbell.
    private var emptySection: some View {
        Section {
            VStack(alignment: .leading, spacing: OnyxSpace.s) {
                Text(lastBout == nil ? "Nothing logged yet" : "Your last bout")
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textSecondary)
                HStack(spacing: 0) {
                    ghost("DISTANCE", lastBout.flatMap { $0.distanceM.map { String(format: "%.2f km", $0 / 1000) } })
                    ghost("TIME", lastBout?.durationMin.map { "\(jsIntegerString(jsRound($0))) min" })
                    ghost("PACE", lastBout.map {
                        CardioMetrics.formatPace(
                            CardioMetrics.paceMinPerKm(distanceM: $0.distanceM, durationMin: $0.durationMin)
                        )
                    })
                }
                .opacity(lastBout == nil ? 0.35 : 0.55)
                Text("Apple Health has no bout on this day. Enter one below.")
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textTertiary)
            }
            .padding(.vertical, OnyxSpace.xs)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
        }
    }

    private func ghost(_ label: String, _ value: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .onyxType(.micro)
                .foregroundStyle(Color.onyx.textTertiary)
            Text(value ?? "—")
                .onyxType(.display).onyxNumeral()
                .foregroundStyle(Color.onyx.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - The kind

    /// Six kinds, as glyph chips rather than a segmented control.
    ///
    /// `.segmented` held two and was already tight at an accessibility size; at
    /// six it gives each kind about nine points and renders as six illegible
    /// slivers. A wrapping row of glyph-and-word chips grows onto a second line
    /// instead of shrinking below reading, which is the same trade the session
    /// page's tag row makes for the same reason.
    private var kindPicker: some View {
        FlowRow(spacing: OnyxSpace.xs) {
            ForEach(CardioImport.offered, id: \.self) { key in
                let selected = key == kind
                Button {
                    kind = key
                } label: {
                    HStack(spacing: OnyxSpace.xs) {
                        Image(systemName: CardioKind(key).symbol).imageScale(.small)
                        Text(CardioKind(key).label)
                    }
                    .onyxType(.caption)
                    .foregroundStyle(selected ? Color.onyx.base : Color.onyx.textSecondary)
                    .padding(.horizontal, OnyxSpace.s)
                    .frame(minHeight: 30)
                    .background(
                        Capsule().fill(selected ? OnyxDomain.body.accent : Color.onyx.hairline.opacity(0.6))
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(CardioKind(key).label)
                .accessibilityAddTraits(selected ? [.isSelected] : [])
            }
        }
        .padding(.vertical, 2)
    }

    // MARK: - Taking a bout from Health

    /// Fill the form from a Health bout and save it in one move.
    ///
    /// It fills the form as well as saving, rather than saving silently,
    /// because the sheet stays open when a write fails and because an imported
    /// bout is editable: the figures have to land somewhere they can be
    /// corrected, and this is that somewhere.
    private func take(_ bout: WorkoutSample) {
        kind = bout.cardioKind ?? kind
        km = bout.distanceM.map { $0 / 1000 }
        minutes = (bout.durationMin * 10).rounded() / 10
        kcal = bout.activeKcal.map { $0.rounded() }
        avgHr = bout.avgHr.map { $0.rounded() }
        // Ascent is shown on the card and cannot be stored — `cardio_logs` has
        // no column for it. See `WorkoutSample.elevationM`.
        save(imported: bout.start)
    }

    /// Bouts Health knows about that the ledger does not.
    ///
    /// Static and pure so the filter is testable without a sheet: it is the
    /// half of the import that decides what a person is even OFFERED, and
    /// offering a bout that is already logged is how a ledger grows two of
    /// everything.
    static func unimported(
        _ found: [WorkoutSample], existing: [CardioLogRow], date: String
    ) -> [WorkoutSample] {
        let rows = existing.map(CardioImport.Existing.init)
        return found
            .filter { !$0.isLifting }
            .filter { $0.cardioKind != nil }
            .filter { bout in
                CardioImport.matchingRow(
                    kind: bout.cardioKind ?? "", start: bout.start,
                    durationMin: bout.durationMin, date: date, in: rows
                ) == nil
            }
            .sorted { $0.start > $1.start }
    }

    // MARK: - The write

    /// - Parameter start: the bout's START when this came from Health, nil when
    ///   a person typed it.
    private func save(imported start: Date? = nil) {
        let rows = existing.map(CardioImport.Existing.init)
        // An import overwrites the row it matches; a hand-typed bout is always
        // new, because the person typing it is looking at the day's list and
        // can see what is already on it.
        let match = start.flatMap {
            CardioImport.matchingRow(
                kind: kind, start: $0, durationMin: minutes, date: date, in: rows
            )
        }

        let row = CardioLogRow(
            id: match?.id ?? newOnyxID(), userId: userId, date: date, kind: kind,
            distanceM: km.map { ($0 * 1000).rounded() }, durationMin: minutes,
            // ── `created_at` IS THE BOUT'S START ON AN IMPORTED ROW ─────────
            // The table has no start column and is not getting one. This is the
            // field the duplicate rule reads on the next import, and the field
            // the session page already orders bouts by — where a start is
            // strictly the better value. `CardioImport` states the whole trick.
            fromHealthkit: start != nil, createdAt: start ?? Date(),
            activeKcal: kcal, avgHr: avgHr, effort: effort.map(Double.init), inclinePct: incline
        )
        if onSave(row) { dismiss() }
    }
}

extension CardioImport.Existing {
    /// The store's row, reduced to what the duplicate rule reads.
    init(_ row: CardioLogRow) {
        self.init(
            id: row.id, date: row.date, kind: row.kind, durationMin: row.durationMin,
            createdAt: row.createdAt, fromHealthkit: row.fromHealthkit ?? false
        )
    }
}

// MARK: - One bout, as Health has it

/// A Health bout, offered.
///
/// ── WHY A CARD AND NOT A `LabeledContent` ROW ───────────────────────────────
/// This is the screen's primary path and the only thing on it carrying real
/// numbers, so it is the one thing here allowed to look like something. A row
/// reading "Walk  4.2 km" would be indistinguishable from the input rows below
/// it, and a person cannot tap what they cannot tell apart from a text field.
private struct ImportCard: View {
    let bout: WorkoutSample
    let take: () -> Void

    private var kind: CardioKind { CardioKind(bout.cardioKind ?? "") }
    private var accent: Color { OnyxDomain.body.accent }

    private var pace: String {
        CardioMetrics.formatPace(
            CardioMetrics.paceMinPerKm(distanceM: bout.distanceM, durationMin: bout.durationMin)
        )
    }

    /// Kilometres per hour, for the kinds that are read that way.
    ///
    /// A bike ride at "2:34 /km" is arithmetically correct and is not how any
    /// cyclist or any other app states it — the first shot of this card said
    /// exactly that and read as a running app that had been handed a bicycle.
    /// Foot sports keep pace; wheels and oars get speed.
    ///
    /// Computed here rather than in `CardioMetrics` because that enum is a port
    /// of `src/lib/cardio` with a twin on the web, and a Swift-only member is
    /// how a parity pair starts drifting.
    private var speed: String? {
        let wheeled = [CardioImport.cycling, CardioImport.rowing]
        guard wheeled.contains(bout.cardioKind ?? ""),
              let m = bout.distanceM, m > 0, bout.durationMin > 0
        else { return nil }
        return String(format: "%.1f km/h", (m / 1000) / (bout.durationMin / 60))
    }

    var body: some View {
        Button(action: take) {
            VStack(alignment: .leading, spacing: OnyxSpace.s) {
                HStack(spacing: OnyxSpace.s) {
                    Image(systemName: kind.symbol)
                        .onyxType(.display)
                        .foregroundStyle(accent)
                        .frame(width: 28)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(kind.label)
                            .onyxType(.body).fontWeight(.semibold)
                            .foregroundStyle(Color.onyx.textPrimary)
                        Text(bout.start.formatted(date: .omitted, time: .shortened))
                            .onyxType(.caption).onyxNumeral()
                            .foregroundStyle(Color.onyx.textSecondary)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "plus.circle.fill")
                        .onyxType(.display)
                        .foregroundStyle(accent)
                }
                // Wrapping, not an `HStack`: six figures do not fit 402 pt at an
                // accessibility size, and a fixed row would character-wrap each
                // of them to one glyph per line.
                FlowRow(spacing: OnyxSpace.xs) {
                    ForEach(figures, id: \.0) { figure in
                        stat(figure.0, figure.1)
                    }
                }
            }
            .padding(OnyxSpace.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .onyxGlass(.row)
            .onyxMuscleWash(accent, corner: OnyxCorner.row)
        }
        .buttonStyle(.plain)
        .onyxPress(scale: 0.98)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(kind.label) at \(bout.start.formatted(date: .omitted, time: .shortened))")
        .accessibilityHint("Logs this bout.")
        .accessibilityAddTraits(.isButton)
    }

    /// Only what this bout actually has. A treadmill walk has no ascent and an
    /// erg has no distance; a fixed grid would print "—" for both and spend the
    /// card's width saying what is absent.
    private var figures: [(String, String)] {
        var out: [(String, String)] = []
        if let m = bout.distanceM, m > 0 { out.append(("DIST", String(format: "%.2f km", m / 1000))) }
        out.append(("TIME", "\(jsIntegerString(jsRound(bout.durationMin))) min"))
        if let speed { out.append(("SPEED", speed)) } else if pace != "—" { out.append(("PACE", pace)) }
        if let hr = bout.avgHr { out.append(("HR", "\(jsIntegerString(jsRound(hr))) bpm")) }
        if let up = bout.elevationM, up >= 1 { out.append(("ASCENT", "\(jsIntegerString(jsRound(up))) m")) }
        if let kcal = bout.activeKcal { out.append(("ENERGY", "\(jsIntegerString(jsRound(kcal))) kcal")) }
        return out
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .onyxType(.micro)
                .foregroundStyle(Color.onyx.textTertiary)
            Text(value)
                .onyxType(.caption).onyxNumeral()
                .foregroundStyle(Color.onyx.textPrimary)
                .lineLimit(1)
        }
        .padding(.horizontal, OnyxSpace.s)
        .padding(.vertical, 3)
        .background(Capsule().fill(Color.onyx.hairline.opacity(0.5)))
    }
}

/// The kinds the app files bouts under, and how each one looks.
///
/// The VOCABULARY is `CardioImport.offered` in OnyxCore, where the HealthKit
/// reader can also reach it; this is the presentation half. A key written by
/// the web app that this build has no glyph for still renders — capitalised,
/// with a heart — rather than disappearing.
struct CardioKind {
    let key: String
    init(_ key: String) { self.key = key }

    static let offered = CardioImport.offered

    var label: String {
        switch key {
        case CardioImport.walk: "Walk"
        case CardioImport.run: "Run"
        case CardioImport.cycling: "Cycling"
        case CardioImport.rowing: "Rowing"
        case CardioImport.elliptical: "Elliptical"
        case CardioImport.hiit: "HIIT"
        default: key.capitalized
        }
    }

    var symbol: String {
        switch key {
        case CardioImport.walk: "figure.walk"
        case CardioImport.run: "figure.run"
        case CardioImport.cycling: "figure.outdoor.cycle"
        case CardioImport.rowing: "figure.rower"
        case CardioImport.elliptical: "figure.elliptical"
        case CardioImport.hiit: "figure.highintensity.intervaltraining"
        default: "heart.fill"
        }
    }
}
