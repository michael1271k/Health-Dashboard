import Foundation
import Testing
import GRDB
import OnyxCore
import OnyxData
@testable import Onyx

/// The screenshot harness has no compiled deck to fall back on since W2: a
/// preview store that fails to seed photographs an empty plan. This is the
/// check that the seed lands.
@Suite("Preview catalogue")
struct PreviewCatalogueTests {
    @Test("the template decks, phases, rungs and periods land as rows")
    func seeds() throws {
        let db = try AppDatabase.inMemory(deviceId: "shot")
        PreviewCatalogue.seed(db)
        PreviewCatalogue.seedStack(db)
        let ctx = try db.scheduleContext(userId: PreviewCatalogue.userId)
        #expect(ctx.plans.count == 3)
        #expect(ctx.program(id: "onyx5")?.days.count == 5)
        #expect(ctx.phases.count == 8)
        #expect(ctx.weekZeroStart == "2026-07-12")
        let ladder = try db.leverLadder(userId: PreviewCatalogue.userId)
        #expect(ladder.rungs.count == 4)
        #expect(ladder.periods.count == 5)
        #expect(try db.phaseGoals(userId: PreviewCatalogue.userId, planId: "onyx5", phase: .cut)?.calorieGoal == 1955)
        #expect(try db.volumeTargets(userId: PreviewCatalogue.userId, planId: "onyx5", phase: .cut).values.reduce(0, +) == 93)
    }
}

@Suite("Settings model over the preview store")
struct SettingsModelPreviewTests {
    @MainActor @Test("the harness model sees the plans, the rungs and the goals")
    func modelSeesTheCatalogue() async throws {
        let model = PreviewHarness.seededModel()
        let task = Task { await model.observe() }
        defer { task.cancel() }
        for _ in 0..<100 where model.plans.isEmpty || model.goals == nil {
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(model.failure == nil, "\(model.failure ?? "")")
        #expect(model.plans.map(\.id) == ["onyx5", "onyx4", "ppl"])
        #expect(model.rungs.count == 3)
        #expect(model.goals?.calorieGoal == 1955)
        #expect(model.preset.calorieGoal == 1955)
        #expect(model.volumeTotal == 93)
    }
}
