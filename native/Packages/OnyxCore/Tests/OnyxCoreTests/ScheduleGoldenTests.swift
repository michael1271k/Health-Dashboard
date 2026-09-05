import Foundation
import Testing
@testable import OnyxCore

// ─────────────────────────────────────────────────────────────────────────────
// Schedule — the layout algebra, the pure schedule core and the swap planner,
// replayed from `npm run golden`; then the rules those modules exist to keep.
//
// The resolver every swap vector uses is `Schedule.scheduleDayIn` over the
// vector's own context, with `pinned` dates taking precedence — so the swap
// suite also drives the context port through every case.
// ─────────────────────────────────────────────────────────────────────────────

/// A fixture read through `JSONSerialization`, for the `parseLayout` cases
/// whose input is an untyped stored payload rather than a decodable struct.
private func loadRaw(_ name: String) throws -> [[String: Any]] {
    guard let url = Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures") else {
        throw GoldenError.missing(name)
    }
    let root = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
    return root["cases"] as! [[String: Any]]
}

struct Resolver: Decodable {
    let ctx: ScheduleContext
    let pinned: [String: ScheduleDay?]?

    var resolve: ResolveDay {
        let ctx = ctx, pinned = pinned ?? [:]
        return { d in
            if let entry = pinned[d] { return entry }
            return Schedule.scheduleDayIn(ctx, d)
        }
    }

    var resolveWith: @Sendable (String, DayLayout) -> ScheduleDay? {
        let ctx = ctx
        return { d, layout in
            var c = ctx; c.layout = layout
            return Schedule.scheduleDayIn(c, d)
        }
    }
}

@Suite("Schedule layout — the permanent weekday tier")
struct ScheduleLayoutGoldenTests {
    struct In: Decodable { let fn: String; let program: String?; let dayKey: String?; let layout: DayLayout?; let weekday: Int? }
    struct DaySummary: Decodable, Equatable { let key: String; let label: String; let sub: String?; let weekday: Int }
    struct Out: Decodable {
        let layout: DayLayout?; let weekday: Int?; let dayKey: String?; let flag: Bool?; let text: String?; let day: DaySummary?
    }

    @Test("every layout function matches, on all three decks")
    func layoutMatches() throws {
        let fixture = try GoldenFixture<In, Out>.load("schedule-layout")
        let raw = try loadRaw("schedule-layout")
        #expect(fixture.cases.count > 150)
        for (i, c) in fixture.cases.enumerated() {
            let program = c.input.program.flatMap(Program.byId)
            let layout = c.input.layout ?? [:]
            switch c.input.fn {
            case "parseLayout":
                let input = raw[i]["input"] as! [String: Any]
                #expect(ScheduleLayout.parseLayout(input["raw"]) == c.expected.layout, "\(c.name)")
            case "effectiveWeekday":
                let day = try #require(program?.day(key: c.input.dayKey!))
                #expect(ScheduleLayout.effectiveWeekday(day, layout) == c.expected.weekday, "\(c.name)")
            case "dayKeyForWeekday":
                #expect(ScheduleLayout.dayKeyForWeekday(program!, layout, c.input.weekday!) == c.expected.dayKey, "\(c.name)")
            case "programDayIn":
                let d = ScheduleLayout.programDayIn(program!, layout, c.input.weekday!)
                #expect(d.map { DaySummary(key: $0.key, label: $0.label, sub: $0.sub, weekday: $0.weekday) } == c.expected.day, "\(c.name)")
            case "fullLayout":
                #expect(ScheduleLayout.fullLayout(program!, layout) == c.expected.layout, "\(c.name)")
            case "moveDay":
                #expect(ScheduleLayout.moveDay(program!, layout, c.input.dayKey!, c.input.weekday!) == c.expected.layout, "\(c.name)")
            case "isAuthoredLayout":
                #expect(ScheduleLayout.isAuthoredLayout(program!, layout) == c.expected.flag, "\(c.name)")
            case "canonicalLayout":
                #expect(ScheduleLayout.canonicalLayout(layout) == c.expected.text, "\(c.name)")
            default:
                Issue.record("unknown fn \(c.input.fn)")
            }
        }
    }

    @Test("moveDay is a bijection: no two days share a weekday and the set of days never changes")
    func moveDayIsABijection() {
        for program in Program.all {
            let keys = Set(program.days.map(\.key))
            let starts: [DayLayout] = [[:], [program.days[0].key: 3], ScheduleLayout.moveDay(program, [:], program.days[1].key, 6)]
            for start in starts {
                for a in program.days { for wa in 0...6 {
                    let once = ScheduleLayout.moveDay(program, start, a.key, wa)
                    #expect(Set(once.keys) == keys, "\(program.id): days changed after \(a.key)→\(wa)")
                    #expect(Set(once.values).count == once.count, "\(program.id): a weekday is shared after \(a.key)→\(wa)")
                    for b in program.days { for wb in 0...6 {
                        let twice = ScheduleLayout.moveDay(program, once, b.key, wb)
                        #expect(Set(twice.keys) == keys)
                        #expect(Set(twice.values).count == twice.count, "\(program.id): \(a.key)→\(wa) then \(b.key)→\(wb) shares a weekday")
                    } }
                } }
            }
        }
    }
}

