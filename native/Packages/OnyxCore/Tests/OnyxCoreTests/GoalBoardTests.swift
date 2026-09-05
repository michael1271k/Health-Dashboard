import Foundation
import Testing
@testable import OnyxCore

@Suite("Goal Board — the rate, the arrival and the week's ledger")
struct GoalBoardTests {

    /// A cut losing 0.5 kg a week, measured daily from 1 Sep.
    private func cutReadings(days: Int = 21, perDay: Double = -0.5 / 7) -> [GoalBoard.Reading] {
        (0..<days).map { i in
            GoalBoard.Reading(
                date: ISODate.addDays("2026-09-01", i)!,
                weightKg: 70 + perDay * Double(i)
            )
        }
    }

    @Test("under three readings there is no rate — a line through two points is not a trend")
    func needsThree() {
        let two = Array(cutReadings().prefix(2))
        #expect(GoalBoard.weeklyRateKg(two) == nil)
        #expect(GoalBoard.fit(two) == nil)
        #expect(GoalBoard.weeklyRateKg(cutReadings(days: 3)) != nil)
    }

    @Test("the rate is the least-squares slope in kg per week")
    func rate() throws {
        let rate = try #require(GoalBoard.weeklyRateKg(cutReadings()))
        #expect(abs(rate - (-0.5)) < 0.001)
    }

    @Test("a missing weigh-in is dropped, never carried — the slope is unchanged")
    func gapsDoNotFlattenTheSlope() throws {
        var readings = cutReadings()
        readings[3].weightKg = nil
        readings[9].weightKg = nil
        let rate = try #require(GoalBoard.weeklyRateKg(readings))
        #expect(abs(rate - (-0.5)) < 0.001)
    }

    @Test("the ETA counts from the fitted line, not from the last raw reading")
    func eta() throws {
        // 21 days at −0.5/wk from 70.0 puts the line at ~68.57 on the 21st.
        // Eight-and-a-bit weeks of that reaches 64.
        let board = GoalBoard.build(
            readings: cutReadings(), energy: [],
            targetWeightKg: 64, rateMinKgWk: -0.50, rateMaxKgWk: -0.40,
            today: "2026-09-21"
        )
        let weeks = try #require(board.weeksToTarget)
        #expect(abs(weeks - 9.1) < 0.2)
        #expect(board.etaISO == ISODate.addDays("2026-09-21", Int(jsRound(weeks * 7))))
        #expect(board.pace == .onTrack)
    }

    @Test("a cut whose scale is going up has no arrival date")
    func noEtaWhenReversed() {
        let board = GoalBoard.build(
            readings: cutReadings(perDay: 0.1), energy: [],
            targetWeightKg: 64, rateMinKgWk: -0.50, rateMaxKgWk: -0.40,
            today: "2026-09-21"
        )
        #expect(board.weeksToTarget == nil)
        #expect(board.etaISO == nil)
        #expect(board.pace == .reversed)
    }

    @Test("the band is signed: the same rate is over on a cut and under on a bulk")
    func paceIsSigned() {
        #expect(GoalBoard.pace(rate: -0.70, min: -0.50, max: -0.40) == .over)
        #expect(GoalBoard.pace(rate: -0.20, min: -0.50, max: -0.40) == .under)
        #expect(GoalBoard.pace(rate: -0.45, min: -0.50, max: -0.40) == .onTrack)
        #expect(GoalBoard.pace(rate: 0.30, min: 0.20, max: 0.25) == .over)
        #expect(GoalBoard.pace(rate: 0.10, min: 0.20, max: 0.25) == .under)
        #expect(GoalBoard.pace(rate: -0.10, min: 0.20, max: 0.25) == .reversed)
        #expect(GoalBoard.pace(rate: nil, min: 0.20, max: 0.25) == .unknown)
        #expect(GoalBoard.pace(rate: 0.22, min: nil, max: nil) == .unknown)
    }

    @Test("a day with a hole in it contributes nothing to the week's ledger")
    func ledgerIsAllOrNothing() throws {
        let energy = [
            GoalBoard.EnergyDay(date: "2026-09-21", intakeKcal: 1900, tdeeKcal: 2400),
            GoalBoard.EnergyDay(date: "2026-09-22", intakeKcal: 2000, tdeeKcal: 2350),
            // No active-energy sync: `Energy.tdee` returned nil, so this day is
            // a gap and not a 2000 kcal deficit.
            GoalBoard.EnergyDay(date: "2026-09-23", intakeKcal: 2000, tdeeKcal: nil),
        ]
        let board = GoalBoard.build(
            readings: [], energy: energy,
            targetWeightKg: 64, rateMinKgWk: -0.50, rateMaxKgWk: -0.40,
            today: "2026-09-23"
        )
        #expect(board.weekDaysCounted == 2)
        #expect(board.weekBalanceKcal == -850)
    }
}
