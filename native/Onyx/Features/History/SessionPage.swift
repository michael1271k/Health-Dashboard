import Foundation
import GRDB
import OnyxCore
import OnyxData

/// Everything the post-workout page draws, assembled in ONE pass off the main
/// actor.
///
/// ── WHY THE WHOLE LEDGER, ONCE ──────────────────────────────────────────────
/// The page asks four questions that all want the same rows: what this session
/// was, what the session before it was, where this split's tonnage has been
/// going, and which sets were records. Reading per question means four passes
/// over overlapping ranges and four chances for them to disagree — the record
/// count in the metric grid differing from the gold points on the chart, say.
/// So the ledger is read once and every number on the screen comes out of that
/// one snapshot.
///
/// It is a few thousand rows and `HistoryWeeks` already reads all of them
/// on every open. When the ledger reaches six figures this becomes a ranged
/// query in `OnyxData`, which Track E owns (plan §10).
extension SessionAnalysis {

    /// One session of this split, on the progression line.
    struct SplitPoint: Identifiable, Sendable, Equatable {
        var id: String { sessionId }
        let sessionId: String
        let date: String
        let tonnageKg: Double
        let prCount: Int
    }

    struct Page {
        let report: Report
        /// Every session of this split, oldest first.
        let split: [SplitPoint]
        /// The previous session of the SAME split. Every delta on the page is
        /// against this and nothing else — comparing a leg day against the
        /// upper day that happened to precede it turns a tonnage delta into
        /// noise with a sign on it.
        let previous: Summary?
        /// Estimated, always, and stamped as such: the local mirror carries no
        /// `calories_burned` column until Track E's HealthKit wave lands.
        let calories: CalorieEstimate?
        /// Measured average heart rate. Nil until `HKWorkout` reads land
        /// (§7.4) — the cell says "—" rather than borrowing the heart rate of a
        /// cardio bout that happened to share the date.
        let avgBpm: Double?
        /// The tag row: plan, phase week and lever, each resolved FOR THIS
        /// DATE and not for today. A session logged in week 3 of the cut still
        /// says so after the block has moved on.
        let planLabel: String
        let week: WeekPhase?
        let lever: NutritionLever?
        let maintenance: Bool

        /// Tonnage against the previous same-split session. Nil when there is
        /// no comparable session — a reserved line, never a zero.
        var tonnageDelta: Double? {
            guard let previous, previous.tonnageKg > 0 else { return nil }
            return report.tonnageKg - previous.tonnageKg
        }

        var setsDelta: Int? {
            guard let previous else { return nil }
            return report.sets - previous.sets
        }

        var durationDelta: Double? {
            guard let previous, let was = previous.durationMin, let now = report.session.durationMin else { return nil }
            return now - was
        }

        /// The verdict sentence over the Progression chart.
        var verdict: String {
            guard let previous, previous.tonnageKg > 0 else {
                return "First \(SessionAnalysis.dayLabel(report.session.dayKey) ?? "session") on record."
            }
            let delta = report.tonnageKg - previous.tonnageKg
            let pct = delta / previous.tonnageKg * 100
            let when = LogicalDay.date(fromISO: previous.date).map { $0.formatted(.dateTime.day().month(.abbreviated)) } ?? previous.date
            if abs(pct) < 1 { return "Level with \(when)." }
            return delta > 0
                ? "Up \(jsIntegerString(jsRound(abs(pct))))% on \(when)."
                : "Down \(jsIntegerString(jsRound(abs(pct))))% on \(when)."
        }
    }

    /// The page, or nil when the id names nothing.
    static func page(database: AppDatabase, sessionId: String) -> Page? {
        guard let session = try? database.session(id: sessionId),
              let ledger = try? database.historySets(),
              let sessions = try? database.sessionHistory()
        else { return nil }

        let rows = ledger.filter { $0.sessionId == sessionId }
        let ids = Set(rows.map(\.exerciseId))
        let history = ledger.filter { ids.contains($0.exerciseId) }
        let cardio = (try? database.cardio(sessionId: session.id, date: session.date)) ?? []
        let built = report(session, rows: rows, history: history, cardio: cardio)

        // The split's line, oldest first. `summaries` replays the whole ledger
        // in order, so a record beaten last month still counts on the session
        // that set it — which is exactly what a gold point on the chart means.
        let mine = summaries(sessions, ledger: ledger)
            .filter { $0.dayKey == session.dayKey }
            .sorted { $0.date == $1.date ? $0.id < $1.id : $0.date < $1.date }
        let index = mine.firstIndex { $0.id == session.id }

        let goals: UserGoalRow? = (try? database.read { db in
            try UserGoalRow.filter(Column("user_id") == session.userId).fetchOne(db)
        }) ?? nil
        let bodyweight: Double? = ((try? database.latestBodyReading(userId: session.userId, before: session.date)) ?? nil)?.weightKg
        let today = LogicalDay.today()

        return Page(
            report: built,
            split: mine.map {
                SplitPoint(sessionId: $0.id, date: $0.date, tonnageKg: $0.tonnageKg, prCount: $0.prCount)
            },
            previous: index.flatMap { $0 > 0 ? mine[$0 - 1] : nil },
            calories: Estimates.estimateCalories(durationMin: session.durationMin, samples: [], bodyweightKg: bodyweight),
            avgBpm: nil,
            planLabel: Programs.plan(id: goals?.activePlan ?? "")?.label ?? Program.onyx5.label,
            week: Phases.weekPhase(weekStart: Week.start(of: session.date, startDay: Week.startDay(fromEndDay: goals?.weekEndDay))),
            lever: Levers.leverForDate(
                session.date, stored: goals?.activeLever, today: today, releaseEndsOn: goals?.maintenanceUntil
            ).flatMap { Levers.lever(byId: $0.rawValue) },
            maintenance: Maintenance.isMaintenanceDate(
                session.date, stored: goals?.activeLever, until: goals?.maintenanceUntil, today: today
            )
        )
    }

    /// Session-best estimated 1RM per exercise across every session it appears
    /// in — the 40×16 sparkline in a ledger header, and the Library's rows.
    ///
    /// Returns the values only: a sparkline has no axis, so the dates are not
    /// wanted and carrying them would invite somebody to label one.
    static func sparkline(_ rows: [HistorySetRow]) -> [Double] {
        sessionBestE1rm(rows).map(\.kg)
    }
}
