import Foundation
import Testing
@testable import OnyxCore

// ─────────────────────────────────────────────────────────────────────────────
// The five dashboard series behind W12's tiles, replayed from `npm run golden`.
//
// ── WHY MOST OF THESE COMPARE WITH `==` AND THE EWMA DOES NOT ────────────────
// JavaScript numbers and Swift `Double` are both IEEE-754 binary64, so the
// sums, differences, divisions and least-squares fits below agree bit for bit
// and an exact comparison is the strictest one available. `weightEwma` is the
// exception: it calls `pow`, and a JavaScript engine's `Math.pow` is free to
// differ from libm in the last bit. Its fields go through `expectClose`, whose
// 1e-12 tolerance is far too tight to hide a formula difference — the smallest
// bug this domain has shipped was a percent, not a quadrillionth.
// ─────────────────────────────────────────────────────────────────────────────

@Suite("Consistency — planned against done")
struct ConsistencyGoldenTests {
    struct In: Decodable { let days: [ConsistencyDayIn]; let endingOn: String; let weeks: Int; let startDay: Int }

    @Test("the eight-week grid matches, cell for cell")
    func matches() throws {
        let fixture = try GoldenFixture<In, Consistency>.load("consistency-series")
        #expect(fixture.cases.count >= 10)
        for c in fixture.cases {
            let actual = ConsistencySeries.build(
                c.input.days, endingOn: c.input.endingOn, weeks: c.input.weeks, startDay: c.input.startDay
            )
            #expect(actual == c.expected, "consistencySeries — \(c.name)")
        }
    }

    /// Every window is exactly `weeks × 7` cells whatever the input holds, and
    /// each cell belongs to the week that claims it. A grid that closed up
    /// around a missing day would draw eight weeks as seven and a bit.
    @Test("the grid is always complete and contiguous")
    func gridIsWellFormed() {
        for weeks in [1, 4, 8, 12] {
            for startDay in [0, 1] {
                let c = ConsistencySeries.build([], endingOn: "2026-09-06", weeks: weeks, startDay: startDay)
                // `allSatisfy` is `rethrows`, and a rethrowing call inside
                // `#expect` makes the macro's expansion throwing. Hoisted.
                let sevenEach = c.weeks.allSatisfy { $0.cells.count == 7 }
                #expect(c.weeks.count == weeks)
                #expect(sevenEach)
                for week in c.weeks {
                    #expect(week.cells.first?.date == week.weekStart)
                    #expect(week.cells.last?.date == ISODate.addDays(week.weekStart, 6))
                    #expect(ISODate.weekday(week.weekStart) == startDay)
                }
                for (a, b) in zip(c.weeks, c.weeks.dropFirst()) {
                    #expect(ISODate.addDays(a.weekStart, 7) == b.weekStart)
                }
            }
        }
    }
}

@Suite("Deficit ledger — the prediction against the scale")
struct DeficitLedgerGoldenTests {
    struct In: Decodable { let days: [DeficitDayIn]; let endingOn: String; let weeks: Int; let startDay: Int }

    @Test("the weekly balance and the reconciliation match")
    func matches() throws {
        let fixture = try GoldenFixture<In, DeficitLedger>.load("deficit-ledger")
        #expect(fixture.cases.count >= 10)
        for c in fixture.cases {
            let actual = DeficitLedgerSeries.build(
                c.input.days, endingOn: c.input.endingOn, weeks: c.input.weeks, startDay: c.input.startDay
            )
            #expect(actual == c.expected, "deficitLedgerSeries — \(c.name)")
        }
    }

