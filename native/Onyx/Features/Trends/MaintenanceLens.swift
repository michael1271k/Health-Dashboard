import Foundation
import SwiftUI
import GRDB
import OnyxCore
import OnyxData

/// Is this date inside a maintenance week? Resolved ONCE per screen.
///
/// ── WHY A LENS AND NOT A CALL PER MARK ──────────────────────────────────────
/// `Maintenance.leverOn` needs three things a chart does not have — the stored
/// lever, its end date and today — and they come off `user_goals`, which is a
/// store read. A chart that asked per bar would read the row once per mark and
/// re-resolve a rule that cannot change between them; worse, two charts on one
/// screen that each read it at a different moment can disagree about the same
/// week. The screen reads it once and both charts see the same answer.
///
/// ── AND WHY THE LEVER, NOT THE UNION ────────────────────────────────────────
/// `Maintenance.isMaintenanceDate` is lever ∪ deload PHASE, which is right for
/// the targets a day is graded against. What a volume chart is drawing is
/// planned lighter WEEKS — the lever the athlete pulled — and the historical
/// deloads the phase table carries (Thailand, the Transition) are already
/// visible as the absence of sessions. Same rule `HistoryWeeks.Capsule` uses.
struct MaintenanceLens {
    /// The rungs, the schedule of rungs and the selection — rows since W2.
    let ladder: LeverLadder
    let today: String

    /// No rows at all — which is not the same as no maintenance once a ladder
    /// exists: `Levers.leverForDate` falls back to the schedule of periods for
    /// any past date. With an empty ladder nothing is ever maintenance, which
    /// is the right answer for a signed-out store.
    static let schedule = MaintenanceLens(ladder: .empty, today: LogicalDay.today())

    func callsIt(_ dateISO: String) -> Bool {
        Maintenance.leverOn(dateISO, today: today, ladder: ladder)
    }

    /// A WEEK is a maintenance week when most of its days are — the same
    /// majority rule `HistoryWeeks` folds a capsule with, so a lever pulled
    /// mid-week does not paint both weeks around it.
    func callsWeek(startingOn weekStart: String) -> Bool {
        let days = (0..<7).compactMap { ISODate.addDays(weekStart, $0) }
        guard !days.isEmpty else { return false }
        return days.filter(callsIt).count * 2 > days.count
    }

    static func read(database: AppDatabase, userId: String, today: String = LogicalDay.today()) -> MaintenanceLens {
        MaintenanceLens(ladder: (try? database.leverLadder(userId: userId)) ?? .empty, today: today)
    }
}

/// The chip that says what a washed-out mark means.
///
/// One definition, because two charts show it and a legend that says
/// "Maintenance" on one screen and "Deload" on the next is two vocabularies for
/// one lever. Drawn only when the window actually contains one — a legend for a
/// state nothing is in is a line of chrome explaining nothing.
struct MaintenanceLegend: View {
    /// The swatch has to be the mark it explains. A hollow ring beside a chart
    /// of washed-back BARS is a key to a symbol that is not on the chart.
    enum Symbol { case point, bar }

    var symbol: Symbol = .point

    var body: some View {
        HStack(spacing: 6) {
            switch symbol {
            case .point:
                Circle()
                    .strokeBorder(Color.onyx.textSecondary, lineWidth: 1.5)
                    .frame(width: 9, height: 9)
            case .bar:
                RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                    .fill(Color.onyx.accent(.train).opacity(0.38))
                    .frame(width: 7, height: 11)
            }
            Text("Maintenance")
                .font(.caption2)
                .foregroundStyle(Color.onyx.textSecondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            symbol == .point
                ? "Hollow points are maintenance weeks"
                : "Washed-back bars are maintenance weeks"
        )
    }
}
