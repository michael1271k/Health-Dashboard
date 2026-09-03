import Foundation

/// The Sleep Debt Bank — a port of `src/lib/sleep/debt.ts`. The clock is
/// injected: nights strictly before `weekAgoISO` decay to 75 %.
public struct SleepNight: Codable, Sendable, Equatable {
    public var date: String
    public var sleepMinutes: Double?
    public init(date: String, sleepMinutes: Double?) { self.date = date; self.sleepMinutes = sleepMinutes }
}

public struct SleepDebt: Codable, Sendable, Equatable {
    public var debtHours: Double
    public var nights: Int
    public var worstNightMin: Double?
    public var goalHours: Double
}

public enum SleepDebtBank {
    public static let windowDays = 14
    public static let weeklyDecay = 0.75

    public static func compute(_ nights: [SleepNight], goalHours: Double, weekAgoISO: String) -> SleepDebt {
        let withData = nights.filter { ($0.sleepMinutes ?? 0) > 0 }
        let asc = withData.enumerated().sorted { a, b in a.element.date != b.element.date ? a.element.date < b.element.date : a.offset < b.offset }.map(\.element)
        var debt = 0.0
        var worst: Double? = nil
        for n in asc {
            let mins = n.sleepMinutes!
            if worst == nil || mins < worst! { worst = mins }
            let deltaH = goalHours - mins / 60
            let weight = n.date < weekAgoISO ? weeklyDecay : 1
            debt = max(0, debt + deltaH * weight)
        }
        return SleepDebt(debtHours: jsRound(debt * 10) / 10, nights: withData.count, worstNightMin: worst, goalHours: goalHours)
    }

    /// ≤ 2 h ember, ≤ 5 h gold, else oxide.
    public static func band(_ debtHours: Double) -> String {
        if debtHours <= 2 { return "ember" }
        if debtHours <= 5 { return "gold" }
        return "oxide"
    }
}