    /// A day missing any of BMR, active energy or intake must contribute
    /// NOTHING — not a partial expenditure, which would report a deficit ~400
    /// kcal too large in the same direction every time a sync failed.
    @Test("a day with a hole is not counted at all")
    func holesAreNotCounted() {
        let whole = DeficitDayIn(date: "2026-09-01", intakeKcal: 1950, bmrKcal: 1540, activeKcal: 600, weightKg: 65)
        #expect(DeficitLedgerSeries.dayBalanceKcal(whole) != nil)
        for holed in [
            DeficitDayIn(date: whole.date, intakeKcal: nil, bmrKcal: 1540, activeKcal: 600),
            DeficitDayIn(date: whole.date, intakeKcal: 1950, bmrKcal: nil, activeKcal: 600),
            DeficitDayIn(date: whole.date, intakeKcal: 1950, bmrKcal: 1540, activeKcal: nil),
        ] {
            #expect(DeficitLedgerSeries.dayBalanceKcal(holed) == nil)
            let ledger = DeficitLedgerSeries.build([holed], endingOn: "2026-09-06", weeks: 2)
            #expect(ledger.daysCounted == 0)
            #expect(ledger.totalBalanceKcal == nil)
        }
    }
}

@Suite("Goal Board — now with a TypeScript definition behind it")
struct GoalBoardGoldenTests {
    struct In: Decodable {
        let readings: [GoalBoard.Reading]
        let energy: [GoalBoard.EnergyDay]
        let targetWeightKg: Double?
        let rateMinKgWk: Double?
        let rateMaxKgWk: Double?
        let today: String
    }

    @Test("the rate, the arrival, the ledger and the pace all match")
    func matches() throws {
        let fixture = try GoldenFixture<In, GoalBoard>.load("goal-board")
        #expect(fixture.cases.count >= 15)
        for c in fixture.cases {
            let actual = GoalBoard.build(
                readings: c.input.readings, energy: c.input.energy,
                targetWeightKg: c.input.targetWeightKg,
                rateMinKgWk: c.input.rateMinKgWk, rateMaxKgWk: c.input.rateMaxKgWk,
                today: c.input.today
            )
            #expect(actual == c.expected, "goalBoard — \(c.name)")
        }
    }
}

@Suite("Trajectory — the smoothed line and the board behind it")
struct TrajectoryGoldenTests {
    struct EwmaIn: Decodable { let readings: [GoalBoard.Reading]; let halfLifeDays: Double }

    private func expectPoints(_ actual: [TrajectoryPoint], _ expected: [TrajectoryPoint], _ name: String) {
        #expect(actual.count == expected.count, "point count — \(name)")
        for (a, e) in zip(actual, expected) {
            #expect(a.d == e.d, "date — \(name)")
            expectClose(a.raw, e.raw, "raw \(a.d) — \(name)")
            expectClose(a.ewma, e.ewma, "ewma \(a.d) — \(name)")
        }
    }

    @Test("the time-weighted smoothing matches, gap for gap")
    func ewmaMatches() throws {
        let fixture = try GoldenFixture<EwmaIn, [TrajectoryPoint]>.load("weight-ewma")
        #expect(fixture.cases.count >= 10)
        for c in fixture.cases {
            let actual = TrajectorySeries.ewma(c.input.readings, halfLifeDays: c.input.halfLifeDays)
            expectPoints(actual, c.expected, c.name)
        }
    }

    struct In: Decodable {
        let readings: [GoalBoard.Reading]
        let today: String
        let targetWeightKg: Double?
        let rateMinKgWk: Double?
        let rateMaxKgWk: Double?
        let energy: [GoalBoard.EnergyDay]
        let halfLifeDays: Double
    }

    @Test("the whole trajectory matches, including the phase the title flips on")
    func matches() throws {
        for c in try GoldenFixture<In, Trajectory>.load("trajectory-series").cases {
            let actual = TrajectorySeries.build(
                c.input.readings, today: c.input.today, targetWeightKg: c.input.targetWeightKg,
                rateMinKgWk: c.input.rateMinKgWk, rateMaxKgWk: c.input.rateMaxKgWk,
                energy: c.input.energy, halfLifeDays: c.input.halfLifeDays
            )
            expectPoints(actual.points, c.expected.points, c.name)
            #expect(actual.board == c.expected.board, "board — \(c.name)")
            #expect(actual.phaseKind == c.expected.phaseKind, "phaseKind — \(c.name)")
            expectClose(actual.latestEwmaKg, c.expected.latestEwmaKg, "latestEwma — \(c.name)")
        }
    }

