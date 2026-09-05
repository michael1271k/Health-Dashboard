import Foundation
import Testing
@testable import OnyxData

// MARK: - The metric map

@Suite("The HealthKit contract")
struct HealthCatalogueTests {

    private func metric(_ key: HealthKey) throws -> HealthMetric {
        try #require(HealthCatalogue.metrics.first { $0.key == key })
    }

    @Test("the two fraction metrics are scaled, and nothing else is")
    func fractionsAreScaled() throws {
        // HealthKit reports both as a 0–1 FRACTION. Stored unscaled, blood
        // oxygen read 0.982 and the card rendered "1%".
        #expect(try metric(.bloodOxygen).scale == 100)
        #expect(try metric(.bodyFat).scale == 100)
        let scaled = HealthCatalogue.metrics.filter { $0.scale != 1 }
        #expect(scaled.count == 2, "a third scale factor is a unit bug, not a feature")
    }

    @Test("LeanBodyMass is fat-free mass and lands nowhere near muscle mass")
    func leanBodyMassIsFatFree() throws {
        let m = try metric(.fatFreeMass)
        #expect(m.identifier == "HKQuantityTypeIdentifierLeanBodyMass")
        // The bug this pins: sent as `lean_mass` it landed in the column the
        // InBody card fills with weight × muscle%, ~2.6 kg lower, and the trend
        // line stepped whenever the source changed.
        #expect(!HealthCatalogue.metrics.contains { $0.key.rawValue == "lean_mass" })
    }

    @Test("the reducers are the ones each metric deserves")
    func reducers() throws {
        // Weekly-ish, so an average over a day of one sample is that sample and
        // over a day of none is nothing. `latest` says so honestly.
        #expect(try metric(.vo2max).reduce == .latest)
        #expect(try metric(.avgRestHeartRate).reduce == .latest)
        #expect(try metric(.avgHeartRate).reduce == .average)
        #expect(try metric(.hrv).reduce == .average)
        // Summed from the source's own entries so the total matches the app the
        // food was logged in — never derived from 4·C + 4·P + 9·F.
        #expect(try metric(.calories).reduce == .sum)
        #expect(try metric(.steps).reduce == .sum)
    }

    @Test("every read type is asked for once, and the map is a subset of it")
    func readTypesAreDeduped() {
        let types = HealthCatalogue.readTypes
        #expect(Set(types).count == types.count, "requestAuthorization would ask twice")
        #expect(Set(HealthCatalogue.metrics.map(\.identifier)).isSubset(of: Set(types)))
        // Sleep is a category type: authorised here, read by its own query.
        #expect(types.contains(HealthCatalogue.sleepIdentifier))
    }

    @Test("rounding scales first, then rounds to the metric's precision")
    func rounding() {
        // The order matters: rounding 0.982 before the ×100 gives 1.
        #expect(HealthCatalogue.round(0.982, reduce: .latest, scale: 100) == 98.2)
        #expect(HealthCatalogue.round(1234.7, reduce: .sum) == 1235)
        #expect(HealthCatalogue.round(64.567, reduce: .average) == 64.57)
        // Absent is absent. A metric this device does not record must not become
        // a zero on the way through.
        #expect(HealthCatalogue.round(nil, reduce: .sum) == nil)
        #expect(HealthCatalogue.round(Double.nan, reduce: .sum) == nil)
    }

    @Test("stand time converts adaptively")
    func standToHours() {
        // Real payloads carry MINUTES (observed: 278, 46)…
        #expect(HealthUnits.standToHours(278) == 5)
        #expect(HealthUnits.standToHours(46) == 1)
        // …but a small value is indistinguishable from Apple's stand-hours ring
        // count and passes through untouched.
        #expect(HealthUnits.standToHours(12) == 12)
        #expect(HealthUnits.standToHours(24) == 24)
        #expect(HealthUnits.standToHours(25) == 0)
        #expect(HealthUnits.standToHours(nil) == nil)
    }
}

// MARK: - The night

@Suite("Sleep aggregation")
struct SleepTests {

