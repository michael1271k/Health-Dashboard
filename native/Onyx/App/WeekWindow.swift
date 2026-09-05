import Foundation
import OnyxCore
import OnyxData

/// The app's reading of `OnyxCore.WeekWindow` (§6.4): the setting it is cut
/// on, and the labels the History and Workout screens draw from it. The value
/// itself — the seven dates, the number, `isCurrent` — lives in OnyxCore
/// beside `Week`, so the export and the screens cannot disagree about which
/// Saturday a week ended on.
extension WeekWindow {

    init(containing dateISO: String, startDay: Int) {
        self.init(containing: dateISO, startDay: startDay, today: LogicalDay.today())
    }

    /// The setting, read from the goals row the whole app already observes.
    ///
    /// `user_goals.week_end_day` is the column — the END day — and
    /// `Week.startDay(fromEndDay:)` is the one conversion. Settings writes it,
    /// the Workout tab's This-week panel reads it, the weekly export reads it,
    /// and so does History.
    static func startDay(from goals: UserGoalRow?) -> Int {
        Week.startDay(fromEndDay: goals?.weekEndDay)
    }

    init(containing dateISO: String, goals: UserGoalRow?) {
        self.init(containing: dateISO, startDay: Self.startDay(from: goals))
    }

    /// `Week 7`, or the phase's own label for a week before Week 0.
    var label: String { Week.label(ofWeekStart: start) }

    /// The phase this week sits in, and with it the era (Onyx or PPL).
    var phase: WeekPhase? { Phases.weekPhase(weekStart: start) }

    /// The window `count` weeks after this one — negative walks back.
    func offset(byWeeks count: Int) -> WeekWindow? { shifted(by: count, today: LogicalDay.today()) }

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

    /// `M` — the one-letter column head over a day cell. Locale's own narrow
    /// symbol, so a locale whose week runs Saturday-first still gets its own
    /// letters rather than an English initial.
    static func initial(_ dateISO: String) -> String {
        guard let date = LogicalDay.date(fromISO: dateISO) else { return "·" }
        return String(date.formatted(.dateTime.weekday(.narrow)).prefix(1))
    }
}