    /// A gap must cost the old state its weight. Two readings a fortnight apart
    /// should leave the line essentially on the newer one; two readings a day
    /// apart should leave it near the older. A per-reading α cannot tell the
    /// difference, which is the whole reason this is time-weighted.
    @Test("a fortnight's gap barely inherits and a day's gap barely moves")
    func gapsAreWeighted() throws {
        let near = TrajectorySeries.ewma([
            GoalBoard.Reading(date: "2026-09-01", weightKg: 70),
            GoalBoard.Reading(date: "2026-09-02", weightKg: 60),
        ], halfLifeDays: 10)
        let far = TrajectorySeries.ewma([
            GoalBoard.Reading(date: "2026-09-01", weightKg: 70),
            GoalBoard.Reading(date: "2026-09-15", weightKg: 60),
        ], halfLifeDays: 10)
        let nearSecond = try #require(near.last?.ewma)
        let farSecond = try #require(far.last?.ewma)
        // One day at a ten-day half-life keeps 2^(-0.1) = 93 % of the old
        // state; fourteen days keeps 2^(-1.4) = 38 % of it, so the line has
        // crossed the midpoint towards the new reading. A per-reading alpha
        // would put both at the same place, which is the bug this guards.
        #expect(nearSecond > 69, "one day on, the line has barely left 70 (was \(nearSecond))")
        #expect(farSecond < 65, "a fortnight on, the line is past halfway to 60 (was \(farSecond))")
        #expect(farSecond < nearSecond - 5, "the gap has to cost the old state its weight")
    }
}

@Suite("Battery stack — the charge and the five drains under it")
struct BatteryStackGoldenTests {
    struct In: Decodable { let days: [BatteryStackDayIn]; let endingOn: String; let limit: Int }

    @Test("every day's bands match, holes included")
    func matches() throws {
        let fixture = try GoldenFixture<In, [BatteryStackDay]>.load("battery-stack")
        #expect(fixture.cases.count >= 6)
        for c in fixture.cases {
            let actual = BatteryStackSeries.build(c.input.days, endingOn: c.input.endingOn, limit: c.input.limit)
            #expect(actual == c.expected, "batteryStackSeries — \(c.name)")
        }
    }

    /// The window is a fixed number of consecutive days ending on `endingOn`,
    /// whatever the input holds. A stack that closed up around an unscored day
    /// would draw a fortnight as though it were ten days.
    @Test("the window is exactly `limit` consecutive days")
    func windowIsComplete() {
        for limit in [1, 7, 14, 30] {
            let out = BatteryStackSeries.build([], endingOn: "2026-09-06", limit: limit)
            let allEmpty = out.allSatisfy(\.empty)
            let noDrains = out.allSatisfy { day in BatteryDrain.allCases.allSatisfy { day.drain($0) == 0 } }
            #expect(out.count == limit)
            #expect(out.last?.d == "2026-09-06")
            #expect(allEmpty)
            #expect(noDrains)
            for (a, b) in zip(out, out.dropFirst()) {
                #expect(ISODate.addDays(a.d, 1) == b.d)
            }
        }
    }
}

@Suite("Body composition — four metrics, each on its own readings")
struct BodyCompGoldenTests {
    struct In: Decodable { let readings: [BodyCompReadingIn]; let endingOn: String; let days: Int }

    @Test("the four metrics and their own spans match")
    func matches() throws {
        let fixture = try GoldenFixture<In, [BodyCompMetric]>.load("body-comp-series")
        #expect(fixture.cases.count >= 10)
        for c in fixture.cases {
            let actual = BodyCompSeries.build(c.input.readings, endingOn: c.input.endingOn, days: c.input.days)
            #expect(actual == c.expected, "bodyCompSeries — \(c.name)")
        }
    }

    /// Four metrics, always, in one order — a strip that reordered itself when
    /// the scale skipped a column would be four different tiles.
    @Test("all four are always present, in order")
    func alwaysFour() {
        for readings in [[], [BodyCompReadingIn(date: "2026-09-06", weightKg: 65)]] {
            let out = BodyCompSeries.build(readings, endingOn: "2026-09-06")
            let noDeltas = out.allSatisfy { $0.delta == nil }
            #expect(out.map(\.key) == BodyMetricKey.allCases)
            #expect(noDeltas)
        }
    }
}
