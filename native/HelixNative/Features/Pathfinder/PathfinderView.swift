import SwiftUI
import Charts
import GRDB
import HelixUI
import HelixCore
import HelixData

// MARK: - Model

/// One programme week on the timeline: what was planned, what was lifted, and
/// whether a report was written about it.
struct PathfinderWeek: Identifiable {
    let weekStart: String
    let weekEnd: String
    let label: String
    let phase: WeekPhase?
    let era: Era
    let sessions: Int
    let planned: Int
    let tonnageKg: Double
    /// Sunday → Saturday tonnage, for the sparkline.
    let daily: [Double]
    let report: ReportRow?

    var id: String { weekStart }

    /// The phase's domain: a cut is fuel, a bulk is body, everything else
    /// (peak, transition, deload) is recovery.
    var domain: HelixDomain {
        switch phase?.kind {
        case .cut: .fuel
        case .bulk: .body
        default: .recover
        }
    }
}

/// The timeline, oldest week to this one, folded from the training ledger and
/// the reports table. Weeks are Sunday-anchored — the same counter the export
/// and the dashboard badge use — so "Week 6" here is the export's Week 6.
@MainActor
@Observable
final class PathfinderModel {
    private(set) var weeks: [PathfinderWeek] = []
    var era: EraFilter = .all
    var failure: String?
    private(set) var copied = 0

    private let database: AppDatabase
    private let userId: String

    enum EraFilter: String, CaseIterable, Identifiable {
        case all, helix, ppl
        var id: Self { self }
        var label: String {
            switch self {
            case .all: "All"
            case .helix: "Helix"
            case .ppl: "PPL"
            }
        }
    }

    init(database: AppDatabase, userId: String, weeks: [PathfinderWeek] = []) {
        self.database = database
        self.userId = userId
        self.weeks = weeks
    }

    var visible: [PathfinderWeek] {
        switch era {
        case .all: weeks
        case .helix: weeks.filter { $0.era == .axis }
        case .ppl: weeks.filter { $0.era == .ppl }
        }
    }

    func load(today: String = LogicalDay.today()) {
        do {
            weeks = try Self.fold(database: database, userId: userId, today: today)
            failure = nil
        } catch {
            failure = error.localizedDescription
        }
    }

    /// Newest first, from the first programmed week (`Phases.all`) to today.
    static func fold(database: AppDatabase, userId: String, today: String) throws -> [PathfinderWeek] {
        let sessions = try database.sessionHistory()
        let sets = try database.historySets()
        let reports = try database.read { db in
            try ReportRow.filter(Column("user_id") == userId).order(Column("created_at").desc).fetchAll(db)
        }
        let schedule = try WeeklyExportBuilder(database: database, userId: userId).scheduleContext(weekStart: Week.start(of: today))

        var volumeBySession: [String: Double] = [:]
        for (id, own) in Dictionary(grouping: sets, by: \.sessionId) {
            volumeBySession[id] = SessionVolume.sessionVolumeKg(own.map {
                VolumeSet(weightKg: $0.weightKg, reps: Double($0.reps), side: $0.lr, pairId: $0.pairId, setType: $0.setType)
            })
        }
        let sessionsByWeek = Dictionary(grouping: sessions) { Week.start(of: $0.date) }
        var reportByWeek: [String: ReportRow] = [:]
        for r in reports where reportByWeek[Week.start(of: r.periodStart)] == nil { reportByWeek[Week.start(of: r.periodStart)] = r }

        let first = min(Phases.all.map(\.start).min() ?? Week.week0Start, sessions.last?.date ?? Week.week0Start)
        var out: [PathfinderWeek] = []
        var ws = Week.start(of: first)
        let last = Week.start(of: today)
        while ws <= last {
            let days = (0..<7).map { ISODate.addDays(ws, $0) ?? ws }
            let mine = sessionsByWeek[ws] ?? []
            let daily = days.map { day in mine.filter { $0.date == day }.reduce(0) { $0 + (volumeBySession[$1.id] ?? 0) } }
            out.append(PathfinderWeek(
                weekStart: ws, weekEnd: days[6],
                label: Week.label(ofWeekStart: ws),
                phase: Phases.weekPhase(weekStart: ws),
                era: Era.forDate(ws),
                sessions: mine.count,
                planned: days.filter { Schedule.isTrainingDayIn(schedule, $0) }.count,
                tonnageKg: daily.reduce(0, +),
                daily: daily,
                report: reportByWeek[ws]
            ))
            guard let next = ISODate.addDays(ws, 7) else { break }
            ws = next
        }
        return out.reversed()
    }

    /// The export, onto the clipboard. Markdown by default; the fenced JSON
    /// sibling on request.
    func copyExport(_ week: PathfinderWeek, json: Bool = false) {
        do {
            let input = try WeeklyExportBuilder(database: database, userId: userId).input(weekStart: week.weekStart)
            UIPasteboard.general.string = json ? try WeekJson.block(input).joined(separator: "\n") : WeeklyExport.build(input)
            copied += 1
            failure = nil
        } catch {
            failure = "Export failed: \(error.localizedDescription)"
        }
    }
}

