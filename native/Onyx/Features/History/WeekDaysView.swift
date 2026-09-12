import SwiftUI
import OnyxUI
import OnyxCore
import OnyxData

/// One week, day by day (§5.9).
///
/// Seven rows and never fewer. A rest day and a missed day both have nothing in
/// the database to draw from, and they are the two facts a training log is most
/// often consulted for — so the row is built from the SCHEDULE and then filled
/// in from what was logged, rather than built from what was logged and padded.
struct WeekDaysView: View {
    @Environment(AppEnvironment.self) private var environment

    let window: WeekWindow
    /// Supplied only by the screenshot harness.
    var seeded: HistoryWeeks.WeekDetail?

    @State private var detail: HistoryWeeks.WeekDetail?
    /// The generation this screen's data was read at.
    ///
    /// `.task(id:)` fires on appear too, and this screen deliberately reads its
    /// whole ledger once. Keying the guard on the generation preserves that and
    /// re-reads exactly when a rescore cascade has finished rewriting what is
    /// under it — see `AppEnvironment.rescoreGeneration`.
    @State private var loadedAt = -1

    /// The week as a `.md` FILE, written to the temporary directory.
    ///
    /// A `URL` and not a `String`: `ShareLink` hands a string to the sheet as
    /// loose text, so Files offers no "Save to", Mail has nothing to attach and
    /// the artefact reaches the other side with no name. A file arrives as
    /// `onyx-week-07-2026-08-30.md`, which is what makes a weekly document
    /// something you can keep rather than something you can paste once.
    @State private var exportFile: URL?

    var body: some View {
        List {
            if let detail {
                Section {
                    WeekVitalsRow(vitals: detail.vitals)
                        .listRowInsets(.init(top: OnyxSpace.s, leading: OnyxSpace.l,
                                             bottom: OnyxSpace.s, trailing: OnyxSpace.l))
                }
                .listRowBackground(Color.clear)

                Section {
                    ForEach(detail.days) { day in
                        NavigationLink {
                            DayScreen(model: DayModel(
                                database: environment.database,
                                userId: environment.userIdString,
                                date: day.date
                            ))
                        } label: {
                            DayHistoryRow(day: day)
                        }
                    }
                } header: {
                    OnyxSectionHeader("Days", .train)
                }

                actions(detail)
            }
        }
        .listStyle(.plain)
        .listSectionSpacing(OnyxSpace.l)
        .scrollContentBackground(.hidden)
        .onyxScreen(.train)
        .tint(OnyxDomain.train.accent)
        .navigationTitle(window.label(in: environment.targets?.schedule))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 0) {
                    Text(window.label(in: environment.targets?.schedule)).onyxType(.body).foregroundStyle(Color.onyx.textPrimary)
                    Text(window.rangeLabel).onyxType(.micro).foregroundStyle(Color.onyx.textSecondary)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .overlay { if detail == nil { ProgressView() } }
        .task(id: environment.rescoreGeneration) { await load() }
    }

    // MARK: - Actions

    @ViewBuilder
    private func actions(_ detail: HistoryWeeks.WeekDetail) -> some View {
        Section {
            if let report = detail.report {
                NavigationLink {
                    ReportReaderView(report: report)
                } label: {
                    LabeledContent("Weekly report", value: report.periodStart)
                }
            }
            // ── EXPORT IS A CLOSING RITUAL, NOT A LIVE ONE ──────────────────
            // The web has refused this on a running week since the loop was
            // built (`PathfinderTimeline`): an export of a week with days left
            // to log is a partial record, and any report written from it then
            // sits in the ledger looking final. The phone offered it on every
            // week including the live one, which is the same bug with a nicer
            // share sheet.
            //
            // `WeekReady.isComplete` is the CALENDAR rule — strictly after the
            // week's last day — and deliberately not `isReady`, which fires
            // mid-week the moment the planned work is done. The wrap-up wants
            // `isReady`; a document that claims to be the week does not.
            //
            // The absence is stated rather than silent. A control that vanishes
            // with no explanation reads as a bug, and the answer to "where did
            // the button go" is a date.
            if !weekIsComplete {
                Label(
                    "Export opens when the week closes · \(Swap.shortDayLabel(ISODate.addDays(window.start, 7) ?? window.start))",
                    systemImage: "lock"
                )
                .onyxType(.caption)
                .foregroundStyle(Color.onyx.textSecondary)
            } else if let exportFile {
                // ── WHAT THIS SHARES ────────────────────────────────────────
                // The week as a DOCUMENT. `WeeklyExportBuilder` assembles the
                // payload and `WeeklyExport.build` renders it — the same
                // renderer the web app runs, byte for byte, pinned by the
                // golden fixture both languages read.
                //
                // This used to share the assembled input as raw JSON, because
                // the Markdown renderer existed only on the web. It has been
                // ported; the payload was never the thing a reader wanted.
                ShareLink(
                    item: exportFile,
                    subject: Text("\(window.label(in: environment.targets?.schedule)) · \(window.rangeLabel)"),
                    preview: SharePreview(exportFile.lastPathComponent)
                ) {
                    LabeledContent("Export week", value: "Markdown")
                }
            }
        } header: {
            OnyxSectionHeader("This week", .recover)
        } footer: {
            Text(detail.report == nil
                 ? "No weekly report has been written for these dates yet."
                 : "The report is the pasted-back brief; the export is what it was written from.")
        }
    }

