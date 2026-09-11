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
    /// The vector's sources predate `periods` and carry only the day profiles;
    /// the rungs came from `Levers.all` then. Both are rows now, so the
    /// founder's go in beside the vector's own.
    struct SourcesIn: Decodable {
        let own: LeverGoals; let waterMl: Double?; let sleepHours: Double?
        let activeLever: String?; let maintenanceUntil: String?; let dayTarget: DailyTarget?; let profiles: [TargetProfile]
        var sources: TargetSources {
            TargetSources(own: own, waterMl: waterMl, sleepHours: sleepHours, activeLever: activeLever, maintenanceUntil: maintenanceUntil,
                          dayTarget: dayTarget, profiles: profiles + FounderTables.rungProfiles, periods: FounderTables.periods)
        }
    }
    struct In: Decodable { let sources: SourcesIn; let date: String; let today: String }

    @Test("resolve matches on every date and source")
    func resolveMatches() throws {
        let fixture = try GoldenFixture<In, ResolvedTargets>.load("resolved-targets")
        #expect(fixture.cases.count > 80)
        for c in fixture.cases {
            // Before the first period the vector expects the founder's default
            // rung (deleted); the user's own numbers are the answer now.
            guard c.input.date >= FounderTables.periods[0].from else { continue }
            let sources = c.input.sources.sources
            let actual = Targets.resolve(sources, date: c.input.date, today: c.input.today)
            // `custom` was the `LeverId` case for "no rung — my own numbers"; it
            // reads as nil now. And the built-in day profiles are gone, so only
            // a profile the sources STORE can be the matched one.
            var expected = c.expected
            if expected.leverId == "custom" { expected.leverId = nil }
            if let key = expected.profileKey, !c.input.sources.profiles.contains(where: { $0.key == key }) { expected.profileKey = nil }
            #expect(actual == expected, "resolveTargets — \(c.name)")
        }
    }

    struct StoredIn: Decodable { let stored: [TargetProfile] }

    /// The built-in tail of the vector (`home`, `restaurant`) was the founder's
    /// rows compiled in; since W2 the picker is the stored day profiles alone,
    /// so only the stored prefix of the expectation still applies.
    @Test("mergedProfiles matches on the stored prefix")
    func profilesMatch() throws {
        for c in try GoldenFixture<StoredIn, [TargetProfile]>.load("merged-profiles").cases {
            let storedKeys = Set(c.input.stored.map(\.key))
            #expect(Targets.profiles(stored: c.input.stored) == c.expected.filter { storedKeys.contains($0.key) }, "mergedProfiles — \(c.name)")
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
        let weekZero = Week.anchor(planStartedOn: FounderTables.planStartISO)
        for c in fixture.cases {
            let w = WeekWindow(containing: c.input.date, startDay: c.input.startDay, today: c.input.today, weekZero: weekZero)
            // The vector predates `weekZero`; the anchor is an input now.
            #expect(w.start == c.expected.start && w.end == c.expected.end && w.days == c.expected.days, "weekWindowOf — \(c.name)")
            #expect(w.number == c.expected.number && w.isCurrent == c.expected.isCurrent, "weekWindowOf — \(c.name)")
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
