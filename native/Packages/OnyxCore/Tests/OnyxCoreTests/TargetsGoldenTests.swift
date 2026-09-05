import Foundation
import Testing
@testable import OnyxCore

// ─────────────────────────────────────────────────────────────────────────────
// Wave 2.5 — MacroMath, the target resolver and the week window, replayed from
// `npm run golden`.
// ─────────────────────────────────────────────────────────────────────────────

@Suite("MacroMath — the TypeScript twin")
struct MacroMathGoldenTests {
    /// `{ calories: n } | { protein: n } | { carbs: n } | { fat: n }`.
    struct EditIn: Decodable {
        let calories: Double?, protein: Double?, carbs: Double?, fat: Double?
        var edit: MacroMath.Edit {
            if let calories { return .calories(calories) }
            if let protein { return .protein(protein) }
            if let carbs { return .carbs(carbs) }
            return .fat(fat!)
        }
    }
    struct In: Decodable { let current: MacroMath.Macros; let edited: EditIn }

    @Test("adjust matches, case for case")
    func matches() throws {
        let fixture = try GoldenFixture<In, MacroMath.Macros>.load("macro-math")
        #expect(fixture.cases.count > 200)
        for c in fixture.cases {
            let out = MacroMath.adjust(c.input.current, edited: c.input.edited.edit)
            expectClose(out.kcal, c.expected.kcal, "kcal — \(c.name)")
            expectClose(out.protein, c.expected.protein, "protein — \(c.name)")
            expectClose(out.carbs, c.expected.carbs, "carbs — \(c.name)")
            expectClose(out.fat, c.expected.fat, "fat — \(c.name)")
        }
    }
}

@Suite("Targets — the resolved chain")
struct TargetsGoldenTests {
    struct In: Decodable { let sources: TargetSources; let date: String; let today: String }

    @Test("resolve matches on every date and source")
    func resolveMatches() throws {
        let fixture = try GoldenFixture<In, ResolvedTargets>.load("resolved-targets")
        #expect(fixture.cases.count > 80)
        for c in fixture.cases {
            #expect(Targets.resolve(c.input.sources, date: c.input.date, today: c.input.today) == c.expected, "resolveTargets — \(c.name)")
        }
    }

    struct StoredIn: Decodable { let stored: [TargetProfile] }

    @Test("mergedProfiles matches")
    func profilesMatch() throws {
        for c in try GoldenFixture<StoredIn, [TargetProfile]>.load("merged-profiles").cases {
            #expect(Targets.profiles(stored: c.input.stored) == c.expected, "mergedProfiles — \(c.name)")
        }
    }
}

@Suite("WeekWindow — the week as the settings cut it")
struct WeekWindowGoldenTests {
    struct In: Decodable { let date: String; let startDay: Int; let today: String }

    @Test("weekWindowOf matches")
    func matches() throws {
        let fixture = try GoldenFixture<In, WeekWindow>.load("week-window")
        #expect(fixture.cases.count > 60)
        for c in fixture.cases {
            #expect(WeekWindow(containing: c.input.date, startDay: c.input.startDay, today: c.input.today) == c.expected, "weekWindowOf — \(c.name)")
        }
    }

    @Test("shifted steps whole weeks and keeps the start day")
    func shifted() {
        let w = WeekWindow(containing: "2026-09-05", startDay: 1, today: "2026-09-05")
        #expect(w.start == "2026-08-31")
        #expect(w.shifted(by: -1, today: "2026-09-05")?.start == "2026-08-24")
        #expect(w.shifted(by: 1, today: "2026-09-05")?.isCurrent == false)
        #expect(WeekWindow(containing: "garbage", startDay: 0, today: "2026-09-05").shifted(by: 1, today: "2026-09-05") == nil)
    }
}
