import Foundation
import HelixCore

// MARK: - The render gate's fixture
//
// One full-scope snapshot, every optional populated, frozen at a fixed date.
// The tiles are photographed from this (`PreviewHarness` → `widgets`) so a diff
// in `native/__screenshots__` is a diff of the DRAWING and never of the data.
// Previews and the package tests read the same value; nothing here is real.

public extension HelixSnapshot {
  /// The moment `sample` was "generated". Build tile entries against this date
  /// rather than `Date()`, or every fixture renders as hours stale.
  static let sampleDate = HelixSnapshot.timestamp("2026-09-03T08:15:00.000Z")!

  static let sample: HelixSnapshot = {
    let today = "2026-09-03"
    func days(_ back: Int) -> String {
      let cal = Calendar(identifier: .gregorian)
      let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = .current
      let base = f.date(from: today)!
      return f.string(from: cal.date(byAdding: .day, value: -back, to: base)!)
    }
    func series(_ values: [Double], step: Int = 1) -> [Point] {
      values.enumerated().map { i, v in Point(d: days((values.count - 1 - i) * step), v: v) }
    }

    // Six weeks of the Helix-5 rotation ending today (a Wednesday session).
    let rotation: [(String, String)?] = [
      ("cb_a", "Chest & Back A"), ("legs_a", "Legs & Core A"), ("arms", "Delts & Arms"), nil,
      ("cb_b", "Chest & Back B"), ("legs_b", "Legs & Core B"), nil,
    ]
    let calendar: [CalendarDay] = (0..<42).reversed().map { back in
      let slot = rotation[(41 - back) % 7]
      let logged = slot != nil && back > 0 && back % 9 != 4
      return CalendarDay(
        d: days(back), dayKey: slot?.0, label: slot?.1,
        scheduled: slot != nil, logged: logged,
        volumeKg: logged ? 6200 + Double((41 - back) * 37 % 900) : nil)
    }

    return HelixSnapshot(
      date: today,
      generatedAt: "2026-09-03T08:15:00.000Z",
      scope: "full",
      battery: 72,
      score: 81,
      sleep: Sleep(
        minutes: 437, deepMin: 68, remMin: 92, coreMin: 251, awakeMin: 26, score: 84,
        startTime: "2026-09-02T22:41:00.000Z", endTime: "2026-09-03T06:04:00.000Z",
        goalMin: 480, trend: series([412, 455, 398, 470, 431, 402, 437])),
      weight: Weight(
        kg: 64.3, deltaKg: -0.4, measuredOn: today, targetKg: 62, prevWeekMeanKg: 65.1,
        trend: series([66.1, 65.9, 65.8, 65.4, 65.5, 65.2, 64.9, 65.0, 64.8, 64.7, 64.6, 64.5, 64.7, 64.3])),
      macros: Macros(
        kcal: 1240, kcalGoal: 1955, proteinG: 128, proteinGoalG: 170, carbsG: 121, carbsGoalG: 195,
        fatG: 38, fatGoalG: 55, kcalTrend: series([1980, 1870, 2110, 1940, 1790, 1905, 1240])),
      water: Water(ml: 1900, goalMl: 3000, trend: series([2800, 3100, 2600, 3000, 2400, 2900, 1900])),
      steps: Steps(
        count: 7412, goal: 10000, distanceM: 5630, activeKcal: 412,
        trend: series([10200, 8600, 11400, 9100, 7300, 12100, 7412])),
      workout: Workout(
        label: "Delts & Arms", dayKey: "arms", logged: false, isRestDay: false,
        plannedExercises: 7, plannedSets: 21, lastVolumeKg: 5840),
      week: Week(sessions: 2, volumeKg: 13400, prs: 3, sets: 44, sessionTarget: 5),
      weekPrev: WeekTotals(sessions: 5, volumeKg: 31200, prs: 1, sets: 108),
      records: [
        Record(exercise: "Incline DB Press", axis: "weight", value: 32.5, reps: 8, achievedOn: days(1)),
        Record(exercise: "Hack Squat", axis: "e1rm", value: 148.2, reps: nil, achievedOn: days(2)),
        Record(exercise: "Neutral-Grip Lat Pulldown", axis: "volume", value: 780, reps: nil, achievedOn: days(2)),
        Record(exercise: "Hanging Knee Raise", axis: "reps", value: 18, reps: 18, achievedOn: days(4)),
      ],
      e1rm: [
        E1rm(exercise: "Incline DB Press", kg: 41.2, deltaKg: 1.6, trend: series([38.9, 39.4, 40.1, 40.6, 41.2], step: 6)),
        E1rm(exercise: "Hack Squat", kg: 148.2, deltaKg: 4.1, trend: series([141.0, 143.7, 144.2, 147.0, 148.2], step: 6)),
        E1rm(exercise: "Lat Pulldown", kg: 88.5, deltaKg: -0.8, trend: series([89.1, 90.0, 88.9, 89.3, 88.5], step: 6)),
        E1rm(exercise: "DB Shoulder Press", kg: 27.9, deltaKg: 0.0, trend: series([27.5, 27.9, 28.1, 27.7, 27.9], step: 6)),
      ],
      volumeByFamily: [
        FamilyVolume(family: "Chest", kg: 3900, sets: 12), FamilyVolume(family: "Back", kg: 4300, sets: 13),
        FamilyVolume(family: "Shoulders", kg: 1200, sets: 6), FamilyVolume(family: "Arms", kg: 900, sets: 7),
        FamilyVolume(family: "Legs", kg: 2600, sets: 4), FamilyVolume(family: "Core", kg: 500, sets: 2),
      ],
      today: nil,
      streak: Streak(current: 51, best: 51),
      context: DayContext(mode: "travel", label: "Travel"),
      cardio: Cardio(
        last: Cardio.Session(kind: "walk", date: days(1), distanceM: 5200, durationMin: 52, paceMinPerKm: 10.0),
        weekSessions: 1, weekTarget: 2, weekMinutes: 52,
        trend: series([0, 35, 0, 0, 44, 0, 52])),
      calendar: calendar,
      volumeTrend: series([28100, 29400, 30200, 27800, 31000, 30100, 31200, 13400], step: 7),
      body: Body(
        fatPct: 14.8, muscleKg: 50.3, smmKg: 26.8, ffmKg: 53.1,
        fatPctDelta: -0.3, muscleKgDelta: 0.1, smmKgDelta: 0.0, ffmKgDelta: 0.2,
        fatTrend: series([15.9, 15.7, 15.8, 15.5, 15.4, 15.3, 15.1, 15.2, 15.0, 14.9, 15.0, 14.9, 14.8, 14.8])),
      scores: Scores(sleep: 84, nutrition: 76, activity: 71, workout: 90, recovery: 83),
      readiness: Readiness(level: "ready", label: "Ready to train", color: "#3DFFB0",
                           reason: "HRV above baseline and a full night's sleep."),
      vitals: Vitals(
        hrvMs: Vital(value: 54, baseline: 49, trend: series([47, 51, 46, 50, 52, 49, 54])),
        restingBpm: Vital(value: 52, baseline: 55, trend: series([56, 55, 57, 54, 55, 53, 52])),
        wristTempDeltaC: Vital(value: 0.12, baseline: -0.05, trend: series([-0.1, 0.0, -0.05, -0.08, 0.02, 0.05, 0.12])),
        bloodOxygenPct: Vital(value: 97.4, baseline: 97.1, trend: series([97.0, 97.3, 96.9, 97.2, 97.0, 97.5, 97.4])),
        respiratoryRate: Vital(value: 14.2, baseline: 14.6, trend: series([14.8, 14.5, 14.9, 14.4, 14.6, 14.3, 14.2]))))
  }()
}
