import SwiftUI
import HelixUI
import HelixCore
import HelixData

/// Every past session, newest first, a month per section.
///
/// The row is the session's SHAPE — day, sets, tonnage, duration, records —
/// and nothing that needs the sets to be read to understand. The report is one
/// tap away; a list that tries to be the report is a list nobody can scan.
struct SessionHistoryView: View {
    @Environment(AppEnvironment.self) private var environment

    @State private var summaries: [SessionAnalysis.Summary]?

    var body: some View {
        List {
            ForEach(months, id: \.key) { month in
                Section {
                    ForEach(month.rows) { row in
                        NavigationLink {
                            SessionDetailView(sessionId: row.id)
                        } label: {
                            SessionRow(summary: row)
                        }
                    }
                } header: {
                    HelixSectionHeader(month.title, .train)
                }
            }
        }
        .listRowBackground(Rectangle().fill(.ultraThinMaterial))
        .scrollContentBackground(.hidden)
        .helixScreen(.train)
        .tint(HelixDomain.train.accent)
        .navigationTitle("History")
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            if summaries == nil {
                ProgressView()
            } else if summaries?.isEmpty == true {
                ContentUnavailableView("No sessions yet", systemImage: "clock.arrow.circlepath",
                                       description: Text("Finish a workout and it lands here."))
            }
        }
        .task {
            let database = environment.database
            // Off the main actor: the PR replay walks the whole ledger.
            summaries = await Task.detached(priority: .userInitiated) {
                guard let sessions = try? database.sessionHistory(), let ledger = try? database.historySets() else { return [] }
                return SessionAnalysis.summaries(sessions, ledger: ledger)
            }.value
        }
    }

    private var months: [(key: String, title: String, rows: [SessionAnalysis.Summary])] {
        var order: [String] = []
        var by: [String: [SessionAnalysis.Summary]] = [:]
        for s in summaries ?? [] {
            let key = String(s.date.prefix(7))
            if by[key] == nil { order.append(key) }
            by[key, default: []].append(s)
        }
        return order.map { key in
            let title = LogicalDay.date(fromISO: key + "-01").map { $0.formatted(.dateTime.month(.wide).year()) } ?? key
            return (key, title, by[key]!)
        }
    }
}

struct SessionRow: View {
    let summary: SessionAnalysis.Summary

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(Color.helix.day(summary.dayKey))
                .frame(width: 8, height: 8)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(Self.date(summary.date))
                    .foregroundStyle(Color.helix.textPrimary)
                Text(SessionAnalysis.dayLabel(summary.dayKey) ?? "Session")
                    .font(.caption)
                    .foregroundStyle(Color.helix.textSecondary)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(Format.volume(summary.tonnageKg)) kg")
                    .helixNumeral()
                    .foregroundStyle(Color.helix.textPrimary)
                Text(meta)
                    .font(.caption)
                    .helixNumeral()
                    .foregroundStyle(Color.helix.textSecondary)
            }
        }
        .padding(.vertical, 4)
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }

    private var meta: String {
        var parts = ["\(summary.sets) sets"]
        if let min = summary.durationMin { parts.append("\(jsIntegerString(jsRound(min))) min") }
        if summary.prCount > 0 { parts.append("\(summary.prCount) PR") }
        return parts.joined(separator: " · ")
    }

    static func date(_ iso: String) -> String {
        LogicalDay.date(fromISO: iso).map { $0.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)) } ?? iso
    }
}