    /// Strictly after this week's final day, in the device's own calendar —
    /// the same rule the web's export gate reads.
    private var weekIsComplete: Bool {
        // `environment.today` and not a fresh clock read: it is the app's one
        // answer to "what day is it", and it is observed — so a week that
        // closes while this screen is open opens its export without a reload.
        WeekReady.isComplete(weekStart: window.start, today: environment.today)
    }

    // MARK: - Loading

    private func load() async {
        if let seeded {
            detail = seeded
            return
        }
        guard loadedAt != environment.rescoreGeneration else { return }
        loadedAt = environment.rescoreGeneration
        let database = environment.database
        let userId = environment.userIdString
        let window = self.window
        let built = await Task.detached(priority: .userInitiated) { () -> (HistoryWeeks.WeekDetail, String?) in
            let detail = HistoryWeeks.detail(database: database, window: window)
            let input = try? WeeklyExportBuilder(database: database, userId: userId)
                .input(weekStart: window.start)
            let text = input.map { WeeklyExport.build($0) }
            return (detail, text)
        }.value
        detail = built.0
        exportFile = built.1.flatMap { Self.writeExport($0, weekStart: window.start) }
    }

    /// The document, on disk, under a name a reader can file.
    ///
    /// The temporary directory and not the App Group: this is a hand-off to the
    /// share sheet and nothing else reads it. The file is REWRITTEN on every
    /// load rather than appended to or suffixed, so re-exporting the same week
    /// twice leaves one file rather than a drawer of near-identical ones.
    private static func writeExport(_ markdown: String, weekStart: String) -> URL? {
        // `2026-08-30` → `onyx-week-2026-08-30.md`. The date and not the week
        // NUMBER: a number is only meaningful inside one programme, and a file
        // outlives the programme it came from.
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("onyx-week-\(weekStart).md")
        do {
            try markdown.write(to: url, atomically: true, encoding: .utf8)
            return url
        } catch {
            // A share that cannot be written is a button that does nothing, so
            // the row disappears rather than presenting an empty sheet.
            return nil
        }
    }
}

// MARK: - The 2×4

/// Eight cells over two rows: what the body did, what recovery did, and what
/// the training added up to.
///
/// Every value is optional and a missing one renders `—`. A week with no
/// weigh-in has no delta, and a `0.0 kg` in that slot is a claim that the
/// weight held steady.
struct WeekVitalsRow: View {
    let vitals: HistoryWeeks.WeekVitals

    @Environment(\.dynamicTypeSize) private var typeSize

    private struct Entry: Identifiable {
        let id: String
        let value: String?
        let domain: OnyxDomain
    }

    private var entries: [Entry] {
        [
            Entry(id: "Weight", value: delta(vitals.weightDeltaKg, unit: "kg", places: 1), domain: .body),
            Entry(id: "Fat", value: delta(vitals.fatDeltaPct, unit: "%", places: 1), domain: .body),
            Entry(id: "Battery", value: vitals.batteryMean.map { jsIntegerString(jsRound($0)) }, domain: .recover),
            Entry(id: "Sleep score", value: vitals.sleepScoreMean.map { jsIntegerString(jsRound($0)) }, domain: .recover),
            Entry(id: "Sleep", value: vitals.sleepMeanMinutes.map(Self.hours), domain: .recover),
            Entry(id: "Steps", value: vitals.stepsMean.map { jsIntegerString(jsRound($0)) }, domain: .body),
            Entry(id: "Tonnage", value: vitals.tonnageKg > 0 ? "\(Format.volume(vitals.tonnageKg)) kg" : nil, domain: .train),
            Entry(id: "Sessions", value: "\(vitals.sessions)", domain: .train),
        ]
    }