@Suite("Schedule context — the pure core")
struct ScheduleContextGoldenTests {
    struct In: Decodable { let ctx: ScheduleContext; let date: String }
    struct Out: Decodable { let day: ScheduleDay?; let training: Bool; let sessionTarget: Int; let era: Era }

    @Test("scheduleDayIn, isTrainingDayIn, sessionTargetIn and eraForDate match on every case")
    func contextMatches() throws {
        let fixture = try GoldenFixture<In, Out>.load("schedule-context")
        #expect(fixture.cases.count > 50)
        for c in fixture.cases {
            #expect(Schedule.scheduleDayIn(c.input.ctx, c.input.date) == c.expected.day, "scheduleDayIn — \(c.name)")
            #expect(Schedule.isTrainingDayIn(c.input.ctx, c.input.date) == c.expected.training, "isTrainingDayIn — \(c.name)")
            #expect(Schedule.sessionTargetIn(c.input.ctx) == c.expected.sessionTarget, "sessionTargetIn — \(c.name)")
            #expect(Era.forDate(c.input.date) == c.expected.era, "eraForDate — \(c.name)")
        }
    }

    @Test("every deck in the catalogue is reachable by id, and the ids are the web's")
    func catalogueIsComplete() {
        #expect(Program.all.map(\.id) == ["apex51", "axis4", "ppl"])
        #expect(Set(Program.all.map(\.id)) == Set(Programs.all.map(\.id)))
        for p in Program.all { #expect(Program.byId(p.id) == p) }
        #expect(Program.byId("bogus") == nil)
    }
}

@Suite("Swap — rest days, exchanges, blocks and the permanent tier")
struct SwapGoldenTests {
    struct In: Decodable {
        let fn: String; let date: String?; let resolver: Resolver?; let horizon: Int?; let dayKey: String?; let naturalDate: String?
        let logged: [LoggedDay]?; let sourceDate: String?; let labels: [String: String]?
        let program: String?; let layout: DayLayout?; let weekday: Int?; let today: String?
    }
    struct RestOut: Decodable {
        let writes: [ScheduleWrite]; let moved: ScheduleDay?; let movedTo: String?; let sameWeek: Bool; let outcome: RestOutcome; let description: String
    }
    struct PermOut: Decodable { let layout: DayLayout?; let writes: [ScheduleWrite]; let pinned: [String]; let block: SwapBlock? }
    struct Out: Decodable {
        let rest: RestOut?; let writes: [ScheduleWrite]?; let block: SwapBlock?; let description: String?
        let permanent: PermOut?; let date: String?; let dates: [String]?; let text: String?
    }

    @Test("every swap function matches, field for field")
    func swapMatches() throws {
        let fixture = try GoldenFixture<In, Out>.load("swap")
        #expect(fixture.cases.count > 90)
        for c in fixture.cases {
            let i = c.input, e = c.expected
            switch i.fn {
            case "planRestDay":
                let plan = i.horizon.map { Swap.planRestDay(i.date!, resolve: i.resolver!.resolve, horizon: $0) }
                    ?? Swap.planRestDay(i.date!, resolve: i.resolver!.resolve)
                let x = try #require(e.rest)
                #expect(plan.writes == x.writes, "writes — \(c.name)")
                #expect(plan.moved == x.moved, "moved — \(c.name)")
                #expect(plan.movedTo == x.movedTo, "movedTo — \(c.name)")
                #expect(plan.sameWeek == x.sameWeek, "sameWeek — \(c.name)")
                #expect(plan.outcome == x.outcome, "outcome — \(c.name)")
                #expect(Swap.describeRestPlan(plan) == x.description, "describeRestPlan — \(c.name)")
            case "planDaySwap":
                #expect(Swap.planDaySwap(i.date!, dayKey: i.dayKey!, resolve: i.resolver!.resolve, naturalDate: i.naturalDate) == e.writes, "\(c.name)")
            case "blockForPlacement":
                let block = Swap.blockForPlacement(i.date!, dayKey: i.dayKey!, logged: i.logged!, sourceDate: i.sourceDate)
                #expect(block == e.block, "block — \(c.name)")
                let labels = i.labels!
                let description = block.map { Swap.describeBlock($0) { k in k.flatMap { labels[$0] } ?? "Session" } }
                #expect(description == e.description, "describeBlock — \(c.name)")
            case "planPermanentMove":
                let plan = Swap.planPermanentMove(
                    program: Program.byId(i.program!)!, layout: i.layout!, dayKey: i.dayKey!, weekday: i.weekday!,
                    todayISO: i.today!, logged: i.logged!, resolveWith: i.resolver!.resolveWith
                )
                let x = try #require(e.permanent)
                #expect(plan.layout == x.layout, "layout — \(c.name)")
                #expect(plan.writes == x.writes, "writes — \(c.name)")
                #expect(plan.pinned == x.pinned, "pinned — \(c.name)")
                #expect(plan.block == x.block, "block — \(c.name)")
            case "dateForWeekday":
                #expect(Swap.dateForWeekday(i.date!, i.weekday!) == e.date, "\(c.name)")
            case "weekDatesOf":
                #expect(Swap.weekDatesOf(i.date!) == e.dates, "\(c.name)")
            case "shortDayLabel":
                #expect(Swap.shortDayLabel(i.date!) == e.text, "\(c.name)")
            default:
                Issue.record("unknown fn \(i.fn)")
            }
        }
    }

