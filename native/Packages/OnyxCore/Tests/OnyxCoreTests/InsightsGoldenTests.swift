import Foundation
import Testing
@testable import OnyxCore

@Suite("Coach insights — deterministic analytics")
struct InsightsGoldenTests {
    struct MathIn: Decodable { let xs: [Double]; let ys: [Double] }
    struct MathOut: Decodable { let meanX: Double; let pearson: Double?; let slopeY: Double?; let rolling7: [Double]; let rolling3: [Double] }

    @Test("mean, pearson, the slope and the rolling average match")
    func mathMatches() throws {
        for c in try GoldenFixture<MathIn, MathOut>.load("insight-math").cases {
            expectClose(Insights.mean(c.input.xs), c.expected.meanX, "mean — \(c.name)")
            expectClose(Insights.pearson(c.input.xs, c.input.ys), c.expected.pearson, "pearson — \(c.name)")
            expectClose(Insights.linregSlope(c.input.ys), c.expected.slopeY, "linregSlope — \(c.name)")
            let r7 = Insights.rollingAverage(c.input.ys), r3 = Insights.rollingAverage(c.input.ys, window: 3)
            #expect(r7.count == c.expected.rolling7.count, "rolling7 length — \(c.name)")
            for (a, e) in zip(r7, c.expected.rolling7) { expectClose(a, e, "rolling7 — \(c.name)") }
            #expect(r3.count == c.expected.rolling3.count, "rolling3 length — \(c.name)")
            for (a, e) in zip(r3, c.expected.rolling3) { expectClose(a, e, "rolling3 — \(c.name)") }
        }
    }

    struct In: Decodable { let days: [DayPoint]; let sessions: [SessionPoint]; let contextMode: String?; let todayISO: String; let limit: Int }
    struct Out: Decodable {
        let gapDays: Double?; let trainingGap: Insight?; let fuelVsForce: Insight?; let stall: Insight?
        let insights: [Insight]; let all: [Insight]
    }

    @Test("every builder and the ranked set match, sentence for sentence")
    func insightsMatch() throws {
        let fixture = try GoldenFixture<In, Out>.load("insights")
        #expect(fixture.cases.count > 25)
        for c in fixture.cases {
            let i = c.input
            expectClose(Insights.daysSinceLastSession(i.sessions, todayISO: i.todayISO), c.expected.gapDays, "daysSinceLastSession — \(c.name)")
            #expect(Insights.trainingGap(i.sessions, todayISO: i.todayISO) == c.expected.trainingGap, "trainingGap — \(c.name)")
            #expect(Insights.fuelVsForce(i.days, i.sessions) == c.expected.fuelVsForce, "fuelVsForce — \(c.name)")
            #expect(Insights.stallProtocol(i.days, i.sessions) == c.expected.stall, "stallProtocol — \(c.name)")
            #expect(Insights.compute(days: i.days, sessions: i.sessions, contextMode: i.contextMode, todayISO: i.todayISO, limit: i.limit) == c.expected.insights, "computeInsights — \(c.name)")
            #expect(Insights.compute(days: i.days, sessions: i.sessions, contextMode: i.contextMode, todayISO: i.todayISO, limit: 99) == c.expected.all, "computeInsights(99) — \(c.name)")
        }
    }

    @Test("toLocaleString groups thousands the en-US way")
    func localeString() {
        #expect(jsLocaleString(8329) == "8,329")
        #expect(jsLocaleString(1234567) == "1,234,567")
        #expect(jsLocaleString(999) == "999")
        #expect(jsLocaleString(0) == "0")
        #expect(jsLocaleString(-12345) == "-12,345")
    }
}