    var body: some View {
        Group {
            // ── WHY IT STOPS BEING A GRID ───────────────────────────────────
            // Two columns at AX5 gave every cell half a phone to hold a label
            // AND a number: "Tonnage" hyphenated into "Ton-nage" and
            // "12,510.0 kg" truncated to "12,510…" — a figure shown as an
            // ellipsis is worse than one not shown. At accessibility sizes the
            // eight become eight rows, label leading and number trailing, which
            // is what every other list in this app already does.
            if typeSize.isAccessibilitySize {
                VStack(spacing: OnyxSpace.m) {
                    ForEach(entries) { entry in
                        HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.s) {
                            label(entry)
                            Spacer(minLength: OnyxSpace.s)
                            value(entry)
                        }
                    }
                }
            } else {
                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible(), spacing: OnyxSpace.s), count: 4),
                    spacing: OnyxSpace.m
                ) {
                    ForEach(entries) { entry in
                        VStack(alignment: .leading, spacing: 2) {
                            label(entry)
                            value(entry)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
        .padding(OnyxSpace.m)
        .onyxGlass(.tile)
    }

    private func label(_ entry: Entry) -> some View {
        Text(entry.id)
            .onyxType(.micro)
            .foregroundStyle(Color.onyx.textTertiary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityHidden(true)
    }

    private func value(_ entry: Entry) -> some View {
        Text(entry.value ?? "—")
            .onyxType(.secondary)
            .onyxNumeral()
            .foregroundStyle(entry.value == nil ? Color.onyx.textTertiary : entry.domain.accent)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .accessibilityElement()
            .accessibilityLabel("\(entry.id), \(entry.value ?? "no reading")")
    }

    /// A delta always carries its sign — `+0.4`, `−0.9` — because the sign IS
    /// the reading. An unsigned 0.4 in a cut is the opposite news.
    private func delta(_ value: Double?, unit: String, places: Int) -> String? {
        guard let value else { return nil }
        let sign = value > 0 ? "+" : ""
        return "\(sign)\(value.formatted(.number.precision(.fractionLength(places)))) \(unit)"
    }

    private static func hours(_ minutes: Double) -> String {
        let total = Int(jsRound(minutes))
        return "\(total / 60)h \(String(format: "%02d", total % 60))m"
    }
}

// MARK: - A day

/// `Thu 3 Sep · Chest & Back A` and what it held.
struct DayHistoryRow: View {
    let day: HistoryWeeks.DayRow

    var body: some View {
        HStack(spacing: OnyxSpace.m) {
            // The same three states the capsule strip draws, so a day that is
            // a speck there is a speck here: logged, planned-and-not, rest.
            Group {
                if day.isLogged {
                    Circle().fill(Color.onyx.day(day.dayKey))
                } else if day.dayKey == nil {
                    Circle()
                        .fill(Color.onyx.textTertiary.opacity(0.5))
                        .frame(width: 4, height: 4)
                } else {
                    Circle().strokeBorder(Color.onyx.day(day.dayKey).opacity(day.isFuture ? 0.35 : 0.8), lineWidth: 1.5)
                }
            }
            .frame(width: 8, height: 8)
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(SessionRow.date(day.date))
                    .foregroundStyle(day.isFuture ? Color.onyx.textTertiary : Color.onyx.textPrimary)
                Text(title)
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textSecondary)
            }

            Spacer(minLength: OnyxSpace.s)

            VStack(alignment: .trailing, spacing: 2) {
                if day.isLogged {
                    Text("\(Format.volume(day.tonnageKg)) kg")
                        .onyxNumeral()
                        .foregroundStyle(Color.onyx.textPrimary)
                }
                Text(meta)
                    .onyxType(.caption)
                    .onyxNumeral()
                    .foregroundStyle(Color.onyx.textSecondary)
            }
        }
        .padding(.vertical, OnyxSpace.xs)
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }

    private var title: String {
        if day.isLogged { return day.label ?? "Session" }
        if day.dayKey == nil { return "Rest" }
        return day.isFuture ? "\(day.label ?? "Planned") · planned" : "\(day.label ?? "Planned") · missed"
    }

    /// Sets and PRs when there was a session; the day's own numbers otherwise,
    /// because a rest day still has sleep and steps worth scanning.
    private var meta: String {
        var parts: [String] = []
        if day.isLogged {
            parts.append("\(day.sets) sets")
            if let minutes = day.durationMin { parts.append("\(jsIntegerString(jsRound(minutes))) min") }
            if day.prCount > 0 { parts.append("\(day.prCount) PR") }
        }
        if let steps = day.steps { parts.append("\(steps.formatted()) steps") }
        if let sleep = day.sleepMinutes { parts.append("\(sleep / 60)h \(String(format: "%02d", sleep % 60))m") }
        return parts.isEmpty ? "—" : parts.joined(separator: " · ")
    }
}

/// Shared date formatting for every history row.
///
/// Kept as a type rather than folded into the rows: `SessionDetailView` titles
/// itself with the same string, and two spellings of "Thu 3 Sep" on a page and
/// the row that opened it is the kind of drift nobody notices until a month
/// abbreviation changes.
enum SessionRow {
    static func date(_ iso: String) -> String {
        LogicalDay.date(fromISO: iso).map {
            $0.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
        } ?? iso
    }
}

#if DEBUG
#Preview("Week") { HistoryPreviews.view("history-week") }
#endif