    private func at(_ hour: Double) -> Date {
        Date(timeIntervalSince1970: 1_788_000_000 + hour * 3600)
    }

    @Test("overlapping samples are counted once")
    func overlapIsUnioned() {
        // iPhone and Watch both write sleep and their samples overlap. Naive
        // summation is why the app read 9h11m where Apple showed 9h15m.
        let minutes = Sleep.mergedMinutes([
            (at(0), at(2)),
            (at(1), at(3)),
        ])
        #expect(minutes == 180, "two overlapping hours are three hours, not four")
    }

    @Test("adjacent samples join rather than leaving a seam")
    func adjacentJoins() {
        #expect(Sleep.mergedMinutes([(at(0), at(1)), (at(1), at(2))]) == 120)
    }

    @Test("the total is the union of all asleep stages, not the sum of them")
    func totalIsNotTheSumOfStages() {
        // Two sources label the same hour differently — one Core, one REM. A
        // per-stage sum counts that hour twice.
        let night = Sleep.aggregate([
            SleepSample(value: 3, start: at(0), end: at(1)),   // core
            SleepSample(value: 5, start: at(0), end: at(1)),   // rem, same hour
        ])
        let n = try! #require(night)
        #expect(n.coreMin == 60)
        #expect(n.remMin == 60)
        #expect(n.sleepMinutes == 60, "the hour was slept once")
    }

    @Test("awake time is tracked but is not sleep, and inBed is neither")
    func awakeAndInBed() throws {
        let night = try #require(Sleep.aggregate([
            SleepSample(value: 4, start: at(0), end: at(1)),   // deep
            SleepSample(value: 2, start: at(1), end: at(1.5)), // awake
            SleepSample(value: 0, start: at(-1), end: at(3)),  // inBed
        ]))
        #expect(night.deepMin == 60)
        #expect(night.awakeMin == 30)
        #expect(night.sleepMinutes == 60)
        // inBed still widens the bed window — it is when the night began.
        #expect(night.bedStart == at(-1))
        #expect(night.bedEnd == at(3))
    }

    @Test("a night with nothing asleep is nil, never a zero-minute night")
    func nothingSleptIsNil() {
        // A zero would be a claim about the night, and it would overwrite a real
        // reading from another source on the next sync.
        #expect(Sleep.aggregate([]) == nil)
        #expect(Sleep.aggregate([SleepSample(value: 2, start: at(0), end: at(1))]) == nil)
    }

    @Test("consecutive nights tile the timeline and never overlap")
    func windowsTile() throws {
        let first = try #require(NightWindow.range("2026-09-02"))
        let second = try #require(NightWindow.range("2026-09-03"))
        #expect(first.to == second.from, "half-open and exactly 24h wide")
        #expect(second.to.timeIntervalSince(second.from) == 24 * 3600)
        // The bug the tiling prevents: with an overlapping upper bound,
        // yesterday's delete covered tonight's bedtime and destroyed the row
        // today's sync had just written — "Awaiting Sleep Data" after a refresh.
    }

    @Test("a bedtime is filed under the morning it ends on")
    func nightOf() {
        // 20:45 on the 2nd is the night of the 3rd. Filing by the date part of
        // `start_time` would put half of all nights on the wrong day — and only
        // the half you went to bed early on.
        let evening = try! #require(NightWindow.range("2026-09-03")).from.addingTimeInterval(8.75 * 3600)
        #expect(NightWindow.nightOf(evening) == "2026-09-03")
        let morning = try! #require(NightWindow.range("2026-09-03")).to.addingTimeInterval(-3600)
        #expect(NightWindow.nightOf(morning) == "2026-09-03")
    }

    @Test("the fallback bedtime sits inside the window it belongs to")
    func fallbackIsInsideTheWindow() throws {
        let window = try #require(NightWindow.range("2026-09-03"))
        let stamp = try #require(NightWindow.fallbackBedTime("2026-09-03"))
        // The old fallback was an hour PAST the window's end, so the row was
        // written and then invisible to every reader.
        #expect(stamp >= window.from && stamp < window.to)
    }
}
