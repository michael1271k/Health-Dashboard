import Foundation
import Testing
@testable import HelixCore

// ─────────────────────────────────────────────────────────────────────────────
// The chart series builders and the progression queue — replayed from
// `npm run golden` (Phase 2 §6.5).
// ─────────────────────────────────────────────────────────────────────────────

@Suite("Series builders — the golden vectors")
struct SeriesGoldenTests {
    struct TrendIn: Decodable { let sessions: [[TrendSetRow]]; let timed: Bool; let ceiling: Double? }

    @Test("exerciseTrend matches on every session shape")
    func trendMatches() throws {
        let fixture = try GoldenFixture<TrendIn, ExerciseTrend?>.load("e1rm-series")
        #expect(fixture.cases.count >= 15)
        for c in fixture.cases {
            let actual = E1rmSeries.build(c.input.sessions, timed: c.input.timed, ceiling: c.input.ceiling)
            #expect(actual == c.expected, "exerciseTrend — \(c.name)")
        }
    }

    struct ChipIn: Decodable { let sets: [WorkingSet]; let ceiling: Double? }

    @Test("setsAtCeiling counts only the top load")
    func chipMatches() throws {
        for c in try GoldenFixture<ChipIn, Double>.load("sets-at-ceiling").cases {
            #expect(E1rmSeries.setsAtCeiling(c.input.sets, ceiling: c.input.ceiling) == c.expected, "setsAtCeiling — \(c.name)")
        }
    }

    struct VolumeIn: Decodable { let sessions: [VolumeSession]; let splitDay: String?; let era: String; let limit: Int }

    @Test("sessionVolumeSeries buckets by split and sums a day")
    func volumeMatches() throws {
        let fixture = try GoldenFixture<VolumeIn, [TrendPoint]>.load("session-volume-series")
        #expect(fixture.cases.count > 50)
        for c in fixture.cases {
            let actual = SessionVolumeSeries.build(c.input.sessions, splitDay: c.input.splitDay, era: c.input.era, limit: c.input.limit)
            #expect(actual == c.expected, "sessionVolumeSeries — \(c.name)")
        }
    }

    struct AdherenceIn: Decodable {
        let days: [AdherenceDayIn]; let targets: [String: AdherenceTargets?]; let endingOn: String; let limit: Int
    }

    @Test("macroAdherenceSeries draws the same seven dots")
    func adherenceMatches() throws {
        for c in try GoldenFixture<AdherenceIn, [AdherenceDay]>.load("macro-adherence-series").cases {
            let actual = MacroAdherenceSeries.build(
                c.input.days, targets: c.input.targets.compactMapValues { $0 }, endingOn: c.input.endingOn, limit: c.input.limit
            )
            #expect(actual == c.expected, "macroAdherenceSeries — \(c.name)")
        }
    }

    struct VitalIn: Decodable { let rows: [DatedValue]; let days: Int; let endingOn: String; let combine: WidgetDerive.Combine }

    @Test("vitalSeries pads, drops the future and finds the last move")
    func vitalMatches() throws {
        for c in try GoldenFixture<VitalIn, VitalSeries>.load("vital-series").cases {
            let actual = VitalSeries.build(c.input.rows, days: c.input.days, endingOn: c.input.endingOn, combine: c.input.combine)
            #expect(actual == c.expected, "vitalSeries — \(c.name)")
        }
    }

    struct WindowIn: Decodable { let series: [TrendPoint]; let endingOn: String; let limit: Int }

    @Test("paddedWindow matches, including the refusals")
    func windowMatches() throws {
        for c in try GoldenFixture<WindowIn, [DatedValue]>.load("padded-window").cases {
            #expect(WidgetDerive.paddedWindow(c.input.series, endingOn: c.input.endingOn, limit: c.input.limit) == c.expected, "paddedWindow — \(c.name)")
        }
    }
}

@Suite("Progression queue — the golden vectors")
struct ProgressionQueueGoldenTests {
    /// The web's joined row, as the fixture spells it.
    struct Row: Decodable {
        struct Session: Decodable { let started_at: String; let day_key: String? }
        let exercise_id: String; let weight_kg: Double; let reps: Double; let set_type: String?; let workout_sessions: Session

        var set: ProgressionQueue.SetRow {
            .init(exerciseId: exercise_id, weightKg: weight_kg, reps: reps, setType: set_type,
                  startedAt: workout_sessions.started_at, dayKey: workout_sessions.day_key)
        }
    }
    struct QueueIn: Decodable { let phase: ProgramPhase; let targets: [ProgressionQueue.Target]; let rows: [Row] }

    @Test("the queue matches over the Helix-5 deck in both phases")
    func queueMatches() throws {
        let fixture = try GoldenFixture<QueueIn, [ProgressionQueue.Alert]>.load("progression-queue")
        #expect(fixture.cases.contains { !$0.expected.isEmpty })
        for c in fixture.cases {
            let actual = ProgressionQueue.alerts(targets: c.input.targets, rows: c.input.rows.map(\.set), program: .helix5, phase: c.input.phase)
            #expect(actual == c.expected, "progressionAlerts — \(c.name)")
        }
    }
}
