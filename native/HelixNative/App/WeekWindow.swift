import Foundation
import HelixCore
import HelixData

/// One week, cut where the user says a week starts (§6.4).
///
/// ── WHY A TYPE AND NOT `Week.start(of:startDay:)` EVERYWHERE ────────────────
/// `Week` already answers "which Sunday (or Monday) does this date belong to",
/// and every caller that needed only that has been calling it directly. What
/// History needs is the whole window at once — the seven dates, the programme
/// number, whether it is the week you are standing in — and three screens
/// deriving those from one another with their own `addDays` is exactly how the
/// web app came to disagree with itself about which Saturday a week ended on.
///
/// So this is a value, not a helper: build one, hand it around, and every
/// number on the screen comes from the same cut. Changing "Week starts on" in
/// Settings changes `startDay`, every window rebuilds, and the History list,
/// the capsule labels and the day strips all re-cut together — which is the
/// whole reason decision 13 says the reset is DERIVED and nothing is written.
///
/// ponytail: lives in the app target, mirroring §6.4's shape. Track E's 2.5
/// promotes it into `HelixCore/Time/` beside `Week`; nothing here changes when
/// it does except the import it is found through.
struct WeekWindow: Equatable, Hashable, Identifiable, Sendable {

    /// 0 = Sunday, 1 = Monday. The setting, already converted.
    let startDay: Int
    /// The first date of the window, `YYYY-MM-DD`.
    let start: String
    /// The LAST date of the window, inclusive — not the next week's first.
    /// An exclusive end is what produces the off-by-one where a Saturday
    /// session lands in next week's capsule.
    let end: String

    var id: String { start }

    init(containing dateISO: String, startDay: Int) {
        self.startDay = startDay
        let start = Week.start(of: dateISO, startDay: startDay)
        self.start = start
        self.end = ISODate.addDays(start, 6) ?? start
    }

    /// The seven dates, oldest first. Always seven: a partial week at either
    /// end of history is still a week with days nothing happened on, and a
    /// strip that draws five dots because five days had rows is the padding
    /// bug §2.2 already caught once in `dailySeries`.
    var days: [String] {
        (0..<7).compactMap { ISODate.addDays(start, $0) }
    }

    /// The programme week number — Week 0 is the half week the block opened on.
    var number: Int { Int(jsRound(Week.number(ofWeekStart: start))) }

    /// `Week 7`, or the phase's own label for a week before Week 0.
    var label: String { Week.label(ofWeekStart: start) }

    /// The phase this week sits in, and with it the era (Helix or PPL).
    var phase: WeekPhase? { Phases.weekPhase(weekStart: start) }

    func contains(_ dateISO: String) -> Bool { dateISO >= start && dateISO <= end }

    func isCurrent(on today: String = LogicalDay.today()) -> Bool { contains(today) }

    /// The window `count` weeks before this one — negative walks forward.
    func offset(byWeeks count: Int) -> WeekWindow? {
        guard let date = ISODate.addDays(start, count * 7) else { return nil }
        return WeekWindow(containing: date, startDay: startDay)
    }

    /// `30 Aug – 5 Sep`. One month name when the week does not straddle two.
    var rangeLabel: String {
        guard let from = LogicalDay.date(fromISO: start), let to = LogicalDay.date(fromISO: end) else {
            return "\(start) – \(end)"
        }
        let sameMonth = String(start.prefix(7)) == String(end.prefix(7))
        let left = sameMonth
            ? from.formatted(.dateTime.day())
            : from.formatted(.dateTime.day().month(.abbreviated))
        return "\(left) – \(to.formatted(.dateTime.day().month(.abbreviated)))"
    }
}

extension WeekWindow {
    /// The setting, read from the goals row the whole app already observes.
    ///
    /// `user_goals.week_end_day` is the column — the END day — and
    /// `Week.startDay(fromEndDay:)` is the one conversion. Settings writes it,
    /// the Workout tab's This-week panel reads it, the weekly export reads it,
    /// and now so does History.
    static func startDay(from goals: UserGoalRow?) -> Int {
        Week.startDay(fromEndDay: goals?.weekEndDay)
    }

    init(containing dateISO: String, goals: UserGoalRow?) {
        self.init(containing: dateISO, startDay: Self.startDay(from: goals))
    }

    /// `M` — the one-letter column head over a day cell. Locale's own narrow
    /// symbol, so a locale whose week runs Saturday-first still gets its own
    /// letters rather than an English initial.
    static func initial(_ dateISO: String) -> String {
        guard let date = LogicalDay.date(fromISO: dateISO) else { return "·" }
        return String(date.formatted(.dateTime.weekday(.narrow)).prefix(1))
    }
}
