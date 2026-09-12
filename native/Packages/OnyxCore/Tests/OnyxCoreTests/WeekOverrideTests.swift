import Foundation
import Testing
@testable import OnyxCore

/// The week tier: seven rows edited at once, for the week the gym is shut.
@Suite("Week override — the holiday fix")
struct WeekOverrideTests {

    /// Sun 2026-09-06 … Sat 2026-09-12.
    private let week = ["2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09",
                        "2026-09-10", "2026-09-11", "2026-09-12"]
    private let rest = Schedule.restOverride

    /// The plan: train Mon/Tue/Thu/Fri, rest Sun/Wed/Sat.
    private var plan: WeekAssignment {
        WeekAssignment(dates: week, days: [
            week[0]: rest, week[1]: "push_a", week[2]: "legs_a", week[3]: rest,
            week[4]: "pull_a", week[5]: "legs_b", week[6]: rest,
        ])
    }

    private func planWeek(
        current: WeekAssignment? = nil, draft: WeekAssignment,
        logged: [LoggedDay] = [], scheduled: [String] = ["push_a", "legs_a", "pull_a", "legs_b"]
    ) -> WeekPlan {
        Swap.planWeek(base: plan, current: current ?? plan, draft: draft, logged: logged, scheduled: scheduled)
    }

    // MARK: - The draft

    @Test("placing a day takes it off wherever it was — a key lives on one date")
    func placeMovesRatherThanCopies() {
        var draft = plan
        // The gym shuts Thursday: pull day moves to Wednesday's rest slot.
        draft.place("pull_a", on: week[3])
        #expect(draft.key(on: week[3]) == "pull_a")
        // Thursday is now rest, VISIBLY. It does not silently inherit what
        // Wednesday held — the user can see the empty slot and fill it next.
        #expect(draft.key(on: week[4]) == rest)
        #expect(draft.date(of: "pull_a") == week[3])
        // And nothing else moved.
        #expect(draft.key(on: week[1]) == "push_a")
        #expect(draft.key(on: week[5]) == "legs_b")
    }

    @Test("a nudge leaves every untouched day exactly where the plan put it")
    func untouchedDaysHold() {
        var draft = plan
        draft.place("legs_a", on: week[3])
        let out = planWeek(draft: draft)
        // Two rows: Wednesday gains legs, Tuesday loses them. Not seven.
        #expect(out.writes.map(\.date).sorted() == [week[2], week[3]])
        #expect(out.writes.first { $0.date == week[3] }?.dayKey == "legs_a")
        #expect(out.writes.first { $0.date == week[2] }?.dayKey == rest)
        #expect(out.clears.isEmpty)
        #expect(out.block == nil)
    }

    @Test("resting a day reports the session it leaves homeless")
    func namesTheDroppedSession() {
        var draft = plan
        draft.place(rest, on: week[5])
        let out = planWeek(draft: draft)
        // The week is one session short and says so. A holiday must not be able
        // to delete a leg day in silence — that is the original "Rest Day"
        // bug, one tier up.
        #expect(out.dropped == ["legs_b"])
        #expect(out.writes == [ScheduleWrite(date: week[5], dayKey: rest)])
    }

    @Test("a week that matches the plan writes nothing at all")
    func noChangeIsNoWrite() {
        let out = planWeek(draft: plan)
        #expect(out.isEmpty)
        #expect(out.dropped.isEmpty)
    }

    // MARK: - Clearing, not pinning

    @Test("dragging a day back where it started DELETES the override")
    func returningToPlanClears() {
        // The week already carries a swap: legs moved Tue → Wed.
        var current = plan
        current.place("legs_a", on: week[3])
        // The user puts it back.
        let out = planWeek(current: current, draft: plan)
        #expect(out.clears.sorted() == [week[2], week[3]])
        // Crucially NOT a write of the plan's own value. A pinned row survives
        // a later permanent layout change and holds one date on the old plan
        // forever — the bug `planPermanentMove` writes pins to cause on
        // purpose, and this tier must never cause by accident.
        #expect(out.writes.isEmpty)
    }

    @Test("a date already holding what was asked for is left alone")
    func idempotentAgainstCurrent() {
        var current = plan
        current.place("legs_a", on: week[3])
        let out = planWeek(current: current, draft: current)
        #expect(out.isEmpty)
    }

    // MARK: - What a logged session refuses

    @Test("a date with a session on it cannot be told it held something else")
    func targetLoggedBlocks() {
        var draft = plan
        draft.place("legs_b", on: week[1])
        let out = planWeek(draft: draft, logged: [LoggedDay(date: week[1], dayKey: "push_a")])
        #expect(out.block == .init(kind: .targetLogged, date: week[1], dayKey: "push_a"))
        // The WHOLE confirm is refused, not just that row. Applying the other
        // six and skipping one leaves the week in a shape the user did not ask
        // for and did not see.
        #expect(out.writes.isEmpty)
        #expect(out.clears.isEmpty)
    }

    @Test("a completed day cannot be moved off the date it was performed on")
    func sourceLoggedBlocks() {
        var draft = plan
        draft.place("push_a", on: week[3])
        let out = planWeek(draft: draft, logged: [LoggedDay(date: week[1], dayKey: "push_a")])
        #expect(out.block?.kind == .sourceLogged)
        #expect(out.writes.isEmpty)
    }

    @Test("putting a day back on the plan is refused when the date is logged")
    func returningToPlanRespectsALoggedSession() {
        // The hole the first build left. The clears branch returned early,
        // BEFORE `blockForPlacement`, so this path could delete an override on
        // a date holding a committed session — leaving the schedule claiming
        // Push A on a Monday that ran Legs A, which is precisely the
        // `targetLogged` state the whole rule says is unrepresentable.
        var current = plan
        current.place("legs_a", on: week[1])     // Monday overridden to legs
        let out = planWeek(
            current: current, draft: plan,        // and put back to the plan
            logged: [LoggedDay(date: week[1], dayKey: "legs_a")]
        )
        #expect(out.block?.kind == .targetLogged)
        #expect(out.clears.isEmpty)
        #expect(out.writes.isEmpty)
    }

    @Test("a logged date whose override already MATCHES what was logged still clears")
    func clearingAnOverrideThatAgreesWithTheSessionIsAllowed() {
        // The other half, and it must stay allowed: if Monday's override says
        // push and Monday logged push, removing the row changes nothing about
        // what the date means — `blockForPlacement` returns nil when the
        // incoming key IS what was logged, and that no-op must not be refused.
        var current = plan
        current.place("legs_a", on: week[3])     // Wednesday gained legs
        let out = planWeek(
            current: current, draft: plan,
            logged: [LoggedDay(date: week[1], dayKey: "push_a")]
        )
        #expect(out.block == nil)
        #expect(out.clears.sorted() == [week[2], week[3]])
    }

    @Test("moving a day onto a logged date it ALREADY occupies is not a block")
    func placingWhatIsAlreadyThere() {
        // `blockForPlacement` refuses a target holding a DIFFERENT key. Push on
        // the date push was logged is a no-op, and refusing it would make a
        // logged Monday unable to coexist with any other edit in the week.
        var draft = plan
        draft.place("legs_a", on: week[3])
        let out = planWeek(draft: draft, logged: [LoggedDay(date: week[1], dayKey: "push_a")])
        #expect(out.block == nil)
        #expect(out.writes.count == 2)
    }
}