    // MARK: The rules

    private static let onyx = ScheduleContext(programId: "apex51", phase: .cut)
    private static func resolver(_ overrides: [String: String] = [:], _ ctx: ScheduleContext = onyx) -> ResolveDay {
        let c = ScheduleContext(programId: ctx.programId, phase: ctx.phase, overrides: overrides, layout: ctx.layout)
        return { Schedule.scheduleDayIn(c, $0) }
    }

    @Test("undo clears both dates: a rest day on a training day is exactly two writes, and the undo set is {date, movedTo}")
    func undoClearsBothDates() {
        let starts: [[String: String]] = [
            [:],
            ["2026-08-04": Schedule.restOverride, "2026-08-05": "arms"],      // a day already moved once
            ["2026-08-05": "cb_a", "2026-08-08": "cb_b"],                    // both rest slots taken → next week
        ]
        for overrides in starts {
            let resolve = Self.resolver(overrides)
            for date in Swap.weekDatesOf("2026-08-05") where resolve(date) != nil {
                let plan = Swap.planRestDay(date, resolve: resolve)
                #expect(plan.outcome == .swapped, "\(date) should find a slot inside the horizon")
                #expect(plan.writes.count == 2, "\(date): a swap is TWO rows — the rest row and the moved row, never one")
                let movedTo = plan.movedTo
                #expect(movedTo != nil && movedTo != date)
                #expect(Set(plan.writes.map(\.date)) == Set([date, movedTo ?? ""]), "\(date): undo must clear both dates")
                #expect(plan.writes.first == ScheduleWrite(date: date, dayKey: Schedule.restOverride))
                #expect(plan.writes.last?.dayKey == plan.moved?.dayKey)
            }
        }
        // And the two degenerate outcomes write ONE row or none — never a moved row without a rest row.
        let already = Swap.planRestDay("2026-08-05", resolve: Self.resolver())
        #expect(already.outcome == .alreadyRest && already.writes.isEmpty)
        var packed: [String: String] = [:]
        for i in 0...14 { packed[ISODate.addDays("2026-08-04", i)!] = "cb_a" }
        let dropped = Swap.planRestDay("2026-08-04", resolve: Self.resolver(packed))
        #expect(dropped.outcome == .noSlot && dropped.writes == [ScheduleWrite(date: "2026-08-04", dayKey: Schedule.restOverride)])
    }

    @Test("planDaySwap never destroys a session: the week's multiset of dayKeys is preserved, or grows by the restored day")
    func daySwapNeverDestroysASession() {
        let week = Swap.weekDatesOf("2026-08-05")
        func sessions(_ resolve: ResolveDay) -> [String] {
            week.compactMap { resolve($0)?.dayKey }.sorted()
        }
        let starts: [[String: String]] = [
            [:],
            ["2026-08-04": Schedule.restOverride, "2026-08-05": "arms"],      // arms moved to Wednesday
            ["2026-08-07": Schedule.restOverride, "2026-08-08": "legs_b"],    // legs_b moved to Saturday
            ["2026-08-04": Schedule.restOverride],                            // arms dropped (a no-slot rest)
            ["2026-08-05": "cb_a", "2026-08-08": "cb_b"],                     // both rest slots hold sessions
        ]
        for overrides in starts {
            let before = sessions(Self.resolver(overrides))
            for date in week {
                for day in Program.onyx5.days {
                    let natural = Swap.dateForWeekday(date, day.weekday)
                    let resolve = Self.resolver(overrides)
                    var next = overrides
                    for w in Swap.planDaySwap(date, dayKey: day.key, resolve: resolve, naturalDate: natural) { next[w.date] = w.dayKey }
                    let after = sessions(Self.resolver(next))
                    // Every session that was in the week is still in it…
                    var remaining = after
                    for k in before {
                        if let idx = remaining.firstIndex(of: k) { remaining.remove(at: idx) }
                        else { Issue.record("\(overrides) · \(day.key) onto \(date): \(k) was destroyed") }
                    }
                    // …and the only thing that can be added is the day being placed.
                    #expect(remaining.allSatisfy { $0 == day.key }, "\(overrides) · \(day.key) onto \(date): gained \(remaining)")
                    #expect(remaining.count <= 1)
                }
            }
        }
    }
}
