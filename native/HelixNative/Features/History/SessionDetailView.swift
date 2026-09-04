import SwiftUI
import HelixUI
import HelixCore
import HelixData

/// The Workout Analysis screen: what one session was.
///
/// ── NOT THE WEB REPORT ──────────────────────────────────────────────────────
/// `session/[id]/page.tsx` is three bordered bands with a six-cell metric
/// table. This is a `List`: a hero row, then one `Section` per exercise whose
/// rows ARE the sets — the previous session's set beside each, the progression
/// cue in the header, the stats in the footer — then highlights, where the
/// session landed on the body, the cardio, and a trail of estimated 1RMs.
///
/// Records are DETECTED here, not read: `personal_records` is a current-best
/// table, so an old session's trophies would vanish the day they were beaten.
/// `SessionAnalysis.report` replays the engine against the sets that came
/// before, which is the same question the save path asked on the day.
struct SessionDetailView: View {
    let sessionId: String

    @Environment(AppEnvironment.self) private var environment
    @State private var report: SessionAnalysis.Report?
    @State private var missing = false

    var body: some View {
        List {
            if let report {
                hero(report)
                ForEach(report.exercises) { exercise in
                    exerciseSection(exercise)
                }
                if !report.highlights.isEmpty { highlights(report.highlights) }
                if !report.muscles.isEmpty { muscleFocus(report.muscles) }
                if !report.cardio.isEmpty { cardio(report.cardio) }
                if !report.trail.isEmpty { trail(report.trail) }
            }
        }
        .listRowBackground(Rectangle().fill(.ultraThinMaterial))
        .scrollContentBackground(.hidden)
        .helixScreen(.train)
        .tint(HelixDomain.train.accent)
        .navigationTitle(report.map { SessionRow.date($0.session.date) } ?? "Session")
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            if missing {
                ContentUnavailableView("Session not found", systemImage: "questionmark.circle")
            } else if report == nil {
                ProgressView()
            }
        }
        .task {
            let database = environment.database, id = sessionId
            report = await Task.detached(priority: .userInitiated) { () -> SessionAnalysis.Report? in
                guard let session = try? database.session(id: id),
                      let rows = try? database.historySets(sessionId: id) else { return nil }
                let ids = Array(Set(rows.map(\.exerciseId)))
                let history = (try? database.historySets(exerciseIds: ids)) ?? []
                let cardio = (try? database.cardio(sessionId: id, date: session.date)) ?? []
                return SessionAnalysis.report(session, rows: rows, history: history, cardio: cardio)
            }.value
            missing = report == nil
        }
    }

    // MARK: - Hero

    private func hero(_ r: SessionAnalysis.Report) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Circle().fill(Color.helix.day(r.session.dayKey)).frame(width: 8, height: 8)
                        .accessibilityHidden(true)
                    Text(SessionAnalysis.dayLabel(r.session.dayKey) ?? "Session")
                        .font(.headline)
                        .foregroundStyle(Color.helix.textPrimary)
                    Spacer()
                    if let rpe = r.session.sessionRpe {
                        Text("RPE \(jsIntegerString(rpe))")
                            .font(.caption).helixNumeral()
                            .foregroundStyle(Color.helix.textSecondary)
                    }
                }
                // Four figures, wrapping at accessibility sizes rather than
                // shrinking: `ViewThatFits` picks the row while it fits.
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 0) { stats(r) }
                    VStack(alignment: .leading, spacing: 8) { stats(r) }
                }
            }
            .padding(.vertical, 6)
        }
    }

    @ViewBuilder
    private func stats(_ r: SessionAnalysis.Report) -> some View {
        stat(Format.volume(r.tonnageKg), "kg lifted")
        stat("\(r.sets)", "sets")
        stat(r.session.durationMin.map { jsIntegerString(jsRound($0)) } ?? "—", "min")
        stat("\(r.prCount)", r.prCount == 1 ? "record" : "records", accent: r.prCount > 0)
    }

    private func stat(_ value: String, _ label: String, accent: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.system(.title3, design: .rounded).weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(accent ? HelixDomain.train.accent : Color.helix.textPrimary)
            Text(label)
                .font(.caption2)
                .foregroundStyle(Color.helix.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Exercises

    private func exerciseSection(_ ex: SessionAnalysis.ExerciseReport) -> some View {
        Section {
            ForEach(Array(ex.rows.enumerated()), id: \.offset) { _, row in
                SetRow(row: row, timed: ex.timed)
            }
        } header: {
            HStack(alignment: .firstTextBaseline) {
                HelixSectionHeader(ex.canonical, .train)
                Spacer()
                if let cue = ex.cue {
                    Text(cue.short)
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(HelixDomain.train.accent.opacity(0.18), in: .capsule)
                        .foregroundStyle(HelixDomain.train.accent)
                        .accessibilityLabel(cue.title)
                }
            }
        } footer: {
            Text(footer(ex)).helixNumeral()
        }
    }

    private func footer(_ ex: SessionAnalysis.ExerciseReport) -> String {
        let n = Int(ex.detail.workingSets)
        var parts = ["\(n) set\(n == 1 ? "" : "s")" + (ex.window.map { " @ \($0)" } ?? "")]
        parts.append("top " + SetFormat.format(weightKg: ex.stats.topKg, reps: ex.stats.topReps, timed: ex.timed))
        if !ex.timed { parts.append("\(jsIntegerString(ex.stats.totalReps)) reps") }
        if let rpe = ex.stats.avgRpe { parts.append("RPE \(jsToFixed1(rpe))") }
        if let prev = ex.prevDate { parts.append("prev \(HelixChart.shortDate(LogicalDay.date(fromISO: prev) ?? Date()))") }
        return parts.joined(separator: " · ")
    }

    // MARK: - Highlights

    private func highlights(_ rows: [Highlight]) -> some View {
        Section {
            ForEach(rows, id: \.name) { h in
                LabeledContent {
                    Text(h.detail).helixNumeral().foregroundStyle(Color.helix.textPrimary)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(h.name)
                        Text(h.axes.joined(separator: " · "))
                            .font(.caption)
                            .foregroundStyle(HelixDomain.train.accent)
                    }
                }
            }
        } header: {
            HelixSectionHeader("Records", .train)
        }
    }

    // MARK: - Muscle focus

    private func muscleFocus(_ rows: [(muscle: LandmarkMuscle, sets: Double)]) -> some View {
        let top = rows.first?.sets ?? 1
        return Section {
            ForEach(Array(rows.enumerated()), id: \.element.muscle) { i, m in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(m.muscle.displayName)
                        Spacer()
                        Text(jsToFixed1(m.sets)).helixNumeral().foregroundStyle(Color.helix.textPrimary)
                    }
                    ProgressView(value: m.sets, total: top)
                        .tint(Color.helix.muscle(m.muscle, step: i, of: rows.count))
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(m.muscle.displayName), \(jsToFixed1(m.sets)) sets")
            }
        } header: {
            HelixSectionHeader("Muscle focus", .train)
        } footer: {
            Text("Weighted sets: a full set to what a movement trains directly, half to what assists. Warm-ups count here.")
        }
    }

    // MARK: - Cardio

    private func cardio(_ rows: [CardioLogRow]) -> some View {
        Section {
            ForEach(rows, id: \.id) { c in
                LabeledContent(c.kind.capitalized) {
                    Text(cardioText(c)).helixNumeral().foregroundStyle(Color.helix.textPrimary)
                }
            }
        } header: {
            HelixSectionHeader("Cardio", .body)
        }
    }

    private func cardioText(_ c: CardioLogRow) -> String {
        var parts: [String] = []
        if let m = c.distanceM { parts.append("\(jsToFixed1(m / 1000)) km") }
        if let min = c.durationMin { parts.append("\(jsIntegerString(jsRound(min))) min") }
        if let pace = CardioMetrics.paceMinPerKm(distanceM: c.distanceM, durationMin: c.durationMin) {
            parts.append(CardioMetrics.formatPace(pace))
        }
        if let pct = c.inclinePct { parts.append("\(jsIntegerString(pct))%") }
        return parts.isEmpty ? "—" : parts.joined(separator: " · ")
    }

    // MARK: - Trail

    private func trail(_ series: [SessionAnalysis.TrailSeries]) -> some View {
        Section {
            HelixChartCard("Progression trail", domain: .train, caption: "Best estimated 1RM per session, last eight.") {
                E1rmTrendChart(series: series)
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }
}

/// One ledger row: the set as performed, the PR axes it won, the RPE, and the
/// same set from the previous session. A unilateral pair is one row.
struct SetRow: View {
    let row: RowWithPrev
    let timed: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(ordinal)
                .font(.caption.weight(.semibold))
                .helixNumeral()
                .foregroundStyle(Color.helix.textTertiary)
                .frame(minWidth: 20, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(current).helixNumeral().foregroundStyle(Color.helix.textPrimary)
                    ForEach(axes, id: \.self) { axis in
                        Text(axis)
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(HelixDomain.train.accent.opacity(0.18), in: .capsule)
                            .foregroundStyle(HelixDomain.train.accent)
                    }
                }
                if let previous {
                    Text("prev \(previous)")
                        .font(.caption).helixNumeral()
                        .foregroundStyle(Color.helix.textTertiary)
                }
            }
            Spacer(minLength: 4)
            if let rpe {
                Text("RPE \(jsIntegerString(rpe))")
                    .font(.caption).helixNumeral()
                    .foregroundStyle(Color.helix.textSecondary)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var ordinal: String { row.row.num.map(String.init) ?? "W" }

    private var lead: DetailSet? { row.row.set ?? row.row.left ?? row.row.right }

    private var current: String {
        if row.row.kind == "pair" {
            return [row.row.left.map { "L " + fmt($0.weightKg, $0.reps) }, row.row.right.map { "R " + fmt($0.weightKg, $0.reps) }]
                .compactMap { $0 }.joined(separator: " · ")
        }
        return lead.map { fmt($0.weightKg, $0.reps) } ?? "—"
    }

    private var previous: String? {
        guard row.row.num != nil, let p = row.prev else { return nil }
        if row.row.kind == "pair", let r = row.prevRight {
            return "L \(fmt(p.weightKg, p.reps)) · R \(fmt(r.weightKg, r.reps))"
        }
        return fmt(p.weightKg, p.reps)
    }

    private var axes: [String] {
        var out: [String] = []
        for a in [row.row.set, row.row.left, row.row.right].compactMap { $0?.prAxes }.flatMap({ $0 }) {
            let label = PrAxis(rawValue: a).map { PrEngine.axisLabel($0, timed: timed) } ?? a
            if !out.contains(label) { out.append(label) }
        }
        return out
    }

    private var rpe: Double? {
        [row.row.set, row.row.left, row.row.right].compactMap { $0?.rpe }.max()
    }

    private func fmt(_ kg: Double, _ reps: Double) -> String {
        SetFormat.format(weightKg: kg, reps: reps, timed: timed)
    }
}