// MARK: - View

/// Week by week: the programme as a list of nodes, filtered by era, each one
/// exportable and, when a report was written, readable.
struct PathfinderView: View {
    @Environment(AppEnvironment.self) private var environment

    /// Supplied by the screenshot harness.
    var seeded: PathfinderModel?

    @State private var model: PathfinderModel?

    var body: some View {
        Group {
            if let model {
                timeline(model)
            } else {
                ProgressView().controlSize(.large)
            }
        }
        .helixScreen(.train)
        .tint(HelixDomain.train.accent)
        .navigationTitle("Pathfinder")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if model == nil {
                let m = seeded ?? PathfinderModel(database: environment.database, userId: environment.userIdString)
                if seeded == nil { m.load() }
                model = m
            }
        }
    }

    @ViewBuilder
    private func timeline(_ model: PathfinderModel) -> some View {
        @Bindable var model = model
        List {
            if let failure = model.failure {
                Label(failure, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(Color.helix.danger)
                    .font(.footnote)
            }
            Section {
                ForEach(model.visible) { week in
                    if let report = week.report {
                        NavigationLink {
                            ReportReaderView(report: report)
                        } label: {
                            PathfinderRow(week: week)
                        }
                        .exportActions(week, model)
                    } else {
                        PathfinderRow(week: week)
                            .exportActions(week, model)
                    }
                }
            } header: {
                Picker("Era", selection: $model.era) {
                    ForEach(PathfinderModel.EraFilter.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .textCase(nil)
                .listRowInsets(EdgeInsets())
                .padding(.bottom, 6)
            }
        }
        .listRowBackground(Rectangle().fill(.ultraThinMaterial))
        .scrollContentBackground(.hidden)
        .sensoryFeedback(.success, trigger: model.copied)
        .overlay {
            if model.visible.isEmpty {
                ContentUnavailableView(
                    "No weeks yet",
                    systemImage: "point.topleft.down.to.point.bottomright.curvepath",
                    description: Text("The timeline fills in as sessions are logged.")
                )
            }
        }
    }
}

private extension View {
    /// Swipe to copy the markdown; the JSON sibling lives behind a long press.
    func exportActions(_ week: PathfinderWeek, _ model: PathfinderModel) -> some View {
        self
            .swipeActions(edge: .trailing) {
                Button { model.copyExport(week) } label: { Label("Copy export", systemImage: "doc.on.doc") }
                    .tint(HelixDomain.train.accent)
            }
            .contextMenu {
                Button { model.copyExport(week) } label: { Label("Copy weekly export", systemImage: "doc.on.doc") }
                Button { model.copyExport(week, json: true) } label: { Label("Copy JSON", systemImage: "curlybraces") }
            }
    }
}

/// One week node.
private struct PathfinderRow: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    let week: PathfinderWeek

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            // Badge beside the week, until the week alone is a line wide.
            let titleRow = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                : AnyLayout(HStackLayout(spacing: 8))
            VStack(alignment: .leading, spacing: 3) {
                titleRow {
                    Text(week.label)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.helix.textPrimary)
                    if let phase = week.phase {
                        Text(phase.short)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(week.domain.accent)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .background(week.domain.accent.opacity(0.14), in: Capsule())
                    }
                }
                Text(Self.range(week))
                    .font(.caption)
                    .foregroundStyle(Color.helix.textSecondary)
                Text(summary)
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(Color.helix.textSecondary)
            }
            Spacer(minLength: 8)
            // Decorative; at accessibility sizes its 56 pt is the difference
            // between "Week 6" and "We / ek 6".
            if week.tonnageKg > 0, !typeSize.isAccessibilitySize {
                Chart(Array(week.daily.enumerated()), id: \.offset) { day, kg in
                    BarMark(x: .value("Day", day), y: .value("Tonnage", kg))
                }
                .helixChart(.train)
                .chartXAxis(.hidden)
                .chartYAxis(.hidden)
                .frame(width: 56, height: 24)
                .accessibilityHidden(true)
            }
        }
        .padding(.vertical, 4)
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(week.label), \(Self.range(week)), \(summary)")
    }

    private var summary: String {
        let sessions = "\(week.sessions) / \(week.planned) sessions"
        guard week.tonnageKg > 0 else { return sessions }
        return "\(sessions) · \(week.tonnageKg.formatted(.number.precision(.fractionLength(0)))) kg"
    }

    /// `23 – 29 Aug 2026` — the stored dates, formatted.
    static func range(_ week: PathfinderWeek) -> String {
        guard let start = LogicalDay.date(fromISO: week.weekStart), let end = LogicalDay.date(fromISO: week.weekEnd) else {
            return "\(week.weekStart) – \(week.weekEnd)"
        }
        return "\(start.formatted(.dateTime.day().month(.abbreviated))) – "
            + end.formatted(.dateTime.day().month(.abbreviated).year())
    }
}

#if DEBUG
#Preview("Pathfinder") {
    PathfinderPreviews.view("pathfinder")
}

#Preview("Pathfinder · empty") {
    PathfinderPreviews.view("pathfinder-empty")
}
#endif
