import Foundation
import GRDB
import OnyxCore
import Testing
@testable import OnyxData

/// The export gate, variant B: `weekly-export.json`'s rich case is a hand-made
/// renderer fixture (an exercise with a top load and no sets, a rest target
/// that differs from its plan, "Onyx-5" as a programme label) and cannot be
/// seeded back into tables. So this seeds ONE week of real rows and asserts the
/// builder's `WeeklyExportInput` equals a hand-written one; string equality then
/// follows from OnyxCore's own vector test over `WeeklyExport.build`.
@Suite("Weekly export builder")
struct WeeklyExportBuilderTests {
    private let user = "u1"
    private let weekStart = "2026-08-23"

    private func iso(_ s: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)!
    }

    private func seeded() throws -> AppDatabase {
        let db = try AppDatabase.inMemory(deviceId: "device-a")
        let t = iso("2026-08-23T00:00:00Z")
        try db.writer.write { conn in
            try UserGoalRow(
                id: "g1", userId: user, sleepGoalHours: 8, calorieGoal: 1999, proteinGoalG: 170, carbsGoalG: 206,
                fatGoalG: 55, stepsGoal: 10_000, waterGoalMl: 3000, contextMode: "normal", createdAt: t, updatedAt: t,
                autoLogSupplements: false, activeProgram: "onyx5", dayCutoffHour: 4, unitSystem: "metric",
                reduceMotion: false, timezone: "UTC", activePlan: "onyx5", activePhase: "cut", trackRpe: true,
                activeLever: "custom"
            ).insert(conn)
            // Thursday (cb_b) swapped to rest.
            try ScheduleOverrideRow(userId: user, date: "2026-08-27", dayKey: "rest", updatedAt: t).insert(conn)
            try PlanPhaseVolumeRow(userId: user, planId: "onyx5", phase: "cut", muscle: "Quads", targetSets: 12).insert(conn)

            try Exercise(id: "ex-lp", name: "Leg Press").insert(conn)
            try Exercise(id: "ex-rc", name: "Reverse Crunch").insert(conn)
            try Exercise(id: "ex-lr", name: "Single Arm Lateral Raise (Cable)").insert(conn)

            // A session the week before — the ordinal's base and a ledger row.
            try WorkoutSession(id: "s0", userId: user, dayKey: "legs_a", date: "2026-08-18", startedAt: iso("2026-08-18T09:00:00Z")).insert(conn)
            try WorkoutSet(id: "z1", sessionId: "s0", exerciseId: "ex-lp", setIndex: 0, weightKg: 70, reps: 12).insert(conn)

            try WorkoutSession(id: "s1", userId: user, dayKey: "legs_a", date: "2026-08-24",
                               startedAt: iso("2026-08-24T09:02:00Z"), endedAt: iso("2026-08-24T10:20:00Z"),
                               durationMin: 78, sessionRpe: 8.5).insert(conn)
            try WorkoutSet(id: "a1", sessionId: "s1", exerciseId: "ex-lp", setIndex: 0, weightKg: 40, reps: 15, setType: "warmup").insert(conn)
            try WorkoutSet(id: "a2", sessionId: "s1", exerciseId: "ex-lp", setIndex: 1, weightKg: 75, reps: 12, rpe: 8.5).insert(conn)
            try WorkoutSet(id: "a3", sessionId: "s1", exerciseId: "ex-lp", setIndex: 2, weightKg: 75, reps: 12, rpe: 9.5).insert(conn)
            try WorkoutSet(id: "a4", sessionId: "s1", exerciseId: "ex-lp", setIndex: 3, weightKg: 75, reps: 10, setType: "failure", rpe: 10).insert(conn)
            // A stored 0 on unloaded work is a legacy artefact, not an estimate.
            try WorkoutSet(id: "a5", sessionId: "s1", exerciseId: "ex-rc", setIndex: 4, weightKg: 0, reps: 17, est1rmKg: 0, rpe: 8).insert(conn)
            try WorkoutSet(id: "a6", sessionId: "s1", exerciseId: "ex-rc", setIndex: 5, weightKg: 0, reps: 15).insert(conn)
            for (axis, value, reps, kg, key) in [("weight", 75.0, 12, 75.0, "Leg Press"), ("e1rm", 105.0, 12, 75.0, "Leg Press"), ("reps", 17.0, 17, 0.0, "Reverse Crunch")] {
                try PersonalRecordRow(userId: user, exerciseKey: key, axis: axis, value: value, reps: reps, weightKg: kg,
                                      sessionId: "s1", achievedOn: "2026-08-24").insert(conn)
            }

            try WorkoutSession(id: "s2", userId: user, dayKey: "arms", date: "2026-08-25",
                               startedAt: iso("2026-08-25T18:00:00Z"), durationMin: 55).insert(conn)
            let lr: [(String, Double, Int, String, String, String?, Double?)] = [
                ("b1", 5, 15, "left", "p1", nil, 8), ("b2", 5, 17, "right", "p1", nil, 9),
                ("b3", 5, 14, "left", "p2", "failure", nil), ("b4", 5, 16, "right", "p2", nil, nil),
                ("b5", 5, 14, "left", "p3", "ghost", nil), ("b6", 5, 14, "right", "p3", "ghost", nil),
            ]
            for (i, (id, kg, reps, side, pair, type, rpe)) in lr.enumerated() {
                try WorkoutSet(id: id, sessionId: "s2", exerciseId: "ex-lr", setIndex: i, weightKg: kg, reps: reps,
                               setType: type ?? "normal", side: side, pairId: pair, rpe: rpe).insert(conn)
            }

            try DailyLogRow(id: "d1", userId: user, date: "2026-08-23", steps: 8000, waterMl: 1234, sleepMinutes: 480,
                            weightKg: 65, bmi: 21.5, activeEnergy: 400, bodyFatPct: 17, standingMinutes: 55,
                            avgHeartRate: 70, avgRestHeartRate: 52, respiratoryRate: 14.5, bloodOxygen: 97, bmr: 1500,
                            createdAt: t, updatedAt: t, hrvMs: 60, exerciseMinutes: 30, standHours: 12, vo2max: 46.1,
                            wristTempDelta: 0.2, timeInDaylightMin: 40, distanceM: 6000, muscleMassKg: 50.1,
                            skeletalMuscleMassKg: 26.8, estimatedWaistToHipRatio: 0.85,
                            nutritionEstimated: false, sleepOnsetTrouble: false).insert(conn)
            try DailyLogRow(id: "d2", userId: user, date: "2026-08-24", steps: 11_000, sleepMinutes: 470,
                            createdAt: t, updatedAt: t, weighinSkipReason: "Sick", nutritionException: "Illness",
                            nutritionEstimated: false, sleepOnsetTrouble: true).insert(conn)
            try DailyLogRow(id: "d3", userId: user, date: "2026-08-25", steps: 8000, waterMl: 2400, weightKg: 64,
                            createdAt: t, updatedAt: t, nutritionEstimated: true, sleepOnsetTrouble: false).insert(conn)

            try NutritionEntryRow(id: "n1", userId: user, loggedAt: t, date: "2026-08-23", mealType: "daily",
                                  calories: 2000, proteinG: 170, carbsG: 206, fatG: 55, fiberG: 30, createdAt: t,
                                  micros: JSONText(raw: #"{"sodium":2400,"vitaminC":80}"#)).insert(conn)
            try NutritionEntryRow(id: "n2", userId: user, loggedAt: t, date: "2026-08-24", mealType: "daily",
                                  calories: 1800, proteinG: 150, carbsG: 200, fatG: 45, createdAt: t).insert(conn)
            // A meal row: not the day's total, never read.
            try NutritionEntryRow(id: "n3", userId: user, loggedAt: t, date: "2026-08-25", mealType: "breakfast",
                                  calories: 500, proteinG: 30, carbsG: 50, fatG: 20, createdAt: t).insert(conn)
            try WaterIntakeRow(id: "w1", userId: user, loggedAt: t, date: "2026-08-23", amountMl: 500, createdAt: t).insert(conn)
            try WaterIntakeRow(id: "w2", userId: user, loggedAt: t, date: "2026-08-23", amountMl: 1500, createdAt: t).insert(conn)
            try WaterIntakeRow(id: "w3", userId: user, loggedAt: t, date: "2026-08-24", amountMl: 1000, createdAt: t).insert(conn)

            try CustomSupplementRow(id: "c1", userId: user, name: "Creatine Monohydrate", dose: "5 g", time: "15:00",
                                    schedule: JSONText(raw: #"{"key":"creatine","slot":"Lunch"}"#),
                                    micros: JSONText(raw: #"{"creatine":5000}"#), createdAt: iso("2026-08-01T00:00:00Z")).insert(conn)
            try CustomSupplementRow(id: "c2", userId: user, name: "Caffeine", dose: "200 mg", time: "11:45",
                                    schedule: JSONText(raw: #"{"key":"caffeine","trainingOnly":true}"#),
                                    createdAt: iso("2026-08-02T00:00:00Z")).insert(conn)
            try CustomSupplementRow(id: "c3", userId: user, name: "Omega-3", dose: "2 caps", time: "15:00",
                                    schedule: JSONText(raw: #"{"key":"omega3","days":[0,1]}"#),
                                    createdAt: iso("2026-08-03T00:00:00Z")).insert(conn)
            try SupplementLogRow(userId: user, date: "2026-08-24", itemKey: "caffeine", taken: false, updatedAt: t).insert(conn)
            try SupplementLogRow(userId: user, date: "2026-08-23", itemKey: "creatine", taken: true, updatedAt: t).insert(conn)

            try DomsLogRow(id: "dm1", userId: user, date: "2026-08-25", muscleGroup: "quads", severity: 3, createdAt: t,
                           sourceSessionId: "s1", sourceDayKey: "legs_a").insert(conn)
            try DomsLogRow(id: "dm2", userId: user, date: "2026-08-25", muscleGroup: "glutes", severity: 2, createdAt: t.addingTimeInterval(1)).insert(conn)
            try FatigueLogRow(id: "f1", userId: user, date: "2026-08-24", slot: "pre", level: 2, createdAt: t).insert(conn)
            try FatigueLogRow(id: "f2", userId: user, date: "2026-08-24", slot: "waking", level: 3, createdAt: t.addingTimeInterval(1)).insert(conn)
            try FatigueLogRow(id: "f3", userId: user, date: "2026-08-24", slot: "bogus", level: 5, createdAt: t.addingTimeInterval(2)).insert(conn)
            try FatigueLogRow(id: "f4", userId: user, date: "2026-08-26", slot: "midday", level: 4, createdAt: t).insert(conn)

            try BodyCompositionRow(id: "bc1", userId: user, measuredAt: t, date: "2026-08-25", weightKg: 64, bodyFatPct: 16.8,
                                   waterPct: 58.6, boneMassKg: 2.7, bmi: 21.4, createdAt: t, fatMassKg: 10.9,
                                   bodyWaterMassKg: 38, musclePct: 40, proteinPct: 18, boneMineralPct: 4.1,
                                   skeletalMuscleMassKg: 26.9).insert(conn)
            try CardioLogRow(id: "cl1", userId: user, date: "2026-08-26", kind: "walk", distanceM: 5000, durationMin: 50, kcal: 250, createdAt: t).insert(conn)
            try CardioLogRow(id: "cl2", userId: user, date: "2026-08-29", kind: "run", distanceM: 3000, durationMin: 18, kcal: 200, createdAt: t,
                             activeKcal: 200, totalKcal: 230, avgHr: 150, effort: 7).insert(conn)
            try SleepSessionRow(id: "sl1", userId: user, startTime: iso("2026-08-22T22:30:00Z"), endTime: iso("2026-08-23T06:30:00Z"),
                                durationMin: 480, deepMin: 60, remMin: 100, coreMin: 300, awakeMin: 20, createdAt: t).insert(conn)
            try SleepSessionRow(id: "sl2", userId: user, startTime: iso("2026-08-24T00:15:00Z"), endTime: iso("2026-08-24T07:00:00Z"),
                                durationMin: 405, deepMin: 40, remMin: 90, coreMin: 280, awakeMin: 10, createdAt: t).insert(conn)
            try DailyTargetRow(userId: user, date: "2026-08-27", kcal: 2400, updatedAt: t, profileKey: "restaurant",
                               trackCarbs: false, trackFat: false).insert(conn)
            // The battery the app showed on the Monday — v8's Derived block reads it.
            var score = DailyScoreRow(id: "sc1", userId: user, date: "2026-08-24", score: 70, computedAt: t, finalized: true)
            score.batteryPct = 41
            try score.insert(conn)
        }
        return db
    }

    @Test func assemblesTheHandWrittenInput() throws {
        let db = try seeded()
        let got = try WeeklyExportBuilder(database: db, userId: user).input(weekStart: weekStart, today: weekStart)
        let want = try JSONDecoder().decode(WeeklyExportInput.self, from: Data(Self.expected.utf8))

        // Section by section first, so a miss names its section.
        #expect(got.weekLabel == want.weekLabel)
        #expect(got.programLabel == want.programLabel)
        #expect(got.targetPeriods == want.targetPeriods)
        for (g, w) in zip(got.days, want.days) { #expect(g == w, "day \(w.date)") }
        #expect(got.days.count == want.days.count)
        #expect(got.sessions == want.sessions)
        #expect(got.volumeByMuscle == want.volumeByMuscle)
        #expect(got.tonnageByMuscle == want.tonnageByMuscle)
        #expect(got.doms == want.doms)
        #expect(got.fatigue == want.fatigue)
        #expect(got.bodyComp == want.bodyComp)
        #expect(got.cardio == want.cardio)
        #expect(got.supplementProtocol == want.supplementProtocol)
        #expect(got.ledger == want.ledger)
        #expect(got == want)

        let markdown = WeeklyExport.build(got)
        #expect(markdown.contains("Legs & Core A"))
        #expect(markdown.hasSuffix(WeeklyExport.priorReportNote("Week 6")))
    }

    /// The whole payload, by hand — every field the web's `weekPayload` would
    /// have produced for the rows above.
    static let expected = #"""
    {
      "weekStart": "2026-08-23", "weekEnd": "2026-08-29", "weekLabel": "Week 6",
      "programLabel": "Onyx Cut", "phaseLabel": "Cut",
      "calorieGoal": 1999, "proteinGoalG": 170, "stepsGoal": 10000, "sleepGoalHours": 8, "waterGoalMl": 3000,
      "targetPeriods": [
        {"leverId": "custom", "label": "Custom", "goals": {"calorie": 1999, "protein": 170, "carbs": 206, "fat": 55, "steps": 10000},
         "dates": ["2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26"]},
        {"leverId": "custom", "label": "Custom", "goals": {"calorie": 2400, "protein": 170, "steps": 10000}, "dates": ["2026-08-27"]},
        {"leverId": "custom", "label": "Custom", "goals": {"calorie": 1999, "protein": 170, "carbs": 206, "fat": 55, "steps": 10000},
         "dates": ["2026-08-28", "2026-08-29"]}
      ],
      "days": [
        {"date": "2026-08-23", "weekdayLabel": "Sun", "isTrainingDay": true,
         "weightKg": 65, "calories": 2000, "proteinG": 170, "carbsG": 206, "fatG": 55, "steps": 8000, "distanceM": 6000,
         "sleepMin": 480, "deepMin": 60, "remMin": 100, "restingHr": 52, "hrvMs": 60, "wristTempDeltaC": 0.2, "bloodOxygenPct": 97,
         "avgHr": 70, "respiratoryRate": 14.5, "vo2max": 46.1, "daylightMin": 40, "exerciseMin": 30, "standHours": 12, "standMin": 55,
         "coreMin": 300, "awakeMin": 20, "bedTime": "2026-08-22T22:30:00Z", "wakeTime": "2026-08-23T06:30:00Z", "sleepOnsetTrouble": false,
         "waterMl": 2000, "supplementsTaken": 3, "supplementsPlanned": 3,
         "supplementsLog": [{"key": "caffeine", "time": "11:45"}, {"key": "creatine", "time": "15:00"}, {"key": "omega3", "time": "15:00"}],
         "supplementsSkipped": [],
         "nutrientsFood": {"sodium": 2400, "vitaminC": 80, "fiber": 30, "protein": 170},
         "nutrientsStack": {"caffeine": 200, "creatine": 5000, "epa": 1000, "dha": 500},
         "activeKcal": 400, "bmrKcal": 1500, "nutritionEstimated": false, "trackCarbs": true, "trackFat": true},
        {"date": "2026-08-24", "weekdayLabel": "Mon", "isTrainingDay": true,
         "calories": 1800, "proteinG": 150, "carbsG": 200, "fatG": 45, "steps": 11000, "sleepMin": 470, "deepMin": 40, "remMin": 90,
         "coreMin": 280, "awakeMin": 10, "bedTime": "2026-08-24T00:15:00Z", "wakeTime": "2026-08-24T07:00:00Z", "sleepOnsetTrouble": true, "restingHrBaseline": 52, "hrvBaseline": 60, "batteryPct": 41,
         "waterMl": 1000, "supplementsTaken": 2, "supplementsPlanned": 3,
         "supplementsLog": [{"key": "creatine", "time": "15:00"}, {"key": "omega3", "time": "15:00"}],
         "supplementsSkipped": ["Caffeine"],
         "nutrientsFood": {"protein": 150}, "nutrientsStack": {"creatine": 5000, "epa": 1000, "dha": 500},
         "weighInSkipReason": "Sick", "nutritionException": "Illness", "nutritionEstimated": false, "trackCarbs": true, "trackFat": true},
        {"date": "2026-08-25", "weekdayLabel": "Tue", "isTrainingDay": true,
         "weightKg": 64, "steps": 8000, "sleepOnsetTrouble": false, "restingHrBaseline": 52, "hrvBaseline": 60, "waterMl": 2400, "supplementsTaken": 2, "supplementsPlanned": 2,
         "supplementsLog": [{"key": "caffeine", "time": "11:45"}, {"key": "creatine", "time": "15:00"}], "supplementsSkipped": [],
         "nutrientsFood": {}, "nutrientsStack": {"caffeine": 200, "creatine": 5000},
         "nutritionEstimated": true, "trackCarbs": true, "trackFat": true},
        {"date": "2026-08-26", "weekdayLabel": "Wed", "isTrainingDay": false,
         "sleepOnsetTrouble": false, "restingHrBaseline": 52, "hrvBaseline": 60, "supplementsTaken": 1, "supplementsPlanned": 1,
         "supplementsLog": [{"key": "creatine", "time": "15:00"}], "supplementsSkipped": [],
         "nutrientsFood": {}, "nutrientsStack": {"creatine": 5000}, "nutritionEstimated": false, "trackCarbs": true, "trackFat": true},
        {"date": "2026-08-27", "weekdayLabel": "Thu", "isTrainingDay": false,
         "sleepOnsetTrouble": false, "restingHrBaseline": 52, "hrvBaseline": 60, "supplementsTaken": 1, "supplementsPlanned": 1,
         "supplementsLog": [{"key": "creatine", "time": "15:00"}], "supplementsSkipped": [],
         "nutrientsFood": {}, "nutrientsStack": {"creatine": 5000}, "nutritionEstimated": false,
         "targetProfile": "Restaurant", "trackCarbs": false, "trackFat": false},
        {"date": "2026-08-28", "weekdayLabel": "Fri", "isTrainingDay": true,
         "sleepOnsetTrouble": false, "restingHrBaseline": 52, "hrvBaseline": 60, "supplementsTaken": 2, "supplementsPlanned": 2,
         "supplementsLog": [{"key": "caffeine", "time": "11:45"}, {"key": "creatine", "time": "15:00"}], "supplementsSkipped": [],
         "nutrientsFood": {}, "nutrientsStack": {"caffeine": 200, "creatine": 5000}, "nutritionEstimated": false, "trackCarbs": true, "trackFat": true},
        {"date": "2026-08-29", "weekdayLabel": "Sat", "isTrainingDay": false,
         "sleepOnsetTrouble": false, "restingHrBaseline": 52, "hrvBaseline": 60, "supplementsTaken": 1, "supplementsPlanned": 1,
         "supplementsLog": [{"key": "creatine", "time": "15:00"}], "supplementsSkipped": [],
         "nutrientsFood": {}, "nutrientsStack": {"creatine": 5000}, "nutritionEstimated": false, "trackCarbs": true, "trackFat": true}
      ],
      "sessions": [
        {"date": "2026-08-24", "startedAt": "2026-08-24T09:02:00Z", "endedAt": "2026-08-24T10:20:00Z", "sessionNumber": 2,
         "label": "Legs & Core A", "volumeKg": 3150, "setCount": 6, "failureSets": 1, "durationMin": 78,
         "caloriesEstimated": false, "avgBpmEstimated": false, "sessionRpe": 8.5,
         "exercises": [
           {"name": "Leg Press", "restTargetSec": 135, "restPlanSec": 135, "topKg": 75, "repWindow": "8–12", "sets": [
             {"weightKg": 40, "reps": 15, "failure": false, "warmup": true, "ghost": false, "dropset": false},
             {"weightKg": 75, "reps": 12, "rpe": 8.5, "failure": false, "warmup": false, "ghost": false, "dropset": false},
             {"weightKg": 75, "reps": 12, "rpe": 9.5, "failure": false, "warmup": false, "ghost": false, "dropset": false},
             {"weightKg": 75, "reps": 10, "rpe": 10, "failure": true, "warmup": false, "ghost": false, "dropset": false}]},
           {"name": "Reverse Crunch", "restTargetSec": 75, "restPlanSec": 75, "repWindow": "12–15", "sets": [
             {"weightKg": 0, "reps": 17, "rpe": 8, "failure": false, "warmup": false, "ghost": false, "dropset": false},
             {"weightKg": 0, "reps": 15, "failure": false, "warmup": false, "ghost": false, "dropset": false}]}
         ],
         "prs": [
           {"name": "Leg Press", "weightKg": 75, "reps": 12, "axes": ["weight", "e1rm"], "volumeKg": 900, "e1rmKg": 105},
           {"name": "Reverse Crunch", "weightKg": 0, "reps": 17, "axes": ["reps"], "volumeKg": 0}
         ]},
        {"date": "2026-08-25", "startedAt": "2026-08-25T18:00:00Z", "sessionNumber": 3,
         "label": "Delts & Arms", "volumeKg": 145, "setCount": 2, "failureSets": 1, "durationMin": 55,
         "caloriesEstimated": false, "avgBpmEstimated": false,
         "exercises": [
           {"name": "Single Arm Lateral Raise (Cable)", "restTargetSec": 105, "restPlanSec": 105, "topKg": 5, "repWindow": "12–20", "sets": [
             {"weightKg": 5, "reps": 15, "rpe": 8, "side": "L", "pairId": "p1", "failure": false, "warmup": false, "ghost": false, "dropset": false},
             {"weightKg": 5, "reps": 17, "rpe": 9, "side": "R", "pairId": "p1", "failure": false, "warmup": false, "ghost": false, "dropset": false},
             {"weightKg": 5, "reps": 14, "side": "L", "pairId": "p2", "failure": true, "warmup": false, "ghost": false, "dropset": false},
             {"weightKg": 5, "reps": 16, "side": "R", "pairId": "p2", "failure": false, "warmup": false, "ghost": false, "dropset": false},
             {"weightKg": 5, "reps": 14, "side": "L", "pairId": "p3", "failure": false, "warmup": false, "ghost": true, "dropset": false},
             {"weightKg": 5, "reps": 14, "side": "R", "pairId": "p3", "failure": false, "warmup": false, "ghost": true, "dropset": false}]}
         ],
         "prs": []}
      ],
      "volumeByMuscle": [
        {"muscle": "Chest", "sets": 0, "target": 11, "directSets": 0, "indirectSets": 0},
        {"muscle": "Lats", "sets": 0, "target": 6, "directSets": 0, "indirectSets": 0},
        {"muscle": "Upper back", "sets": 0, "target": 4, "directSets": 0, "indirectSets": 0},
        {"muscle": "Lower back", "sets": 0, "target": 1, "directSets": 0, "indirectSets": 0},
        {"muscle": "Front delts", "sets": 0, "target": 4, "directSets": 0, "indirectSets": 0},
        {"muscle": "Side delts", "sets": 3, "target": 7, "directSets": 3, "indirectSets": 0},
        {"muscle": "Rear delts", "sets": 0, "target": 2, "directSets": 0, "indirectSets": 0},
        {"muscle": "Biceps", "sets": 0, "target": 8, "directSets": 0, "indirectSets": 0},
        {"muscle": "Triceps", "sets": 0, "target": 6, "directSets": 0, "indirectSets": 0},
        {"muscle": "Forearms", "sets": 0, "target": 4, "directSets": 0, "indirectSets": 0},
        {"muscle": "Quads", "sets": 4, "target": 12, "directSets": 4, "indirectSets": 0},
        {"muscle": "Hamstrings", "sets": 2, "target": 8, "directSets": 0, "indirectSets": 2},
        {"muscle": "Glutes", "sets": 2, "target": 6, "directSets": 0, "indirectSets": 2},
        {"muscle": "Adductors", "sets": 0, "target": 0, "directSets": 0, "indirectSets": 0},
        {"muscle": "Calves", "sets": 0, "target": 6, "directSets": 0, "indirectSets": 0},
        {"muscle": "Abs/core", "sets": 2, "target": 10, "directSets": 2, "indirectSets": 0}
      ],
      "tonnageByMuscle": [
        {"muscle": "Quads", "volumeKg": 3150}, {"muscle": "Hamstrings", "volumeKg": 1575},
        {"muscle": "Glutes", "volumeKg": 1575}, {"muscle": "Side delts", "volumeKg": 145}
      ],
      "doms": [
        {"date": "2026-08-25", "muscle": "glutes", "severity": 2},
        {"date": "2026-08-25", "muscle": "quads", "severity": 3, "sourceLabel": "Legs & Core A", "sourceDate": "2026-08-24"}
      ],
      "fatigue": [
        {"date": "2026-08-24", "slot": "Waking", "level": 3, "label": "Worn"},
        {"date": "2026-08-24", "slot": "Before training", "level": 2, "label": "Fine"},
        {"date": "2026-08-26", "slot": "Midday", "level": 4, "label": "Heavy"}
      ],
      "bodyComp": [
        {"date": "2026-08-23", "weightKg": 65, "bmi": 21.5, "bodyFatPct": 17, "bmr": 1500, "muscleMassKg": 50.1,
         "skeletalMuscleMassKg": 26.8, "estimatedWaistToHipRatio": 0.85},
        {"date": "2026-08-25", "weightKg": 64, "bmi": 21.4, "bodyFatPct": 16.8, "musclePercent": 40, "waterPercent": 58.6,
         "boneMineral": 4.1, "fatMassKg": 10.9, "proteinPercent": 18, "boneMineralKg": 2.7, "waterMassKg": 38, "skeletalMuscleMassKg": 26.9}
      ],
      "cardio": [
        {"date": "2026-08-26", "kind": "walk", "distanceM": 5000, "durationMin": 50, "kcal": 250},
        {"date": "2026-08-29", "kind": "run", "distanceM": 3000, "durationMin": 18, "kcal": 200, "totalKcal": 230, "avgHr": 150, "effort": 7}
      ],
      "supplementProtocol": [
        {"time": "15:00", "name": "Creatine Monohydrate", "dose": "5 g"},
        {"time": "11:45", "name": "Caffeine", "dose": "200 mg", "trainingOnly": true},
        {"time": "15:00", "name": "Omega-3", "dose": "2 caps"}
      ],
      "ledger": [
        {"label": "Week 0", "weekStart": "2026-07-12", "totals": {}},
        {"label": "Week 1", "weekStart": "2026-07-19", "totals": {}},
        {"label": "Week 2", "weekStart": "2026-07-26", "totals": {}},
        {"label": "Week 3", "weekStart": "2026-08-02", "totals": {}},
        {"label": "Week 4", "weekStart": "2026-08-09", "totals": {}},
        {"label": "Week 5", "weekStart": "2026-08-16", "totals": {"totalVolumeKg": 840}},
        {"label": "Week 6", "weekStart": "2026-08-23", "totals": {"avgKcal": 1900, "totalVolumeKg": 3295, "avgSteps": 9000,
         "cardioMinutes": 68, "avgWaterMl": 1800, "avgWeightKg": 64.5}}
      ]
    }
    """#
}
